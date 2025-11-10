import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import session from 'express-session';
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

// Types
interface Thread {
  threadId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface Message {
  messageId: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface UserPreferences {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

// Environment variables
const PORT = process.env.PORT || 5000;
const STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME || '';
const STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'chat-data';
const AI_FOUNDRY_ENDPOINT = process.env.AI_FOUNDRY_ENDPOINT || '';
const AI_FOUNDRY_DEPLOYMENT = process.env.AI_FOUNDRY_DEPLOYMENT_NAME || 'gpt-5-mini';
const AI_FOUNDRY_KEY = process.env.AI_FOUNDRY_KEY || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';

// Static user ID (like in OCR app)
const STATIC_USER_ID = 'demo';

// Azure clients
let blobServiceClient: BlobServiceClient;
let containerClient: any;
let openaiClient: OpenAI;

// Initialize Azure Storage
async function initializeStorage() {
  try {
    const credential = new DefaultAzureCredential();
    const accountUrl = `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`;
    blobServiceClient = new BlobServiceClient(accountUrl, credential);
    containerClient = blobServiceClient.getContainerClient(STORAGE_CONTAINER_NAME);
    
    // Create container if it doesn't exist
    await containerClient.createIfNotExists();
    console.log(`✅ Storage initialized: ${STORAGE_CONTAINER_NAME}`);
  } catch (error) {
    console.error('❌ Failed to initialize storage:', error);
    throw error;
  }
}

// Initialize OpenAI client
async function initializeOpenAI() {
  try {
    // Use API key if provided (for Azure deployment), otherwise use managed identity
    if (AI_FOUNDRY_KEY) {
      openaiClient = new OpenAI({
        apiKey: AI_FOUNDRY_KEY,
        baseURL: `${AI_FOUNDRY_ENDPOINT}/openai/deployments/${AI_FOUNDRY_DEPLOYMENT}`,
        defaultQuery: { 'api-version': '2024-10-01-preview' },
        defaultHeaders: { 'api-key': AI_FOUNDRY_KEY }
      });
    } else {
      const credential = new DefaultAzureCredential();
      const tokenResponse = await credential.getToken('https://cognitiveservices.azure.com/.default');
      
      openaiClient = new OpenAI({
        apiKey: tokenResponse.token,
        baseURL: `${AI_FOUNDRY_ENDPOINT}/openai/deployments/${AI_FOUNDRY_DEPLOYMENT}`,
        defaultQuery: { 'api-version': '2024-10-01-preview' },
        defaultHeaders: { 'api-key': tokenResponse.token }
      });
    }
    
    console.log('✅ OpenAI client initialized');
  } catch (error) {
    console.error('❌ Failed to initialize OpenAI:', error);
    throw error;
  }
}

// Storage helper functions
async function saveThread(userId: string, thread: Thread): Promise<void> {
  const blobName = `${userId}/threads/${thread.threadId}.json`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.upload(JSON.stringify(thread, null, 2), JSON.stringify(thread).length, {
    blobHTTPHeaders: { blobContentType: 'application/json' }
  });
}

async function loadThread(userId: string, threadId: string): Promise<Thread | null> {
  try {
    const blobName = `${userId}/threads/${threadId}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const downloadResponse = await blockBlobClient.download(0);
    const content = await streamToString(downloadResponse.readableStreamBody!);
    return JSON.parse(content);
  } catch (error: any) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}

async function listThreads(userId: string): Promise<Thread[]> {
  const threads: Thread[] = [];
  const prefix = `${userId}/threads/`;
  
  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    if (blob.name.endsWith('.json')) {
      const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
      const downloadResponse = await blockBlobClient.download(0);
      const content = await streamToString(downloadResponse.readableStreamBody!);
      threads.push(JSON.parse(content));
    }
  }
  
  // Sort by updatedAt descending
  return threads.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

async function deleteThread(userId: string, threadId: string): Promise<void> {
  // Delete thread metadata
  const threadBlobName = `${userId}/threads/${threadId}.json`;
  const threadBlobClient = containerClient.getBlockBlobClient(threadBlobName);
  await threadBlobClient.deleteIfExists();
  
  // Delete all messages in the thread
  const messagesPrefix = `${userId}/messages/${threadId}/`;
  for await (const blob of containerClient.listBlobsFlat({ prefix: messagesPrefix })) {
    const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
    await blockBlobClient.deleteIfExists();
  }
}

async function saveMessage(userId: string, message: Message): Promise<void> {
  const blobName = `${userId}/messages/${message.threadId}/${message.messageId}.json`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.upload(JSON.stringify(message, null, 2), JSON.stringify(message).length, {
    blobHTTPHeaders: { blobContentType: 'application/json' }
  });
}

async function loadMessages(userId: string, threadId: string): Promise<Message[]> {
  const messages: Message[] = [];
  const prefix = `${userId}/messages/${threadId}/`;
  
  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    if (blob.name.endsWith('.json')) {
      const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
      const downloadResponse = await blockBlobClient.download(0);
      const content = await streamToString(downloadResponse.readableStreamBody!);
      messages.push(JSON.parse(content));
    }
  }
  
  // Sort by timestamp ascending
  return messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

async function savePreferences(userId: string, preferences: UserPreferences): Promise<void> {
  const blobName = `${userId}/preferences.json`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.upload(JSON.stringify(preferences, null, 2), JSON.stringify(preferences).length, {
    blobHTTPHeaders: { blobContentType: 'application/json' }
  });
}

async function loadPreferences(userId: string): Promise<UserPreferences> {
  try {
    const blobName = `${userId}/preferences.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const downloadResponse = await blockBlobClient.download(0);
    const content = await streamToString(downloadResponse.readableStreamBody!);
    return JSON.parse(content);
  } catch (error: any) {
    // Return defaults if not found
    return {
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 2000,
      systemPrompt: 'You are a helpful AI assistant.'
    };
  }
}

// Utility function to convert stream to string
async function streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on('data', (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    readableStream.on('error', reject);
  });
}

// Express app setup
const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// API Routes

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all threads
app.get('/api/threads', async (req: Request, res: Response) => {
  try {
    const threads = await listThreads(STATIC_USER_ID);
    res.json(threads);
  } catch (error) {
    console.error('Error listing threads:', error);
    res.status(500).json({ error: 'Failed to list threads' });
  }
});

// Create new thread
app.post('/api/threads', async (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    const thread: Thread = {
      threadId: uuidv4(),
      title: title || 'New Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0
    };
    
    await saveThread(STATIC_USER_ID, thread);
    res.json(thread);
  } catch (error) {
    console.error('Error creating thread:', error);
    res.status(500).json({ error: 'Failed to create thread' });
  }
});

// Get thread by ID
app.get('/api/threads/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const thread = await loadThread(STATIC_USER_ID, threadId);
    
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }
    
