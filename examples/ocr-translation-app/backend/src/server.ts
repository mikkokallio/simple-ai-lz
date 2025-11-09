import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import multer from 'multer';
import axios from 'axios';
import session from 'express-session';
import { v4 as uuidv4 } from 'uuid';
import * as appInsights from 'applicationinsights';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient, BlockBlobClient, generateBlobSASQueryParameters, BlobSASPermissions, SASProtocol } from '@azure/storage-blob';
import { OpenAI } from 'openai';
import { DocumentAnalysisClient, AzureKeyCredential } from '@azure/ai-form-recognizer';
import TextTranslationClient, { isUnexpected } from '@azure-rest/ai-translation-text';
import DocumentTranslationClient, { isUnexpected as isUnexpectedDoc } from '@azure-rest/ai-translation-document';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

dotenv.config();

// Initialize Azure clients
const credential = new DefaultAzureCredential();
const storageAccountName = process.env.STORAGE_ACCOUNT_NAME || '';
let blobServiceClient: BlobServiceClient | null = null;
let openaiClient: OpenAI | null = null;
let documentAnalysisClient: DocumentAnalysisClient | null = null;
let translationClient: ReturnType<typeof TextTranslationClient> | null = null;
let documentTranslationClient: ReturnType<typeof DocumentTranslationClient> | null = null;

if (storageAccountName) {
  blobServiceClient = new BlobServiceClient(
    `https://${storageAccountName}.blob.core.windows.net`,
    credential
  );
}

if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
  openaiClient = new OpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
    defaultQuery: { 'api-version': '2024-02-15-preview' },
    defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY }
  });
}

if (process.env.DOCUMENT_INTELLIGENCE_ENDPOINT) {
  // Try to use managed identity first, fall back to key if available
  try {
    documentAnalysisClient = new DocumentAnalysisClient(
      process.env.DOCUMENT_INTELLIGENCE_ENDPOINT,
      credential
    );
  } catch (err) {
    console.log('Failed to create Document Intelligence client with managed identity:', err);
    // Fall back to key-based auth if DOCUMENT_INTELLIGENCE_KEY is set
    if (process.env.DOCUMENT_INTELLIGENCE_KEY) {
      documentAnalysisClient = new DocumentAnalysisClient(
        process.env.DOCUMENT_INTELLIGENCE_ENDPOINT,
        new AzureKeyCredential(process.env.DOCUMENT_INTELLIGENCE_KEY)
      );
    }
  }
}

// Initialize Azure Translator client with managed identity
if (process.env.TRANSLATOR_ENDPOINT) {
  try {
    translationClient = TextTranslationClient(
      process.env.TRANSLATOR_ENDPOINT,
      credential
    );
    // Initialize Document Translation client with managed identity (for blob-based translation)
    documentTranslationClient = DocumentTranslationClient(
      process.env.TRANSLATOR_ENDPOINT,
      credential
    );
  } catch (err) {
    console.log('Failed to create Translator client with managed identity:', err);
    // Fall back to key-based auth if TRANSLATOR_KEY is set
    if (process.env.TRANSLATOR_KEY) {
      translationClient = TextTranslationClient(
        process.env.TRANSLATOR_ENDPOINT,
        new AzureKeyCredential(process.env.TRANSLATOR_KEY)
      );
      documentTranslationClient = DocumentTranslationClient(
        process.env.TRANSLATOR_ENDPOINT,
        new AzureKeyCredential(process.env.TRANSLATOR_KEY)
      );
    }
  }
}

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Initialize Application Insights if connection string is provided
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoDependencyCorrelation(true)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true)
    .setUseDiskRetryCaching(true)
    .start();
}

const app: Express = express();
const port = process.env.PORT || 3000;

// Session middleware for user identification
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined'));

// Extend session type
declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

// Ensure userId exists in session
app.use((req, _res, next) => {
  if (!req.session.userId) {
    req.session.userId = uuidv4();
  }
  next();
});

// Workspace utility functions
interface DocumentMetadata {
  documentId: string;
  userId: string;
  originalFilename: string;
  mimeType: string;
  uploadTime: string;
  fileSize: number;
  malwareScanStatus: 'pending' | 'clean' | 'infected';
  malwareScanTime?: string;
  processedModes: string[];
  lastAccessed: string;
  targetLanguage?: string;
  sourceLanguage?: string;
}

