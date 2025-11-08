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
import { BlobServiceClient, BlockBlobClient } from '@azure/storage-blob';
import { OpenAI } from 'openai';
import { DocumentAnalysisClient, AzureKeyCredential } from '@azure/ai-form-recognizer';
import TextTranslationClient, { isUnexpected } from '@azure-rest/ai-translation-text';
import DocumentTranslationClient, { isUnexpected as isUnexpectedDoc } from '@azure-rest/ai-translation-document';

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
  originalFilename: string;
  mimeType: string;
  uploadTime: string;
  fileSize: number;
  malwareScanStatus: 'pending' | 'clean' | 'infected';
  malwareScanTime?: string;
  processedModes: string[];
  lastAccessed: string;
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
    originalFilename: filename,
    mimeType,
    uploadTime: new Date().toISOString(),
    fileSize: fileBuffer.length,
    malwareScanStatus: 'pending',
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
  mode: 'ocr' | 'translate' | 'analyze',
  result: any,
  filename?: string
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
  
  // Save result
  const resultFilename = filename || 'result.json';
  const resultBlobClient = containerClient.getBlockBlobClient(
    `${userId}/${documentId}/results/${mode}/${resultFilename}`
  );
  
  if (typeof result === 'string' || Buffer.isBuffer(result)) {
    const buffer = Buffer.isBuffer(result) ? result : Buffer.from(result);
    await resultBlobClient.upload(buffer, buffer.length);
  } else {
    const jsonString = JSON.stringify(result, null, 2);
    await resultBlobClient.upload(jsonString, jsonString.length, {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });
  }
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
    return JSON.parse(content.toString());
  } catch (err) {
    return null;
  }
}

async function listUserDocuments(userId: string): Promise<DocumentMetadata[]> {
  if (!blobServiceClient) throw new Error('Storage not configured');
  
  const containerClient = blobServiceClient.getContainerClient('workspace');
  const documents: DocumentMetadata[] = [];
  
  // List all document folders for this user
  for await (const blob of containerClient.listBlobsByHierarchy('/', {
    prefix: `${userId}/`
  })) {
    if (blob.kind === 'prefix') {
      const documentId = blob.name.split('/')[1];
      const metadata = await getDocumentMetadata(userId, documentId);
      if (metadata) {
        documents.push(metadata);
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
    const userId = req.session.userId!;
    
    await saveToWorkspace(
      userId,
      documentId,
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype
    );
    
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

// List user's documents
app.get('/api/workspace/documents', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const documents = await listUserDocuments(userId);
    
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

// Get document metadata
app.get('/api/workspace/:documentId', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
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
    const userId = req.session.userId!;
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

// Process document from workspace
app.post('/api/workspace/:documentId/process', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { documentId } = req.params;
    const { mode, targetLanguage } = req.body;
    
    if (!['ocr', 'translate', 'analyze'].includes(mode)) {
      return res.status(400).json({ status: 'error', message: 'Invalid processing mode' });
    }
    
    if (!blobServiceClient) {
      return res.status(500).json({ status: 'error', message: 'Storage not configured' });
    }
    
    // Get document metadata
    const metadata = await getDocumentMetadata(userId, documentId);
    if (!metadata) {
      return res.status(404).json({ status: 'error', message: 'Document not found' });
    }
    
    // Get original file
    const containerClient = blobServiceClient.getContainerClient('workspace');
    const originalBlobClient = containerClient.getBlockBlobClient(
      `${userId}/${documentId}/original/${metadata.originalFilename}`
    );
    
    const downloadResponse = await originalBlobClient.download();
    const fileBuffer = await streamToBuffer(downloadResponse.readableStreamBody!);
    
    // Process based on mode (implement actual processing logic here)
    // For now, return a placeholder response
    res.json({
      status: 'success',
      message: `Processing ${mode} for document ${documentId}`,
      documentId,
      mode
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

    res.json({
      status: 'success',
      service: 'Azure Document Intelligence',
      model: 'prebuilt-read',
      text: extractedText,
      pages,
      pageCount: result.pages?.length || 0
    });
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