    res.json(thread);
  } catch (error) {
    console.error('Error loading thread:', error);
    res.status(500).json({ error: 'Failed to load thread' });
  }
});

// Delete thread
app.delete('/api/threads/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    await deleteThread(STATIC_USER_ID, threadId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting thread:', error);
    res.status(500).json({ error: 'Failed to delete thread' });
  }
});

// Get messages for a thread
app.get('/api/threads/:threadId/messages', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const messages = await loadMessages(STATIC_USER_ID, threadId);
    res.json(messages);
  } catch (error) {
    console.error('Error loading messages:', error);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Send message and get AI response
app.post('/api/threads/:threadId/messages', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const { content } = req.body;
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Message content is required' });
    }
    
    // Load thread
    const thread = await loadThread(STATIC_USER_ID, threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }
    
    // Load preferences
    const preferences = await loadPreferences(STATIC_USER_ID);
    
    // Load existing messages for context
    const existingMessages = await loadMessages(STATIC_USER_ID, threadId);
    
    // Save user message
    const userMessage: Message = {
      messageId: uuidv4(),
      threadId,
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };
    await saveMessage(STATIC_USER_ID, userMessage);
    
    // Prepare messages for OpenAI (add system prompt)
    const openaiMessages = [
      { role: 'system', content: preferences.systemPrompt },
      ...existingMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content }
    ];
    
    // Set response headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    let assistantContent = '';
    const assistantMessageId = uuidv4();
    
    try {
      // Call OpenAI with streaming
      const stream = await openaiClient.chat.completions.create({
        model: preferences.model,
        messages: openaiMessages as any,
        temperature: preferences.temperature,
        max_tokens: preferences.maxTokens,
        stream: true
      });
      
      // Send message ID first
      res.write(`data: ${JSON.stringify({ messageId: assistantMessageId, type: 'start' })}\n\n`);
      
      // Stream the response
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          assistantContent += delta;
          res.write(`data: ${JSON.stringify({ content: delta, type: 'delta' })}\n\n`);
        }
      }
      
      // Save assistant message
      const assistantMessage: Message = {
        messageId: assistantMessageId,
        threadId,
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date().toISOString()
      };
      await saveMessage(STATIC_USER_ID, assistantMessage);
      
      // Update thread metadata
      thread.updatedAt = new Date().toISOString();
      thread.messageCount = existingMessages.length + 2; // +2 for user and assistant messages
      
      // Update title if this is the first message
      if (thread.messageCount === 2 && thread.title === 'New Chat') {
        // Use first few words of user message as title
        thread.title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      }
      
      await saveThread(STATIC_USER_ID, thread);
      
      // Send completion
      res.write(`data: ${JSON.stringify({ type: 'done', thread })}\n\n`);
      res.end();
      
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Failed to generate response' })}\n\n`);
      res.end();
    }
    
  } catch (error) {
    console.error('Error processing message:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process message' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Failed to process message' })}\n\n`);
      res.end();
    }
  }
});

// Get user preferences
app.get('/api/preferences', async (req: Request, res: Response) => {
  try {
    const preferences = await loadPreferences(STATIC_USER_ID);
    res.json(preferences);
  } catch (error) {
    console.error('Error loading preferences:', error);
    res.status(500).json({ error: 'Failed to load preferences' });
  }
});

// Update user preferences
app.put('/api/preferences', async (req: Request, res: Response) => {
  try {
    const preferences: UserPreferences = req.body;
    
    // Validate preferences
    if (typeof preferences.temperature !== 'number' || 
        preferences.temperature < 0 || 
        preferences.temperature > 2) {
      return res.status(400).json({ error: 'Temperature must be between 0 and 2' });
    }
    
    if (typeof preferences.maxTokens !== 'number' || 
        preferences.maxTokens < 1 || 
        preferences.maxTokens > 16000) {
      return res.status(400).json({ error: 'Max tokens must be between 1 and 16000' });
    }
    
    await savePreferences(STATIC_USER_ID, preferences);
    res.json(preferences);
  } catch (error) {
    console.error('Error saving preferences:', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// Start server
async function startServer() {
  try {
    await initializeStorage();
    await initializeOpenAI();
    
    app.listen(PORT, () => {
      console.log(`🚀 AI Chat Backend running on port ${PORT}`);
      console.log(`📦 Storage: ${STORAGE_ACCOUNT_NAME}/${STORAGE_CONTAINER_NAME}`);
      console.log(`🤖 AI Foundry: ${AI_FOUNDRY_ENDPOINT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