// Generate thumbnail for PDF (first page, 200x200px)
async function generateThumbnail(
  userId: string,
  documentId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<void> {
  // Only generate thumbnails for PDFs
  if (mimeType !== 'application/pdf') {
    return;
  }

  try {
    if (!blobServiceClient) throw new Error('Storage not configured');
    
    // Load PDF
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pages = pdfDoc.getPages();
    
    if (pages.length === 0) {
      console.log('PDF has no pages, skipping thumbnail');
      return;
    }

    // Extract first page as new PDF
    const firstPageDoc = await PDFDocument.create();
    const [copiedPage] = await firstPageDoc.copyPages(pdfDoc, [0]);
    firstPageDoc.addPage(copiedPage);
    
    const firstPageBytes = await firstPageDoc.save();
    
    // For now, just save the first page PDF as thumbnail
    // In production, you'd convert to image using pdf-to-png or similar
    const containerClient = blobServiceClient.getContainerClient('workspace');
    const thumbnailBlobClient = containerClient.getBlockBlobClient(
      `${userId}/${documentId}/thumbnail.pdf`
    );
    
    await thumbnailBlobClient.upload(firstPageBytes, firstPageBytes.length, {
      blobHTTPHeaders: { blobContentType: 'application/pdf' }
    });
    
    console.log(`Thumbnail generated for document ${documentId}`);
  } catch (error) {
    console.error('Failed to generate thumbnail:', error);
    // Don't fail the upload if thumbnail generation fails
  }
}

async function saveToWorkspace(
  userId: string,
  documentId: string,
  filename: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<void> {
  if (!blobServiceClient) throw new Error('Storage not configured');
  
  const containerClient = blobServiceClient.getContainerClient('workspace');
  
  // Save original file
  const originalBlobClient = containerClient.getBlockBlobClient(
    `${userId}/${documentId}/original/${filename}`
  );
  await originalBlobClient.upload(fileBuffer, fileBuffer.length, {
    blobHTTPHeaders: { blobContentType: mimeType }
  });
  
  // Save metadata
  const metadata: DocumentMetadata = {
    documentId,
    userId,
    originalFilename: filename,
    mimeType,
    uploadTime: new Date().toISOString(),
    fileSize: fileBuffer.length,
    malwareScanStatus: 'clean', // FIX: Set to clean immediately (no actual scan implemented)
    malwareScanTime: new Date().toISOString(),
    processedModes: [],
    lastAccessed: new Date().toISOString()
  };
  
  const metadataBlobClient = containerClient.getBlockBlobClient(
    `${userId}/${documentId}/metadata.json`
  );
  await metadataBlobClient.upload(
    JSON.stringify(metadata, null, 2),
    JSON.stringify(metadata).length,
    { blobHTTPHeaders: { blobContentType: 'application/json' } }
  );
}

async function saveResultToWorkspace(
  userId: string,
  documentId: string,
  mode: 'ocr-di' | 'ocr-cu' | 'ocr-openai' | 'translate' | 'translate-openai' | 'document-translate',
  result: any,
  filename?: string,
  outputFormat: string = 'json'
): Promise<void> {
  if (!blobServiceClient) throw new Error('Storage not configured');
  
  const containerClient = blobServiceClient.getContainerClient('workspace');
  
  // Update metadata to include this mode
  const metadataBlobClient = containerClient.getBlockBlobClient(
    `${userId}/${documentId}/metadata.json`
  );
  
  try {
    const downloadResponse = await metadataBlobClient.download();
    const metadataContent = await streamToBuffer(downloadResponse.readableStreamBody!);
    const metadata: DocumentMetadata = JSON.parse(metadataContent.toString());
    
    if (!metadata.processedModes.includes(mode)) {
      metadata.processedModes.push(mode);
    }
    metadata.lastAccessed = new Date().toISOString();
    
    await metadataBlobClient.upload(
      JSON.stringify(metadata, null, 2),
      JSON.stringify(metadata).length,
      { blobHTTPHeaders: { blobContentType: 'application/json' } }
    );
  } catch (err) {
    console.error('Failed to update metadata:', err);
  }
  
  // Determine file extension and content based on format
  let fileExtension = 'json';
  let content: Buffer;
  let contentType = 'application/json';
  
  if (outputFormat === 'txt' || outputFormat === 'text') {
    fileExtension = 'txt';
    contentType = 'text/plain';
    // Extract text from result object
    if (typeof result === 'string') {
      content = Buffer.from(result);
    } else if (result.text) {
      content = Buffer.from(result.text);
    } else if (result.translatedText) {
      content = Buffer.from(result.translatedText);
    } else if (result.ocrText) {
      content = Buffer.from(result.ocrText);
    } else {
      content = Buffer.from(JSON.stringify(result, null, 2));
    }
  } else {
    // JSON format (default)
    fileExtension = 'json';
    contentType = 'application/json';
    if (typeof result === 'string' || Buffer.isBuffer(result)) {
      const buffer = Buffer.isBuffer(result) ? result : Buffer.from(result);
      content = buffer;
    } else {
      content = Buffer.from(JSON.stringify(result, null, 2));
    }
  }
  
  // Save result with appropriate extension
  const resultFilename = filename || `result.${fileExtension}`;
  const resultBlobClient = containerClient.getBlockBlobClient(
    `${userId}/${documentId}/results/${mode}/${resultFilename}`
  );
  
  await resultBlobClient.upload(content, content.length, {
    blobHTTPHeaders: { blobContentType: contentType }
  });
}

async function getDocumentMetadata(userId: string, documentId: string): Promise<DocumentMetadata | null> {
  if (!blobServiceClient) throw new Error('Storage not configured');
  
  const containerClient = blobServiceClient.getContainerClient('workspace');
  const metadataBlobClient = containerClient.getBlockBlobClient(
    `${userId}/${documentId}/metadata.json`
  );
  
  try {
    const downloadResponse = await metadataBlobClient.download();
    const content = await streamToBuffer(downloadResponse.readableStreamBody!);
    const metadata = JSON.parse(content.toString());
    
    // Ensure userId is present (for backward compatibility with old metadata)
    if (!metadata.userId) {
      metadata.userId = userId;
    }
    
    return metadata;
  } catch (err) {
    return null;
  }
}

async function listAllDocuments(): Promise<DocumentMetadata[]> {
  if (!blobServiceClient) throw new Error('Storage not configured');
  
  const containerClient = blobServiceClient.getContainerClient('workspace');
  const documents: DocumentMetadata[] = [];
  
  // List ALL documents in workspace (no user filtering)
  // Structure: workspace/{userId}/{documentId}/metadata.json
  for await (const userBlob of containerClient.listBlobsByHierarchy('/')) {
    if (userBlob.kind === 'prefix') {
      const userId = userBlob.name.replace('/', '');
      
      // List documents for this user
      for await (const docBlob of containerClient.listBlobsByHierarchy('/', {
        prefix: `${userId}/`
      })) {
        if (docBlob.kind === 'prefix') {
          const documentId = docBlob.name.split('/')[1];
          const metadata = await getDocumentMetadata(userId, documentId);
          if (metadata) {
            documents.push(metadata);
          }
        }
      }
    }
  }
  
  return documents.sort((a, b) => 
    new Date(b.uploadTime).getTime() - new Date(a.uploadTime).getTime()
  );
}

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      aiFoundry: !!process.env.AI_FOUNDRY_ENDPOINT,
      documentIntelligence: !!process.env.DOCUMENT_INTELLIGENCE_ENDPOINT,
      translator: !!process.env.TRANSLATOR_ENDPOINT
    }
  });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'OCR & Translation API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      workspace: {
        upload: '/api/workspace/upload',
        documents: '/api/workspace/documents',
        document: '/api/workspace/:documentId',
        process: '/api/workspace/:documentId/process',
        result: '/api/workspace/:documentId/result/:mode'
      },
      ocr: {
        documentIntelligence: '/api/ocr/document-intelligence',
        contentUnderstanding: '/api/ocr/content-understanding'
      },
      translation: '/api/translate'
    }
  });
});

// Workspace API endpoints

