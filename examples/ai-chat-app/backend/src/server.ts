import express, { Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { FoundryAgentClient } from './agents/foundryClient.js';
import { AgentManager, AgentMetadata, AgentThread } from './agents/agentManager.js';
import { CosmosAgentManager } from './agents/cosmosAgentManager.js';
import { requireAuth, getUserId, Request } from './auth/jwtAuthMiddleware.js';
// JWT Bearer token validation for SPA + API architecture
// Frontend uses MSAL to acquire tokens, backend validates them

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

interface MCPServer {
  id: string;
  name: string;
  url: string;
  headerName: string;
  apiKey: string;
}

interface UserPreferences {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  enabledTools: string[];
  enabledMcpServers: string[];
}

// Environment variables
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 5000;
const STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME || '';
const STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'chat-data';
const AI_FOUNDRY_ENDPOINT = process.env.AI_FOUNDRY_ENDPOINT || '';
const AI_FOUNDRY_DEPLOYMENT = process.env.AI_FOUNDRY_DEPLOYMENT_NAME || 'gpt-5-mini';
const AI_FOUNDRY_KEY = process.env.AI_FOUNDRY_KEY || '';
const AI_FOUNDRY_PROJECT_ENDPOINT = process.env.AI_FOUNDRY_PROJECT_ENDPOINT || '';
const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT || '';
const COSMOS_DATABASE_NAME = process.env.COSMOS_DATABASE_NAME || 'agent-metadata';
// No session secret needed - Easy Auth handles session management


// Parse MCP servers from environment variable
const MCP_SERVERS_CONFIG = process.env['mcp-servers-config'] || '{"mcp_servers":[]}';
let MCP_SERVERS: MCPServer[] = [];
try {
  const parsed = JSON.parse(MCP_SERVERS_CONFIG);
  MCP_SERVERS = (parsed.mcp_servers || []).map((server: any) => ({
    id: server.id || '',
    name: server.name || '',
    url: server.url || '',
    headerName: server.headerName || '',
    apiKey: server.apiKey || ''
  })).filter((server: MCPServer) => server.id && server.url);
} catch (error) {
  console.error('Failed to parse mcp-servers-config:', error);
}

// Static user ID (like in OCR app)
const STATIC_USER_ID = 'demo';

// Azure clients
let blobServiceClient: BlobServiceClient;
let containerClient: any;
let openaiClient: OpenAI;
let foundryAgentClient: FoundryAgentClient | null = null;
let agentManager: AgentManager | CosmosAgentManager | null = null;

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
    console.log('🔧 Initializing OpenAI client...');
    console.log(`  Endpoint: ${AI_FOUNDRY_ENDPOINT}`);
    console.log(`  Deployment: ${AI_FOUNDRY_DEPLOYMENT}`);
    console.log(`  Has API Key: ${!!AI_FOUNDRY_KEY}`);
    
    // Use API key if provided (for Azure deployment), otherwise use managed identity
    if (AI_FOUNDRY_KEY) {
      console.log('  Using API key from Key Vault');
      openaiClient = new OpenAI({
        apiKey: AI_FOUNDRY_KEY,
        baseURL: `${AI_FOUNDRY_ENDPOINT}/openai/deployments/${AI_FOUNDRY_DEPLOYMENT}`,
        defaultQuery: { 'api-version': '2024-10-01-preview' },
        defaultHeaders: { 'api-key': AI_FOUNDRY_KEY },
        timeout: 30000  // 30 second timeout
      });
    } else {
      console.log('  Using Managed Identity');
      const credential = new DefaultAzureCredential();
      const tokenResponse = await credential.getToken('https://cognitiveservices.azure.com/.default');
      
      openaiClient = new OpenAI({
        apiKey: tokenResponse.token,
        baseURL: `${AI_FOUNDRY_ENDPOINT}/openai/deployments/${AI_FOUNDRY_DEPLOYMENT}`,
        defaultQuery: { 'api-version': '2024-10-01-preview' },
        defaultHeaders: { 'api-key': tokenResponse.token },
        timeout: 30000  // 30 second timeout
      });
    }
    
    console.log('✅ OpenAI client initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize OpenAI:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}

// Initialize Foundry Agent Client
async function initializeAgentClient() {
  try {
    if (!AI_FOUNDRY_PROJECT_ENDPOINT) {
      console.log('ℹ️  AI_FOUNDRY_PROJECT_ENDPOINT not set, skipping agent client initialization');
      return;
    }

    console.log('🤖 Initializing Foundry Agent Client...');
    foundryAgentClient = new FoundryAgentClient(AI_FOUNDRY_PROJECT_ENDPOINT);
    await foundryAgentClient.initialize();
    
    // Initialize agent manager (Cosmos DB required)
    if (COSMOS_ENDPOINT && COSMOS_DATABASE_NAME) {
      console.log('📊 Using Cosmos DB for agent metadata');
      const cosmosManager = new CosmosAgentManager(COSMOS_ENDPOINT, COSMOS_DATABASE_NAME);
      await cosmosManager.initialize();
      agentManager = cosmosManager;
    } else {
      console.log('⚠️  Cosmos DB not configured for agent metadata');
      return;
    }
    
    console.log('✅ Foundry Agent Client initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Foundry Agent Client:', error);
    // Don't throw - agent functionality is optional
  }
}

// Helper function to find the Default agent by name
async function getDefaultAgent(): Promise<{ agentId: string; foundryAgentId: string } | null> {
  try {
    if (!foundryAgentClient || !agentManager) return null;
    
    // Get all agents from Foundry
    const foundryAgents = await foundryAgentClient.listAgents();
    
    // Find agent with name "Default" (case-sensitive)
    const defaultAgent = foundryAgents.find((a: any) => a.name === 'Default');
    
    if (!defaultAgent) {
      console.error('⚠️  No agent named "Default" found in Foundry. Please create one manually.');
      return null;
    }
    
    return {
      agentId: defaultAgent.id,
      foundryAgentId: defaultAgent.id
    };
  } catch (error) {
    console.error('⚠️  Failed to get default agent:', error);
    return null;
  }
}

// ============================================================================
// DEPRECATED BLOB STORAGE FUNCTIONS - KEPT FOR REFERENCE
// Threads are now managed via Agent Service + Cosmos DB
// ============================================================================
/*
async function saveThread(userId: string, thread: Thread): Promise<void> { ... }
async function loadThread(userId: string, threadId: string): Promise<Thread | null> { ... }
async function listThreads(userId: string): Promise<Thread[]> { ... }
async function deleteThread(userId: string, threadId: string): Promise<void> { ... }
async function saveMessage(userId: string, message: Message): Promise<void> { ... }
async function loadMessages(userId: string, threadId: string): Promise<Message[]> { ... }
*/

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
      temperature: 1,
      maxTokens: 2000,
      systemPrompt: 'You are a helpful AI assistant.',
      enabledTools: ['regex_execute', 'calculate'],
      enabledMcpServers: []
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

// Function tool definitions
const AVAILABLE_TOOLS = {
  regex_execute: {
    type: 'function' as const,
    function: {
      name: 'regex_execute',
      description: 'Execute a regular expression pattern against text. Useful for pattern matching, text extraction, validation, and text analysis. Returns all matches with their positions.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The regular expression pattern to match (without delimiters). Example: "\\d{3}-\\d{4}" for phone numbers.'
          },
          text: {
            type: 'string',
            description: 'The text to search within.'
          },
          flags: {
            type: 'string',
            description: 'Regex flags: g (global), i (case-insensitive), m (multiline), s (dotall). Default: "g"',
            enum: ['', 'g', 'i', 'm', 's', 'gi', 'gm', 'gs', 'im', 'is', 'ms', 'gim', 'gis', 'gms', 'ims', 'gims']
          }
        },
        required: ['pattern', 'text']
      }
    }
  },
  calculate: {
    type: 'function' as const,
    function: {
      name: 'calculate',
      description: 'Perform mathematical calculations and evaluate mathematical expressions. Supports arithmetic operations (+, -, *, /), exponentiation (**), modulo (%), parentheses, and common math functions (sqrt, sin, cos, tan, log, etc.). Use this for any mathematical computation.',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'The mathematical expression to evaluate. Examples: "2 + 2", "sqrt(16)", "sin(3.14159/2)", "(5 + 3) * 2". Supports: +, -, *, /, **, %, sqrt, abs, sin, cos, tan, log, ln, exp, floor, ceil, round, min, max, PI, E.'
          }
        },
        required: ['expression']
      }
    }
  },
  get_datetime: {
    type: 'function' as const,
    function: {
      name: 'get_datetime',
      description: 'Get current date and time in UTC and optionally in a specific timezone. Use this to provide current date/time information, check what day it is, or convert between timezones. Returns ISO 8601 formatted datetime strings.',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'Optional IANA timezone identifier (e.g., "America/New_York", "Europe/Stockholm", "Asia/Tokyo"). If omitted, returns UTC only. Use this to get local time for a specific location.'
          }
        },
        required: []
      }
    }
  }
};

