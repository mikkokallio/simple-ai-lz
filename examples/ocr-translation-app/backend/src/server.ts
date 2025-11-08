import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import multer from 'multer';
import * as appInsights from 'applicationinsights';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { OpenAI } from 'openai';
import { DocumentAnalysisClient, AzureKeyCredential } from '@azure/ai-form-recognizer';
import TextTranslationClient, { isUnexpected } from '@azure-rest/ai-translation-text';

dotenv.config();

// Initialize Azure clients
const credential = new DefaultAzureCredential();
const storageAccountName = process.env.STORAGE_ACCOUNT_NAME || '';
let blobServiceClient: BlobServiceClient | null = null;
let openaiClient: OpenAI | null = null;
let documentAnalysisClient: DocumentAnalysisClient | null = null;
let translationClient: ReturnType<typeof TextTranslationClient> | null = null;

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
  } catch (err) {
    console.log('Failed to create Translator client with managed identity:', err);
    // Fall back to key-based auth if TRANSLATOR_KEY is set
    if (process.env.TRANSLATOR_KEY) {
      translationClient = TextTranslationClient(
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

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined'));

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
      ocr: {
        documentIntelligence: '/api/ocr/document-intelligence',
        contentUnderstanding: '/api/ocr/content-understanding'
      },
      translation: '/api/translate'
    }
  });
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

// OCR endpoint - Content Understanding (AI Foundry)
app.post('/api/ocr/content-understanding', async (req: Request, res: Response) => {
  try {
    // MVP: Return stub response
    res.json({
      status: 'success',
      message: 'Content Understanding OCR (MVP - stub response)',
      endpoint: process.env.AI_FOUNDRY_ENDPOINT || 'Not configured',
      note: 'Full implementation will use AI Foundry Content Understanding with managed identity'
    });
  } catch (error) {
    console.error('Error in content-understanding:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Translation endpoint - Azure Text Translation (synchronous, no blob needed)
app.post('/api/translate', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file provided'
      });
    }

    if (!translationClient) {
      return res.status(500).json({
        status: 'error',
        message: 'Translator not configured'
      });
    }

    const targetLanguage = req.body.targetLanguage || 'en';
    
    // Convert file buffer to text (for text files)
    // For more complex formats, you'd extract text first (e.g., using Document Intelligence)
    const sourceText = req.file.buffer.toString('utf-8');

    // Translate text using Azure Translator
    const translateResponse = await translationClient.path('/translate').post({
      body: [{ text: sourceText }],
      queryParameters: {
        to: targetLanguage,
        'api-version': '3.0'
      }
    });

    if (isUnexpected(translateResponse)) {
      throw new Error(`Translation failed: ${translateResponse.body.error?.message || 'Unknown error'}`);
    }

    const translations = translateResponse.body;
    const translatedText = translations[0]?.translations?.[0]?.text || '';
    const detectedLanguage = translations[0]?.detectedLanguage;

    res.json({
      status: 'success',
      service: 'Azure Translator',
      sourceText: sourceText.substring(0, 500) + (sourceText.length > 500 ? '...' : ''),
      translatedText,
      detectedLanguage: {
        language: detectedLanguage?.language,
        score: detectedLanguage?.score
      },
      targetLanguage,
      filename: req.file.originalname
    });
  } catch (error) {
    console.error('Error in translate:', error);
    res.status(500).json({
      status: 'error',
      message: 'Translation failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

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