// Upload document to workspace
app.post('/api/workspace/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file provided' });
    }
    
    const documentId = uuidv4();
    const userId = req.session.userId || 'demo';
    
    await saveToWorkspace(
      userId,
      documentId,
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype
    );
    
    // Generate thumbnail (async, don't wait)
    generateThumbnail(userId, documentId, req.file.buffer, req.file.mimetype).catch(err => {
      console.error('Thumbnail generation failed:', err);
    });
    
    const metadata = await getDocumentMetadata(userId, documentId);
    
    res.json({
      status: 'success',
      documentId,
      metadata
    });
  } catch (error) {
    console.error('Workspace upload error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to upload document'
    });
  }
});

// List ALL documents in workspace (no user filtering)
app.get('/api/workspace/documents', async (req: Request, res: Response) => {
  try {
    const documents = await listAllDocuments();
    
    res.json({
      status: 'success',
      documents
    });
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to list documents'
    });
  }
});

// Get document thumbnail
app.get('/api/workspace/thumbnail/:userId/:documentId', async (req: Request, res: Response) => {
  try {
    const { userId, documentId } = req.params;
    
    if (!blobServiceClient) {
      return res.status(500).json({ status: 'error', message: 'Storage not configured' });
    }
    
    const containerClient = blobServiceClient.getContainerClient('workspace');
    const thumbnailBlobClient = containerClient.getBlockBlobClient(
      `${userId}/${documentId}/thumbnail.pdf`
    );
    
    const exists = await thumbnailBlobClient.exists();
    if (!exists) {
      return res.status(404).json({ status: 'error', message: 'Thumbnail not found' });
    }
    
    const downloadResponse = await thumbnailBlobClient.download();
    const content = await streamToBuffer(downloadResponse.readableStreamBody!);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    res.send(content);
  } catch (error) {
    console.error('Get thumbnail error:', error);
    res.status(404).json({
      status: 'error',
      message: 'Thumbnail not available'
    });
  }
});

// Get original document file
app.get('/api/workspace/:userId/:documentId/original/:filename', async (req: Request, res: Response) => {
  try {
    const { userId, documentId, filename } = req.params;
    
    if (!blobServiceClient) {
      return res.status(500).json({ status: 'error', message: 'Storage not configured' });
    }
    
    const containerClient = blobServiceClient.getContainerClient('workspace');
    const blobClient = containerClient.getBlockBlobClient(
      `${userId}/${documentId}/original/${filename}`
    );
    
    const exists = await blobClient.exists();
    if (!exists) {
      return res.status(404).json({ status: 'error', message: 'Document not found' });
    }
    
    const downloadResponse = await blobClient.download();
    const content = await streamToBuffer(downloadResponse.readableStreamBody!);
    
    res.setHeader('Content-Type', downloadResponse.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(content);
  } catch (error) {
    console.error('Get original file error:', error);
    res.status(404).json({
      status: 'error',
      message: 'Document not available'
    });
  }
});

// Delete document and all associated files
app.delete('/api/workspace/:userId/:documentId', async (req: Request, res: Response) => {
  try {
    const { userId, documentId } = req.params;
    const containerName = 'workspace';
    
    if (!blobServiceClient) {
      return res.status(500).json({
        status: 'error',
        message: 'Blob storage not available'
      });
    }
    
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // List all blobs with this userId/documentId prefix
    const prefix = `${userId}/${documentId}/`;
    const blobs = containerClient.listBlobsFlat({ prefix });
    
    let deletedCount = 0;
    for await (const blob of blobs) {
      const blobClient = containerClient.getBlockBlobClient(blob.name);
      await blobClient.delete();
      deletedCount++;
      console.log(`Deleted blob: ${blob.name}`);
    }
    
    console.log(`Deleted ${deletedCount} blobs for document ${documentId}`);
    
    res.json({
      status: 'success',
      message: `Document deleted successfully`,
      deletedFiles: deletedCount
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete document'
    });
  }
});

// Get document metadata
app.get('/api/workspace/:documentId', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId || 'demo';
    const { documentId } = req.params;
    
    const metadata = await getDocumentMetadata(userId, documentId);
    
    if (!metadata) {
      return res.status(404).json({ status: 'error', message: 'Document not found' });
    }
    
    res.json({
      status: 'success',
      metadata
    });
  } catch (error) {
    console.error('Get metadata error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to get metadata'
    });
  }
});

// Get document result
app.get('/api/workspace/:documentId/result/:mode', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId || 'demo';
    const { documentId, mode } = req.params;
    
    if (!blobServiceClient) {
      return res.status(500).json({ status: 'error', message: 'Storage not configured' });
    }
    
    const containerClient = blobServiceClient.getContainerClient('workspace');
    
    // List blobs in the result directory
    const prefix = `${userId}/${documentId}/results/${mode}/`;
    let resultBlob = null;
    
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      resultBlob = blob;
      break; // Get first result file
    }
    
    if (!resultBlob) {
      return res.status(404).json({ status: 'error', message: 'Result not found' });
    }
    
    const blobClient = containerClient.getBlobClient(resultBlob.name);
    const downloadResponse = await blobClient.download();
    const content = await streamToBuffer(downloadResponse.readableStreamBody!);
    
    // Check if it's JSON
    if (resultBlob.name.endsWith('.json')) {
      res.json({
        status: 'success',
        result: JSON.parse(content.toString())
      });
    } else {
      // Return binary file
      res.setHeader('Content-Type', downloadResponse.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${resultBlob.name.split('/').pop()}"`);
      res.send(content);
    }
  } catch (error) {
    console.error('Get result error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to get result'
    });
  }
});

// List all results for a document
app.get('/api/workspace/:documentId/results', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId || 'demo';
    const { documentId } = req.params;
    
    if (!blobServiceClient) {
      return res.status(500).json({ status: 'error', message: 'Storage not configured' });
    }
    
    const containerClient = blobServiceClient.getContainerClient('workspace');
    const prefix = `${userId}/${documentId}/results/`;
    
    const results: any[] = [];
    
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      // Parse blob path: ${userId}/${documentId}/results/${mode}/${filename}
      const pathParts = blob.name.split('/');
      if (pathParts.length >= 5) {
        const mode = pathParts[3];
        const filename = pathParts[4];
        
        results.push({
          mode,
          filename,
          url: `/api/workspace/${documentId}/results/${mode}`,
          size: blob.properties.contentLength,
          lastModified: blob.properties.lastModified,
          contentType: blob.properties.contentType
        });
      }
    }
    
    res.json({
      status: 'success',
      results
    });
  } catch (error) {
    console.error('List results error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to list results'
    });
  }
});