// Function tool handlers
async function executeRegex(pattern: string, text: string, flags: string = 'g'): Promise<string> {
  try {
    const regex = new RegExp(pattern, flags);
    const matches: any[] = [];
    
    if (flags.includes('g')) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          match: match[0],
          index: match.index,
          groups: match.slice(1)
        });
        // Prevent infinite loop on zero-length matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    } else {
      const match = regex.exec(text);
      if (match) {
        matches.push({
          match: match[0],
          index: match.index,
          groups: match.slice(1)
        });
      }
    }
    
    return JSON.stringify({
      success: true,
      matchCount: matches.length,
      matches: matches
    }, null, 2);
  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: error.message
    }, null, 2);
  }
}

async function calculate(expression: string): Promise<string> {
  try {
    // Security: sanitize and validate the expression
    // Only allow numbers, operators, whitespace, parentheses, and known math functions
    const allowedPattern = /^[\d\s+\-*/.()%,]+|sqrt|abs|sin|cos|tan|log|ln|exp|floor|ceil|round|min|max|PI|E|\*\*$/;
    const sanitized = expression
      .replace(/\s+/g, '') // Remove whitespace for checking
      .replace(/PI/g, Math.PI.toString())
      .replace(/E(?![a-z])/g, Math.E.toString());
    
    // Replace math functions with Math. equivalents
    let evalExpression = expression
      .replace(/PI/g, Math.PI.toString())
      .replace(/E(?![a-z])/g, Math.E.toString())
      .replace(/sqrt\(/g, 'Math.sqrt(')
      .replace(/abs\(/g, 'Math.abs(')
      .replace(/sin\(/g, 'Math.sin(')
      .replace(/cos\(/g, 'Math.cos(')
      .replace(/tan\(/g, 'Math.tan(')
      .replace(/log\(/g, 'Math.log10(')
      .replace(/ln\(/g, 'Math.log(')
      .replace(/exp\(/g, 'Math.exp(')
      .replace(/floor\(/g, 'Math.floor(')
      .replace(/ceil\(/g, 'Math.ceil(')
      .replace(/round\(/g, 'Math.round(')
      .replace(/min\(/g, 'Math.min(')
      .replace(/max\(/g, 'Math.max(')
      .replace(/\*\*/g, '**'); // Exponentiation

    // Validate no dangerous patterns (no letters except in Math. calls)
    const dangerousPattern = /[a-zA-Z]+/g;
    const words = evalExpression.match(dangerousPattern) || [];
    const safeWords = words.every(word => word === 'Math');
    
    if (!safeWords) {
      throw new Error('Expression contains invalid characters or functions');
    }

    // Evaluate the expression
    const result = eval(evalExpression);
    
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error('Calculation resulted in an invalid number');
    }

    return JSON.stringify({
      success: true,
      expression: expression,
      result: result
    }, null, 2);
  } catch (error: any) {
    return JSON.stringify({
      success: false,
      expression: expression,
      error: error.message
    }, null, 2);
  }
}

async function getDatetime(timezone?: string): Promise<string> {
  try {
    const now = new Date();
    
    const result: any = {
      success: true,
      utc: {
        iso: now.toISOString(),
        date: now.toISOString().split('T')[0],
        time: now.toISOString().split('T')[1].split('.')[0],
        timestamp: now.getTime(),
        timezone: 'UTC'
      }
    };

    // If timezone is requested, add local time for that timezone
    if (timezone) {
      try {
        // Use Intl.DateTimeFormat to get formatted date/time in the requested timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        
        const parts = formatter.formatToParts(now);
        const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
        
        const localDate = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
        const localTime = `${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
        
        result.local = {
          datetime: `${localDate}T${localTime}`,
          date: localDate,
          time: localTime,
          timezone: timezone
        };
      } catch (tzError: any) {
        result.local = {
          error: `Invalid timezone: ${timezone}. Use IANA timezone identifiers like "America/New_York", "Europe/Stockholm", "Asia/Tokyo".`
        };
      }
    }

    return JSON.stringify(result, null, 2);
  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: error.message
    }, null, 2);
  }
}

// Express app setup
const app = express();

app.use(helmet());
// CORS is handled by Container Apps ingress - no need for app-level CORS middleware
app.use(morgan('combined'));
app.use(express.json());
// No session or passport needed - Easy Auth handles everything at ingress level

console.log('✅ Express app configured with Easy Auth');
console.log('   Authentication handled by Container Apps');
console.log('   User info available in X-MS-CLIENT-PRINCIPAL header');

// API Routes

// Health check (public endpoint)
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// User info endpoint (authenticated)
app.get('/api/user', requireAuth, (req: Request, res: Response) => {
  res.json({
    userId: getUserId(req),
    email: req.user?.email || 'unknown',
    name: req.user?.name || 'unknown'
  });
});

// Get all threads (from all agents) - PROTECTED
app.get('/api/threads', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    
    if (!agentManager) {
      return res.json([]);
    }
    
    // Get all agents
    const agents = await agentManager.listAgents();
    
    // Get threads from all agents, filtered by user
    const allThreads: any[] = [];
    for (const agent of agents) {
      const agentThreads: AgentThread[] = await agentManager.listThreads(agent.id);
      // Filter threads by userId and add agent info
      for (const thread of agentThreads) {
        if (thread.userId === userId) {
          allThreads.push({
            threadId: thread.id,
            title: thread.title || 'New Chat',
            createdAt: thread.createdAt,
            updatedAt: thread.lastMessageAt,
            messageCount: 0, // Not tracked anymore
            agentId: thread.agentId,
            isDefaultAgent: agent.isDefault || false
          });
        }
      }
    }
    
    // Sort by updated time descending
    allThreads.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    
    res.json(allThreads);
  } catch (error) {
    console.error('Error listing threads:', error);
    res.status(500).json({ error: 'Failed to list threads' });
  }
});

// Create new thread - REMOVED: Threads are now created on first message
// app.post('/api/threads', ...)

// Get thread by ID - NOW DEPRECATED (threads managed by agent service)
app.get('/api/threads/:threadId', async (req: Request, res: Response) => {
  try {
    return res.status(410).json({ error: 'This endpoint is deprecated. Threads are now managed via agent service.' });
  } catch (error) {
    console.error('Error loading thread:', error);
    res.status(500).json({ error: 'Failed to load thread' });
  }
});

// Delete thread
app.delete('/api/threads/:threadId', async (req: Request, res: Response) => {
  try {
    if (!agentManager || !foundryAgentClient) {
      return res.status(503).json({ error: 'Agent service not available' });
    }
    
    const { threadId } = req.params;
    
    // Find which agent this thread belongs to
    const agents = await agentManager.listAgents();
    let foundAgent = null;
    for (const agent of agents) {
      const threads = await agentManager.listThreads(agent.id);
      if (threads.some((t: any) => t.id === threadId)) {
        foundAgent = agent;
        break;
      }
    }
    
    if (!foundAgent) {
      return res.status(404).json({ error: 'Thread not found' });
    }
    
    // Delete from Foundry
    await foundryAgentClient.deleteThread(threadId);
    
    // Delete metadata
    if (agentManager instanceof CosmosAgentManager) {
      await agentManager.deleteThread(threadId, foundAgent.id);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting thread:', error);
    res.status(500).json({ error: 'Failed to delete thread' });
  }
});

// Update thread title - NOW DEPRECATED
app.patch('/api/threads/:threadId', async (req: Request, res: Response) => {
  try {
    return res.status(410).json({ error: 'This endpoint is deprecated. Thread titles are auto-generated.' });
  } catch (error) {
    console.error('Error updating thread:', error);
    res.status(500).json({ error: 'Failed to update thread' });
  }
});

// Get messages for a thread
app.get('/api/threads/:threadId/messages', async (req: Request, res: Response) => {
  try {
    if (!foundryAgentClient) {
      return res.json([]);
    }
    
    const { threadId } = req.params;
    const messages = await foundryAgentClient.getMessages(threadId);
    
    // Convert to expected format
    const formattedMessages = messages.map((m: any) => ({
      messageId: m.id,
      threadId: threadId,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.createdAt).toISOString()
    }));
    
    res.json(formattedMessages);
  } catch (error) {
    console.error('Error loading messages:', error);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Send message and get AI response (unified endpoint for both default and imported agents) - PROTECTED
app.post('/api/threads/:threadId/messages', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { threadId } = req.params;
    const { content, agentId } = req.body;
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Message content is required' });
    }
    
    if (!agentManager || !foundryAgentClient) {
      return res.status(503).json({ error: 'Agent service not available' });
    }
    
    // If no agentId provided, use default agent
    let targetAgentId = agentId;
    let foundryAgentId: string;
    
    if (!targetAgentId) {
      // Find the Default agent by name
      const defaultAgent = await getDefaultAgent();
      
      if (!defaultAgent) {
        return res.status(500).json({ 
          error: 'Default agent not found. Please create an agent named "Default" in Azure AI Foundry.' 
        });
      }
      
      targetAgentId = defaultAgent.agentId;
      foundryAgentId = defaultAgent.foundryAgentId;
      
      console.log(`💬 Using default agent for chat (Foundry ID: ${foundryAgentId})`);
    } else {
      // Look up the agent to get the Foundry agent ID
      const agent = await agentManager.getAgent(targetAgentId);
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      foundryAgentId = (agent as AgentMetadata).foundryAgentId || agent.id;
      
      console.log(`🤖 Using imported agent: ${targetAgentId} (Foundry ID: ${foundryAgentId})`);
    }
    
    // Check if this is a new thread (threadId === 'new')
    let actualThreadId = threadId;
    if (threadId === 'new') {
      // Create new thread in Foundry
      actualThreadId = await foundryAgentClient.createThread(foundryAgentId);
      
      // Save thread metadata with userId
      await agentManager.saveThread({
        id: actualThreadId,
        agentId: targetAgentId,
        userId: userId,
        createdAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
        title: content.slice(0, 50) + (content.length > 50 ? '...' : '')
      });
    }
    
    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    res.write(`data: ${JSON.stringify({ type: 'start', threadId: actualThreadId })}\n\n`);
    
    try {
      // Stream response from agent using Foundry agent ID
      for await (const chunk of foundryAgentClient.sendMessage(foundryAgentId, actualThreadId, content)) {
        if (chunk.type === 'text' && chunk.content) {
          res.write(`data: ${JSON.stringify({ 
            type: 'content',
            content: chunk.content 
          })}\n\n`);
        } else if (chunk.type === 'tool_call') {
          res.write(`data: ${JSON.stringify({ 
            type: 'tool_call',
            toolName: chunk.toolName,
            toolArgs: chunk.toolArgs
          })}\n\n`);
        } else if (chunk.type === 'error') {
          res.write(`data: ${JSON.stringify({ 
            type: 'error',
            error: chunk.content 
          })}\n\n`);
        } else if (chunk.type === 'done') {
          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        }
      }
      
      // Update thread last message time
      if (agentManager instanceof CosmosAgentManager) {
        await agentManager.updateThreadLastMessage(actualThreadId, targetAgentId, new Date().toISOString());
      }
      
      res.end();
    } catch (streamError) {
      console.error('Error streaming message:', streamError);
      res.write(`data: ${JSON.stringify({ 
        type: 'error',
        error: 'Failed to process message' 
      })}\n\n`);
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

// Get available MCP servers
app.get('/api/mcp-servers', async (req: Request, res: Response) => {
  try {
    // Return list of available MCP servers (configured by admin)
    const mcpServers = MCP_SERVERS.map(server => ({
      id: server.id,
      name: server.name
    }));
    res.json(mcpServers);
  } catch (error) {
    console.error('Error getting MCP servers:', error);
    res.status(500).json({ error: 'Failed to get MCP servers' });
  }
});

// ============================================================================
// AGENT ENDPOINTS
// ============================================================================

// Get all imported agents (user-specific) - PROTECTED
app.get('/api/agents', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    
    if (!agentManager || !foundryAgentClient) {
      return res.json([]);
    }
    
    // Get user's imported agents (personal workspace)
    const importedAgents = await agentManager.listAgents();
    const userImportedAgents = importedAgents.filter((agent: AgentMetadata) => 
      agent.userId === userId && 
      agent.foundryAgentId !== 'default' && 
      agent.name !== 'Default'
    );
    
    // Get full details from Foundry for each imported agent
    const foundryAgents = await foundryAgentClient.listAgents();
    
    const agentsWithDetails = userImportedAgents.map((imported: AgentMetadata) => {
      const foundryAgent = foundryAgents.find((fa: any) => fa.id === imported.foundryAgentId);
      
      return {
        id: imported.foundryAgentId || imported.id,
        name: foundryAgent?.name || imported.name,
        description: foundryAgent?.instructions?.substring(0, 100),
        model: foundryAgent?.model || imported.model,
        instructions: foundryAgent?.instructions,
        isImported: true,
        isDefault: false,
        importedAt: imported.importedAt,
        foundryProjectEndpoint: AI_FOUNDRY_PROJECT_ENDPOINT
      };
    });
    
    res.json(agentsWithDetails);
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// Discover agents from Foundry project (for import) - PROTECTED
app.post('/api/agents/discover', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!foundryAgentClient) {
      return res.status(503).json({ 
        error: 'Agent service not configured. Set AI_FOUNDRY_PROJECT_ENDPOINT environment variable.' 
      });
    }
    
    const agents = await foundryAgentClient.listAgents();
    
    // Filter out the "Default" agent from discovery (users get it automatically)
    const importableAgents = agents.filter((agent: any) => agent.id !== 'default' && agent.name !== 'Default');
    
    res.json(importableAgents);
  } catch (error) {
    console.error('Error discovering agents:', error);
    res.status(500).json({ error: 'Failed to discover agents from Foundry' });
  }
});

// Import an agent - PROTECTED
app.post('/api/agents/import', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    
    if (!agentManager || !foundryAgentClient) {
      return res.status(503).json({ error: 'Agent service not available' });
    }
    
    const { agentId } = req.body;
    
    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }
    
    // Prevent importing the default agent
    if (agentId === 'default') {
      return res.status(400).json({ error: 'Cannot import the default agent' });
    }
    
    // Get agent details from Foundry
    const agent = await foundryAgentClient.getAgent(agentId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found in Foundry project' });
    }
    
    // Use clean display name, but prepend "imported-agent-" to internal ID for tracking
    const internalId = `imported-agent-${agent.id}`;
    
    // Save to local storage with user ID
    await agentManager.importAgent({
      id: internalId,                // Internal ID with prefix
      foundryAgentId: agent.id,      // Original Foundry agent ID
      name: agent.name,              // Clean display name for users
      instructions: agent.instructions,
      model: agent.model,
      importedAt: new Date().toISOString(),
      foundryProjectEndpoint: AI_FOUNDRY_PROJECT_ENDPOINT,
      isDefault: false,
      userId: userId                 // Associate with user
    });
    
    res.json({ success: true, agent: { ...agent, id: internalId, name: agent.name } });
  } catch (error) {
    console.error('Error importing agent:', error);
    res.status(500).json({ error: 'Failed to import agent' });
  }
});

// Delete an imported agent
app.delete('/api/agents/:agentId', async (req: Request, res: Response) => {
  try {
    if (!agentManager) {
      return res.status(503).json({ error: 'Agent service not available' });
    }
    
    const { agentId } = req.params;
    await agentManager.removeAgent(agentId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// Get threads for an agent
app.get('/api/agents/:agentId/threads', async (req: Request, res: Response) => {
  try {
    if (!agentManager) {
      return res.json([]);
    }
    
    const { agentId } = req.params;
    const threads = await agentManager.listThreads(agentId);
    res.json(threads);
  } catch (error) {
    console.error('Error listing agent threads:', error);
    res.status(500).json({ error: 'Failed to list threads' });
  }
});

// Create a new thread for an agent - PROTECTED
app.post('/api/agents/:agentId/threads', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    
    if (!foundryAgentClient || !agentManager) {
      return res.status(503).json({ error: 'Agent service not available' });
    }
    
    const { agentId } = req.params;
    
    // Verify agent exists
    const agent = await agentManager.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Create thread in Foundry
    const threadId = await foundryAgentClient.createThread(agentId);
    
    // Save thread metadata with userId
    const now = new Date().toISOString();
    await agentManager.saveThread({
      id: threadId,
      agentId: agentId,
      userId: userId,
      createdAt: now,
      lastMessageAt: now,
      title: 'New conversation'
    });
    
    res.json({ threadId });
  } catch (error) {
    console.error('Error creating agent thread:', error);
    res.status(500).json({ error: 'Failed to create thread' });
  }
});

// Send a message to an agent (streaming response)
app.post('/api/agents/:agentId/threads/:threadId/messages', async (req: Request, res: Response) => {
  try {
    if (!foundryAgentClient || !agentManager) {
      return res.status(503).json({ error: 'Agent service not available' });
    }
    
    const { agentId, threadId } = req.params;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Send initial acknowledgment
    res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);
    
    try {
      // Stream response from agent
      for await (const chunk of foundryAgentClient.sendMessage(agentId, threadId, message)) {
        if (chunk.type === 'text' && chunk.content) {
          res.write(`data: ${JSON.stringify({ 
            type: 'content',
            content: chunk.content 
          })}\n\n`);
        } else if (chunk.type === 'tool_call') {
          res.write(`data: ${JSON.stringify({ 
            type: 'tool_call',
            toolName: chunk.toolName,
            toolArgs: chunk.toolArgs
          })}\n\n`);
        } else if (chunk.type === 'error') {
          res.write(`data: ${JSON.stringify({ 
            type: 'error',
            error: chunk.content 
          })}\n\n`);
        } else if (chunk.type === 'done') {
          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        }
      }
      
      // Update thread last message time
      if (agentManager instanceof CosmosAgentManager) {
        await agentManager.updateThreadLastMessage(threadId, agentId, new Date().toISOString());
      } else if (agentManager) {
        await (agentManager as AgentManager).updateThreadLastMessage(threadId, new Date().toISOString());
      }
      
      res.end();
    } catch (streamError) {
      res.write(`data: ${JSON.stringify({ 
        type: 'error',
        error: 'Failed to process message' 
      })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Error sending agent message:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
});

// Get messages from an agent thread
app.get('/api/agents/:agentId/threads/:threadId/messages', async (req: Request, res: Response) => {
  try {
    if (!foundryAgentClient) {
      return res.json([]);
    }
    
    const { threadId } = req.params;
    const messages = await foundryAgentClient.getMessages(threadId);
    res.json(messages);
  } catch (error) {
    console.error('Error getting agent messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Delete an agent thread
app.delete('/api/agents/:agentId/threads/:threadId', async (req: Request, res: Response) => {
  try {
    if (!foundryAgentClient || !agentManager) {
      return res.status(503).json({ error: 'Agent service not available' });
    }
    
    const { agentId, threadId } = req.params;
    
    // Delete from Foundry
    await foundryAgentClient.deleteThread(threadId);
    
    // Delete metadata
    if (agentManager instanceof CosmosAgentManager) {
      await agentManager.deleteThread(threadId, agentId);
    } else {
      await (agentManager as AgentManager).deleteThread(threadId);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent thread:', error);
    res.status(500).json({ error: 'Failed to delete thread' });
  }
});

// Start server
async function startServer() {
  try {
    console.log('🚀 Starting AI Chat Backend...');
    console.log(`  Node.js version: ${process.version}`);
    console.log(`  Environment: ${NODE_ENV}`);
    console.log(`  Port: ${PORT}`);
    
    console.log('\n📦 Initializing storage...');
    const storageTimeout = setTimeout(() => {
      console.error('⚠️  Storage initialization taking too long (>30s)');
    }, 30000);
    await initializeStorage();
    clearTimeout(storageTimeout);
    
    console.log('\n🤖 Initializing OpenAI...');
    const openaiTimeout = setTimeout(() => {
      console.error('⚠️  OpenAI initialization taking too long (>30s)');
    }, 30000);
    await initializeOpenAI();
    clearTimeout(openaiTimeout);
    
    console.log('\n🤖 Initializing Agent Client...');
    await initializeAgentClient();
    
    console.log('\n🎉 Starting HTTP server...');
    app.listen(PORT, () => {
      console.log(`\n✅ AI Chat Backend running on port ${PORT}`);
      console.log(`   Storage: ${STORAGE_ACCOUNT_NAME}/${STORAGE_CONTAINER_NAME}`);
      console.log(`   AI Foundry: ${AI_FOUNDRY_ENDPOINT}`);
      console.log(`   Deployment: ${AI_FOUNDRY_DEPLOYMENT}`);
      console.log('\nReady to accept connections!\n');
    });
  } catch (error) {
    console.error('\n❌ Failed to start server:', error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    process.exit(1);
  }
}

startServer();
