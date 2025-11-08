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

dotenv.config();

// Initialize Azure clients
const credential = new DefaultAzureCredential();
const storageAccountName = process.env.STORAGE_ACCOUNT_NAME || '';
let blobServiceClient: BlobServiceClient | null = null;
let openaiClient: OpenAI | null = null;

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
app.post('/api/ocr/document-intelligence', async (req: Request, res: Response) => {
  try {
    // MVP: Return stub response
    res.json({
      status: 'success',
      message: 'Document Intelligence OCR (MVP - stub response)',
      endpoint: process.env.DOCUMENT_INTELLIGENCE_ENDPOINT || 'Not configured',
      note: 'Full implementation will use Azure Document Intelligence SDK with managed identity'
    });
  } catch (error) {
    console.error('Error in document-intelligence:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
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

// Translation endpoint
app.post('/api/translate', async (req: Request, res: Response) => {
  try {
    // MVP: Return stub response
    res.json({
      status: 'success',
      message: 'Document Translation (MVP - stub response)',
      endpoint: process.env.TRANSLATOR_ENDPOINT || 'Not configured',
      note: 'Full implementation will use Azure Translator SDK with managed identity'
    });
  } catch (error) {
    console.error('Error in translate:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
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