// Process document from workspace
app.post('/api/workspace/:documentId/process', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId || 'demo';
    const { documentId } = req.params;
    const { mode, targetLanguage, systemPrompt, outputFormat } = req.body;
    
    console.log(`[PROCESS] userId: ${userId}, documentId: ${documentId}, mode: ${mode}, outputFormat: ${outputFormat}`);
    
    if (!['ocr-di', 'ocr-cu', 'ocr-openai', 'translate', 'translate-openai', 'document-translate'].includes(mode)) {
      return res.status(400).json({ status: 'error', message: 'Invalid processing mode' });
    }
    
    if (!blobServiceClient) {
      return res.status(500).json({ status: 'error', message: 'Storage not configured' });
    }
    
    // FIX: Try to find document with any userId since we list all documents
    let metadata = await getDocumentMetadata(userId, documentId);
    
    // If not found with session userId, try to find it in any user's workspace
    if (!metadata) {
      console.log(`[PROCESS] Document not found for userId ${userId}, searching all users...`);
      const allDocs = await listAllDocuments();
      const doc = allDocs.find(d => d.documentId === documentId);
      if (doc) {
        console.log(`[PROCESS] Found document with userId: ${doc.userId}`);
        metadata = doc;
      }
    }
    
    if (!metadata) {
      console.error(`[PROCESS] Document ${documentId} not found anywhere`);
      return res.status(404).json({ status: 'error', message: 'Document not found' });
    }
    
    // Get original file - use the actual userId from metadata
    const containerClient = blobServiceClient.getContainerClient('workspace');
    const originalBlobClient = containerClient.getBlockBlobClient(
      `${metadata.userId}/${documentId}/original/${metadata.originalFilename}`
    );
    
    const downloadResponse = await originalBlobClient.download();
    const fileBuffer = await streamToBuffer(downloadResponse.readableStreamBody!);
    
    // Process the document based on mode - 6 distinct tools
    let result: any;
    
    if (mode === 'ocr-di') {
      // Tool 1: Azure Document Intelligence OCR
      if (!documentAnalysisClient) {
        return res.status(500).json({ status: 'error', message: 'Document Intelligence not configured' });
      }
      
      const poller = await documentAnalysisClient.beginAnalyzeDocument('prebuilt-read', fileBuffer);
      const analysisResult = await poller.pollUntilDone();
      
      result = {
        service: 'Azure Document Intelligence',
        serviceDescription: 'Microsoft OCR optimized for forms and structured documents',
        model: 'prebuilt-read',
        text: analysisResult.content || '',
        pageCount: analysisResult.pages?.length || 0
      };
      
      await saveResultToWorkspace(metadata.userId, documentId, 'ocr-di', result, undefined, outputFormat || 'json');
      
    } else if (mode === 'ocr-cu') {
      // Tool 2: Azure AI Foundry Content Understanding
      if (!process.env.AI_FOUNDRY_ENDPOINT || !process.env.AI_FOUNDRY_KEY) {
        return res.status(500).json({ status: 'error', message: 'AI Foundry not configured. Set AI_FOUNDRY_ENDPOINT and AI_FOUNDRY_KEY environment variables.' });
      }

      const aiFoundryEndpoint = process.env.AI_FOUNDRY_ENDPOINT.replace(/\/$/, '');
      const base64File = fileBuffer.toString('base64');
      
      const requestBody = {
        base64Source: base64File
      };

      console.log(`[OCR_CU] Calling AI Foundry endpoint: ${aiFoundryEndpoint}`);

      try {
        const response = await axios.post(
          `${aiFoundryEndpoint}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`,
          requestBody,
          {
            headers: {
              'Content-Type': 'application/json',
              'Ocp-Apim-Subscription-Key': process.env.AI_FOUNDRY_KEY,
            }
          }
        );

        const analysisData = response.data;
        
        result = {
          service: 'Azure AI Foundry Content Understanding',
          serviceDescription: 'Advanced document analysis with entity extraction',
          text: analysisData.analyzeResult?.content || analysisData.content || '',
          entities: analysisData.analyzeResult?.entities || analysisData.entities || [],
          keyValuePairs: analysisData.analyzeResult?.keyValuePairs || analysisData.keyValuePairs || [],
          languages: analysisData.analyzeResult?.languages || analysisData.languages || [],
          paragraphs: analysisData.analyzeResult?.paragraphs || []
        };
      } catch (error: any) {
        console.error('[OCR_CU] AI Foundry error:', error.response?.data || error.message);
        throw new Error(`AI Foundry Content Understanding failed: ${error.response?.data?.error?.message || error.message}`);
      }
      
      await saveResultToWorkspace(metadata.userId, documentId, 'ocr-cu', result, undefined, outputFormat || 'json');
      
    } else if (mode === 'ocr-openai') {
      // Tool 3: OpenAI Vision OCR
      if (!openaiClient) {
        return res.status(500).json({ status: 'error', message: 'OpenAI not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT environment variables.' });
      }

      // Prepare image for Vision API (images only - no PDF support)
      if (!metadata.mimeType?.startsWith('image/')) {
        return res.status(400).json({ 
          status: 'error', 
          message: `OpenAI Vision OCR only supports image files.
          
Supported formats: JPEG, PNG, GIF, WebP

For PDFs, please use:
• OCR: Document Intelligence (best for forms and structured documents)
• OCR: Content Understanding (extracts entities and key-value pairs)
• Translate: Doc Intelligence + Text Translator (text-only translation)
• Document Translation (preserves PDF formatting)` 
        });
      }
      
      const imageBuffer = fileBuffer;
      const imageMimeType = metadata.mimeType;

      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:${imageMimeType};base64,${base64Image}`;
      
      const response = await openaiClient.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract all text from this document accurately, maintaining formatting and structure. Return only the extracted text.' },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ],
        max_completion_tokens: 4096
      });

      const extractedText = response.choices[0]?.message?.content || '';
      
      result = {
        service: 'OpenAI Vision (GPT-4o)',
        serviceDescription: 'AI-powered OCR for images',
        model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
        text: extractedText
      };
      
      await saveResultToWorkspace(metadata.userId, documentId, 'ocr-openai', result, undefined, outputFormat || 'json');
      
    } else if (mode === 'translate') {
      // Tool 4: Azure Document Intelligence + Azure Text Translator
      if (!documentAnalysisClient || !translationClient) {
        return res.status(500).json({ status: 'error', message: 'Translation service not configured' });
      }
      
      const poller = await documentAnalysisClient.beginAnalyzeDocument('prebuilt-read', fileBuffer);
      const analysisResult = await poller.pollUntilDone();
      const extractedText = analysisResult.content || '';
      
      const targetLanguage = metadata.targetLanguage || 'en';
      const sourceLanguage = metadata.sourceLanguage || undefined;
      
      const translationResult = await translationClient.path('/translate').post({
        body: [{ text: extractedText }],
        queryParameters: {
          to: targetLanguage,
          ...(sourceLanguage && { from: sourceLanguage }),
          'api-version': '3.0'
        }
      });

      if (translationResult.status !== '200') {
        throw new Error('Translation failed');
      }

      const body = translationResult.body as any;
      const translationData = body[0];
      
      result = {
        service: 'Azure Document Intelligence + Azure Text Translator',
        serviceDescription: 'Two-step OCR then translate (text only)',
        originalText: extractedText,
        translatedText: translationData.translations[0].text,
        targetLanguage,
        sourceLanguage: translationData.detectedLanguage?.language || sourceLanguage
      };
      
      await saveResultToWorkspace(metadata.userId, documentId, 'translate', result, undefined, outputFormat || 'json');
      
    } else if (mode === 'translate-openai') {
      // Tool 5: OpenAI Vision Translation (one-step, images only)
      if (!openaiClient) {
        return res.status(500).json({ status: 'error', message: 'OpenAI not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT environment variables.' });
      }

      const targetLanguage = metadata.targetLanguage || 'English';
      
      // Vision API only supports images, not PDFs
      if (!metadata.mimeType?.startsWith('image/')) {
        return res.status(400).json({ 
          status: 'error', 
          message: `OpenAI Vision Translation only supports image files.

Supported formats: JPEG, PNG, GIF, WebP

For PDFs, please use:
• Translate: Doc Intelligence + Text Translator (text-only translation)
• Document Translation (preserves PDF formatting - recommended for PDFs)` 
        });
      }
      
      const imageBuffer = fileBuffer;
      const imageMimeType = metadata.mimeType;
      
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:${imageMimeType};base64,${base64Image}`;
      
      const response = await openaiClient.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Your task is to TRANSLATE text from images, not just extract it. When given an image with text and a target language, you must output ONLY the translation in the target language.`
          },
          {
            role: 'user',
            content: [
              { 
                type: 'text', 
                text: `Read all text in this image and translate it to ${targetLanguage}. Important: Output ONLY the translation in ${targetLanguage}, not the original text. Do not explain, do not add comments, just provide the ${targetLanguage} translation.` 
              },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ],
        max_completion_tokens: 4096
      });

      const translatedText = response.choices[0]?.message?.content || '';
      
      // Try to detect if translation happened by checking if output differs significantly from typical OCR
      const sourceLanguage = metadata.sourceLanguage || 'auto-detected';
      
      result = {
        service: 'OpenAI Vision Translation',
        serviceDescription: 'One-step AI translation for images',
        model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
        translatedText,
        targetLanguage,
        sourceLanguage
      };
      
      await saveResultToWorkspace(metadata.userId, documentId, 'translate-openai', result, undefined, outputFormat || 'json');
      
    } else if (mode === 'document-translate') {
      // Tool 6: Azure Document Translation - format-preserving batch translation using SDK
      if (!blobServiceClient || !documentTranslationClient) {
        return res.status(500).json({ 
          status: 'error', 
          message: 'Document Translation not configured (need blob storage and translation client)' 
        });
      }

      const targetLang = targetLanguage || 'en';
      console.log(`[DOCUMENT_TRANSLATE] Starting document translation to ${targetLang}`);
      
      // Step 1: Upload file to source container
      const sourceContainerName = 'translation-source';
      const targetContainerName = 'translation-target';
      const sourceContainerClient = blobServiceClient.getContainerClient(sourceContainerName);
      const targetContainerClient = blobServiceClient.getContainerClient(targetContainerName);
      
      const timestamp = Date.now();
      const sourceFileName = `${timestamp}-${metadata.originalFilename}`;
      const sourceBlobClient = sourceContainerClient.getBlockBlobClient(sourceFileName);
      
      await sourceBlobClient.upload(fileBuffer, fileBuffer.length, {
        blobHTTPHeaders: { blobContentType: metadata.mimeType || 'application/pdf' }
      });
      
      console.log(`[DOCUMENT_TRANSLATE] Uploaded source file: ${sourceFileName}`);
      
      // Step 2: Submit translation job using SDK (managed identity)
      const storageAccountUrl = `https://${storageAccountName}.blob.core.windows.net`;
      const sourceUrl = `${storageAccountUrl}/${sourceContainerName}`;
      const targetUrl = `${storageAccountUrl}/${targetContainerName}`;
      
      console.log(`[DOCUMENT_TRANSLATE] Submitting translation job via SDK`);
      console.log(`[DOCUMENT_TRANSLATE] Source: ${sourceUrl}`);
      console.log(`[DOCUMENT_TRANSLATE] Target: ${targetUrl}`);
      
      const batchRequest = {
        body: {
          inputs: [{
            source: {
              sourceUrl: sourceUrl
            },
            targets: [{
              targetUrl: targetUrl,
              language: targetLang
            }]
          }]
        }
      };
      
      const submitResult = await documentTranslationClient.path('/document/batches').post(batchRequest);
      
      if (isUnexpectedDoc(submitResult)) {
        console.error(`[DOCUMENT_TRANSLATE] SDK submission failed:`, submitResult.body);
        throw new Error(`Document translation submission failed: ${submitResult.body.error?.message || 'Unknown error'}`);
      }
      
      const operationLocation = submitResult.headers['operation-location'];
      if (!operationLocation) {
        throw new Error('No operation-location header in SDK response');
      }
      
      const operationId = operationLocation.split('/').pop()?.split('?')[0];
      console.log(`[DOCUMENT_TRANSLATE] Translation job ID: ${operationId}`);
      
      // Step 3: Poll for completion (max 5 minutes)
      const maxAttempts = 60;
      let attempts = 0;
      let translationStatus = 'NotStarted';
      
      while (attempts < maxAttempts && !['Succeeded', 'Failed', 'Cancelled'].includes(translationStatus)) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const statusResult = await documentTranslationClient.path('/document/batches/{id}', operationId!).get();
        
        if (isUnexpectedDoc(statusResult)) {
          console.error(`[DOCUMENT_TRANSLATE] Status check failed:`, statusResult.body);
          break;
        }
        
        translationStatus = statusResult.body.status;
        console.log(`[DOCUMENT_TRANSLATE] Status: ${translationStatus} (${attempts + 1}/${maxAttempts})`);
        
        if (translationStatus === 'Failed') {
          const errorInfo = statusResult.body.error;
          console.error(`[DOCUMENT_TRANSLATE] Translation failed:`, errorInfo);
          throw new Error(`Translation failed: ${errorInfo?.message || JSON.stringify(errorInfo)}`);
        }
        
        attempts++;
      }
      
      if (translationStatus !== 'Succeeded') {
        throw new Error(`Translation timeout or failed with status: ${translationStatus}`);
      }
      
      // Step 4: Find and download translated document
      // The translated file will have the same name as source file in target container
      // Azure Translator preserves the filename structure
      let translatedBlobName = sourceFileName; // Same name as source
      let translatedBlobClient = targetContainerClient.getBlockBlobClient(translatedBlobName);
      
      // Check if translated file exists
      const exists = await translatedBlobClient.exists();
      if (!exists) {
        // If not found with same name, list all blobs to find it
        console.log(`[DOCUMENT_TRANSLATE] Searching for translated file in target container...`);
        const targetBlobs = [];
        for await (const blob of targetContainerClient.listBlobsFlat()) {
          targetBlobs.push(blob);
          console.log(`[DOCUMENT_TRANSLATE] Found blob: ${blob.name}`);
        }
        
        if (targetBlobs.length === 0) {
          throw new Error('Translated document not found in target container');
        }
        
        // Find the most recent blob (highest timestamp)
        const sortedBlobs = targetBlobs.sort((a, b) => {
          const timeA = parseInt(a.name.split('-')[0]) || 0;
          const timeB = parseInt(b.name.split('-')[0]) || 0;
          return timeB - timeA;
        });
        
        console.log(`[DOCUMENT_TRANSLATE] Using most recent file: ${sortedBlobs[0].name}`);
        translatedBlobName = sortedBlobs[0].name;
        translatedBlobClient = targetContainerClient.getBlockBlobClient(translatedBlobName);
      }
      
      console.log(`[DOCUMENT_TRANSLATE] Downloading translated file: ${translatedBlobName}`);
      const downloadResponse = await translatedBlobClient.download();
      
      const chunks: Buffer[] = [];
      for await (const chunk of downloadResponse.readableStreamBody!) {
        chunks.push(Buffer.from(chunk));
      }
      const translatedBuffer = Buffer.concat(chunks);
      
      // Step 5: Save to workspace
      const translatedFilename = `translated-${targetLang}-${metadata.originalFilename}`;
      const workspaceContainerClient = blobServiceClient.getContainerClient('workspace');
      const translatedWorkspaceBlobName = `${metadata.userId}/${documentId}/translated/${translatedFilename}`;
      const workspaceBlobClient = workspaceContainerClient.getBlockBlobClient(translatedWorkspaceBlobName);
      
      await workspaceBlobClient.uploadData(translatedBuffer, {
        blobHTTPHeaders: { blobContentType: metadata.mimeType || 'application/pdf' }
      });
      
      console.log(`[DOCUMENT_TRANSLATE] Saved to workspace: ${translatedWorkspaceBlobName}`);
      
      result = {
        service: 'Azure Document Translation',
        serviceDescription: 'Format-preserving batch document translation',
        targetLanguage: targetLang,
        originalFilename: metadata.originalFilename,
        translatedFilename,
        translatedDocumentUrl: `/api/workspace/${documentId}/translated/${translatedFilename}`,
        message: `Document translated to ${targetLang} with format preserved`
      };
      
      await saveResultToWorkspace(metadata.userId, documentId, 'document-translate', result);
      
    } else {
      // Analyze mode - just return basic info
      result = {
        message: 'Analysis not yet implemented',
        fileSize: fileBuffer.length,
        mimeType: metadata.mimeType
      };
    }
    
    res.json({
      status: 'success',
      message: `Successfully processed document with ${mode}`,
      documentId,
      mode,
      result
    });
    
  } catch (error) {
    console.error('Process document error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to process document'
    });
  }
});

// OCR endpoint - Document Intelligence
app.post('/api/ocr/document-intelligence', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!documentAnalysisClient) {
      return res.status(500).json({
        status: 'error',
        message: 'Document Intelligence not configured'
      });
    }

    // Document Intelligence: Always use direct file buffer
    // (Blob URLs don't work because storage has private endpoints only accessible from VNet,
    // but Document Intelligence service is outside the VNet)
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file provided'
      });
    }

    const fileBuffer = req.file.buffer;
    const userId = (req.session as any).userId;
    const documentId = req.body.documentId; // Get documentId from request

    // Analyze document using prebuilt-read model (best for general OCR)
    const poller = await documentAnalysisClient.beginAnalyzeDocument('prebuilt-read', fileBuffer);
    
    const result = await poller.pollUntilDone();

    // Extract text content
    const extractedText = result.content || '';
    
    // Extract pages with layout information
    const pages = result.pages?.map(page => ({
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      angle: page.angle,
      unit: page.unit,
      lines: page.lines?.map(line => ({
        content: line.content,
        polygon: line.polygon
      }))
    }));

    const resultData = {
      status: 'success',
      service: 'Azure Document Intelligence',
      model: 'prebuilt-read',
      text: extractedText,
      pages,
      pageCount: result.pages?.length || 0
    };

    // Save result to workspace if documentId provided
    if (documentId && userId) {
      try {
        await saveResultToWorkspace(userId, documentId, 'ocr-di', resultData);
        console.log(`Saved OCR-DI result to workspace for document ${documentId}`);
      } catch (saveError) {
        console.error('Failed to save result to workspace:', saveError);
        // Continue even if save fails - don't block the response
      }
    }

    res.json(resultData);
  } catch (error) {
    console.error('Error in document-intelligence:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// OCR endpoint - Azure AI Language (Key Phrase Extraction)
app.post('/api/ocr/language-analysis', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file provided' });
    }
    if (!process.env.AI_FOUNDRY_ENDPOINT || !process.env.AI_FOUNDRY_KEY) {
      return res.status(500).json({ status: 'error', message: 'AI Language endpoint/key not configured' });
    }

    // First extract text using Document Intelligence
    if (!documentAnalysisClient) {
      return res.status(500).json({ status: 'error', message: 'Document Intelligence not configured' });
    }
    const poller = await documentAnalysisClient.beginAnalyzeDocument('prebuilt-read', req.file.buffer);
    const docResult = await poller.pollUntilDone();
    const extractedText = docResult.content || '';

    if (!extractedText) {
      return res.status(400).json({ status: 'error', message: 'No text extracted from document' });
    }

    // Call Azure AI Language API for key phrase extraction
    const aiFoundryEndpoint = process.env.AI_FOUNDRY_ENDPOINT?.replace(/\/$/, '');
    const languageEndpoint = `${aiFoundryEndpoint}/language/:analyze-text?api-version=2022-05-01`;
    
    const languageRequest = {
      kind: 'KeyPhraseExtraction',
      parameters: {
        modelVersion: 'latest'
      },
      analysisInput: {
        documents: [
          {
            id: '1',
            language: 'en',
            text: extractedText
          }
        ]
      }
    };
    
    const languageHeaders = {
      'Ocp-Apim-Subscription-Key': process.env.AI_FOUNDRY_KEY,
      'Content-Type': 'application/json'
    };
    
    const languageResponse = await axios.post(languageEndpoint, languageRequest, { headers: languageHeaders });
    
    res.json({
      status: 'success',
      service: 'Azure AI Language - Key Phrase Extraction',
      text: extractedText,
      keyPhrases: languageResponse.data.results?.documents?.[0]?.keyPhrases || [],
      analysis: languageResponse.data
    });
  } catch (error) {
    console.error('Error in language-analysis:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response status:', error.response?.status);
      console.error('Response data:', JSON.stringify(error.response?.data, null, 2));
      console.error('Request URL:', error.config?.url);
    }
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Internal server error',
      details: axios.isAxiosError(error) ? error.response?.data : undefined
    });
  }
});

// OCR endpoint - Content Understanding (stub/not implemented)
app.post('/api/ocr/content-understanding', upload.single('file'), async (req: Request, res: Response) => {
  res.status(501).json({
    status: 'error',
    message: 'Content Understanding OCR is not yet implemented',
    note: 'This feature requires additional Azure AI services configuration'
  });
});

// Translation endpoint - Azure Text Translation (synchronous, no blob needed)
// Translation endpoint - Azure Document Translation (blob-based, supports all formats)
app.post('/api/translate', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file provided'
      });
    }

    if (!documentTranslationClient) {
      return res.status(500).json({
        status: 'error',
        message: 'Document Translation not configured'
      });
    }

    if (!blobServiceClient) {
      return res.status(500).json({
        status: 'error',
        message: 'Storage not configured'
      });
    }

    const targetLanguage = req.body.targetLanguage || 'en';
    
    // Step 1: Upload file to source container
    const sourceContainerName = 'translation-source';
    const targetContainerName = 'translation-target';
    const sourceContainerClient = blobServiceClient.getContainerClient(sourceContainerName);
    
    // Generate unique filename to avoid collisions
    const timestamp = Date.now();
    const sourceFileName = `${timestamp}-${req.file.originalname}`;
    const sourceBlobClient = sourceContainerClient.getBlockBlobClient(sourceFileName);
    
    // Upload file buffer to blob
    await sourceBlobClient.upload(req.file.buffer, req.file.buffer.length, {
      blobHTTPHeaders: { blobContentType: req.file.mimetype }
    });
    
    console.log(`Uploaded source file to blob: ${sourceFileName}`);
    
    // Step 2: Submit translation job (NO SAS - managed identity)
    const storageAccountUrl = `https://${storageAccountName}.blob.core.windows.net`;
    const sourceUrl = `${storageAccountUrl}/${sourceContainerName}`;
    const targetUrl = `${storageAccountUrl}/${targetContainerName}`;
    
    const batchRequest = {
      inputs: [{
        source: {
          sourceUrl: sourceUrl,
          filter: {
            prefix: `${timestamp}-` // Only translate this file
          }
        },
        targets: [{
          targetUrl: targetUrl,
          language: targetLanguage
        }]
      }]
    };
    
    console.log('Submitting Document Translation job...');
    const translationResponse = await documentTranslationClient.path('/document/batches').post({
      body: batchRequest
    });
    
    if (isUnexpectedDoc(translationResponse)) {
      throw new Error(`Translation job submission failed: ${translationResponse.body.error?.message || 'Unknown error'}`);
    }
    
    // Extract operation ID from operation-location header
    // Format: https://<endpoint>/translator/document/batches/{id}?api-version=2024-05-01
    const operationLocation = translationResponse.headers['operation-location'];
    if (!operationLocation) {
      throw new Error('No operation-location header in translation response');
    }
    
    // Extract ID from URL path, removing query parameters
    const urlParts = operationLocation.split('/');
    const lastPart = urlParts[urlParts.length - 1]; // Gets "{id}?api-version=..."
    const operationId = lastPart.split('?')[0]; // Remove query parameters
    
    if (!operationId) {
      throw new Error('Failed to parse operation ID from translation response');
    }
    
    console.log(`Translation job started with ID: ${operationId}`);
    
    // Step 3: Poll for completion (max 5 minutes)
    const maxAttempts = 60; // 60 attempts * 5 seconds = 5 minutes
    let attempts = 0;
    let status = 'NotStarted';
    let translatedDocumentUrl = '';
    
    while (attempts < maxAttempts && !['Succeeded', 'Failed', 'Cancelled'].includes(status)) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const statusResponse = await documentTranslationClient.path('/document/batches/{id}', operationId).get();
      
      if (isUnexpectedDoc(statusResponse)) {
        throw new Error('Failed to get translation status');
      }
      
      status = statusResponse.body.status;
      console.log(`Translation status: ${status} (attempt ${attempts + 1}/${maxAttempts})`);
      
      if (status === 'Succeeded') {
        // Get document details
        const documentsResponse = await documentTranslationClient.path('/document/batches/{id}/documents', operationId).get();
        
        if (isUnexpectedDoc(documentsResponse)) {
          throw new Error('Failed to get translated documents');
        }
        
        const documents = documentsResponse.body.value;
        if (documents && documents.length > 0) {
          // Find our document by matching the timestamp prefix
          const doc = documents.find(d => d.sourcePath?.includes(sourceFileName));
          if (doc) {
            translatedDocumentUrl = doc.path || '';
            console.log(`Translation succeeded. Document URL: ${translatedDocumentUrl}`);
          }
        }
      } else if (status === 'Failed') {
        const documentsResponse = await documentTranslationClient.path('/document/batches/{id}/documents', operationId).get();
        let errorMessage = 'Translation failed';
        
        if (!isUnexpectedDoc(documentsResponse)) {
          const documents = documentsResponse.body.value;
          if (documents && documents.length > 0) {
            const doc = documents[0];
            errorMessage = doc.error?.message || errorMessage;
          }
        }
        
        throw new Error(errorMessage);
      }
      
      attempts++;
    }
    
    if (status !== 'Succeeded') {
      throw new Error(`Translation timed out or failed with status: ${status}`);
    }
    
    // Step 4: Download translated document
    const targetBlobClient = blobServiceClient.getContainerClient(targetContainerName).getBlockBlobClient(translatedDocumentUrl.split('/').pop()!);
    const downloadResponse = await targetBlobClient.download();
    const translatedBuffer = await streamToBuffer(downloadResponse.readableStreamBody!);
    
    // Save to workspace if documentId provided
    const userId = (req.session as any).userId;
    const documentId = req.body.documentId;
    
    if (documentId && userId) {
      try {
        // Save translated PDF to workspace
        const translatedFilename = `translated-${targetLanguage}-${req.file.originalname}`;
        await saveResultToWorkspace(userId, documentId, 'translate', translatedBuffer, translatedFilename);
        console.log(`Saved translation result to workspace for document ${documentId}`);
      } catch (saveError) {
        console.error('Failed to save translation to workspace:', saveError);
        // Continue even if save fails
      }
    }
    
    // Return translated document
    res.setHeader('Content-Type', req.file.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="translated-${req.file.originalname}"`);
    res.send(translatedBuffer);
    
  } catch (error) {
    console.error('Error in Document Translation:', error);
    res.status(500).json({
      status: 'error',
      message: 'Translation failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Helper function to convert stream to buffer
async function streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on('data', (data: Buffer) => {
      chunks.push(data);
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on('error', reject);
  });
}

// Upload endpoint - Upload file to Azure Blob Storage
app.post('/api/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file provided'
      });
    }

    if (!blobServiceClient) {
      return res.status(500).json({
        status: 'error',
        message: 'Storage not configured'
      });
    }

    const containerName = 'uploads';
    const blobName = `${Date.now()}-${req.file.originalname}`;
    
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    await blockBlobClient.uploadData(req.file.buffer, {
      blobHTTPHeaders: {
        blobContentType: req.file.mimetype
      }
    });

    const blobUrl = blockBlobClient.url;
    
    res.json({
      status: 'success',
      message: 'File uploaded successfully',
      blobUrl,
      blobName,
      containerName,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to upload file',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// OpenAI OCR endpoint
app.post('/api/ocr/openai', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file provided'
      });
    }

    if (!openaiClient) {
      return res.status(500).json({
        status: 'error',
        message: 'OpenAI not configured'
      });
    }

    const systemPrompt = req.body.systemPrompt || 'Extract all text from this image accurately, maintaining formatting.';
    
    // Convert buffer to base64
    const base64Image = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64Image}`;
    
    const response = await openaiClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4-vision',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: dataUrl
              }
            }
          ]
        }
      ],
      max_tokens: 4000
    });

    const extractedText = response.choices[0]?.message?.content || '';
    
    res.json({
      status: 'success',
      text: extractedText,
      model: response.model,
      usage: response.usage,
      filename: req.file.originalname
    });
  } catch (error) {
    console.error('Error in OpenAI OCR:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process with OpenAI',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// OpenAI Translation endpoint
app.post('/api/translate/openai', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file provided'
      });
    }

    if (!openaiClient) {
      return res.status(500).json({
        status: 'error',
        message: 'OpenAI not configured'
      });
    }

    const systemPrompt = req.body.systemPrompt || 'Translate the provided text accurately while maintaining tone and style.';
    const targetLanguage = req.body.targetLanguage || 'English';
    
    // Convert buffer to base64
    const base64Image = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64Image}`;
    
    const response = await openaiClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4-vision',
      messages: [
        {
          role: 'system',
          content: `${systemPrompt}\n\nTarget language: ${targetLanguage}`
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: dataUrl
              }
            },
            {
              type: 'text',
              text: `Please translate the text in this image to ${targetLanguage}.`
            }
          ]
        }
      ],
      max_tokens: 4000
    });

    const translatedText = response.choices[0]?.message?.content || '';
    
    res.json({
      status: 'success',
      translatedText,
      targetLanguage,
      model: response.model,
      usage: response.usage,
      filename: req.file.originalname
    });
  } catch (error) {
    console.error('Error in OpenAI translation:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to translate with OpenAI',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found'
  });
});

// Start server
app.listen(port, () => {
  console.log(`⚡️ Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`AI Foundry: ${process.env.AI_FOUNDRY_ENDPOINT || 'Not configured'}`);
  console.log(`Document Intelligence: ${process.env.DOCUMENT_INTELLIGENCE_ENDPOINT || 'Not configured'}`);
  console.log(`Translator: ${process.env.TRANSLATOR_ENDPOINT || 'Not configured'}`);
});

export default app;
