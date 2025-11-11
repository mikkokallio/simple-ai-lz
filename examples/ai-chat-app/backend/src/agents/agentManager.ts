// Agent metadata manager for Azure Blob Storage
// NOTE: This stores ONLY agent import metadata and thread-to-agent associations.
// The actual thread content and messages are stored in Azure AI Foundry's native storage.
// This follows the "metadata index" pattern - we track which threads belong to which agents,
// but Foundry manages the actual conversation state.
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

// Agent metadata stored locally
export interface AgentMetadata {
  id: string;                     // Internal ID (e.g., "imported-agent-xxx" or "default-agent-xxx")
  foundryAgentId?: string;        // Original Foundry agent ID (for imported agents)
  name: string;
  instructions: string;
  model: string;
  importedAt: string;
  foundryProjectEndpoint: string;
  isDefault?: boolean;            // True for the user's default agent
}

// Thread metadata - ONLY stores the association between threads and agents
// The actual thread content lives in Foundry's native storage
export interface AgentThread {
  id: string;              // Thread ID from Foundry
  agentId: string;         // Which agent this thread is associated with
  createdAt: string;       // When the thread was created
  lastMessageAt: string;   // Last activity timestamp
  title: string;           // User-friendly title (auto-generated or user-set)
}

// Storage structure
interface AgentStorage {
  agents: AgentMetadata[];
  threads: AgentThread[];  // Thread metadata index only
}

export class AgentManager {
  private containerClient: ContainerClient;
  private blobName = 'agent-metadata.json';

  constructor(
    storageAccountName: string,
    containerName: string
  ) {
    const credential = new DefaultAzureCredential();
    const blobServiceClient = new BlobServiceClient(
      `https://${storageAccountName}.blob.core.windows.net`,
      credential
    );
    this.containerClient = blobServiceClient.getContainerClient(containerName);
  }

  /**
   * Load agent storage from blob
   */
  private async loadStorage(): Promise<AgentStorage> {
    try {
      const blobClient = this.containerClient.getBlobClient(this.blobName);
      const exists = await blobClient.exists();

      if (!exists) {
        return { agents: [], threads: [] };
      }

      const downloadResponse = await blobClient.download();
      const content = await this.streamToString(downloadResponse.readableStreamBody!);
      return JSON.parse(content);
    } catch (error) {
      console.error('Error loading agent storage:', error);
      return { agents: [], threads: [] };
    }
  }

  /**
   * Save agent storage to blob
   */
  private async saveStorage(storage: AgentStorage): Promise<void> {
    try {
      const blobClient = this.containerClient.getBlockBlobClient(this.blobName);
      const content = JSON.stringify(storage, null, 2);
      await blobClient.upload(content, content.length, {
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });
    } catch (error) {
      console.error('Error saving agent storage:', error);
      throw error;
    }
  }

  /**
   * Helper to convert stream to string
   */
  private async streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on('data', (data: Buffer) => {
        chunks.push(data);
      });
      readableStream.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
      readableStream.on('error', reject);
    });
  }

  /**
   * List all imported agents
   */
  async listAgents(): Promise<AgentMetadata[]> {
    const storage = await this.loadStorage();
    return storage.agents;
  }

  /**
   * Get a specific agent by ID
   */
  async getAgent(agentId: string): Promise<AgentMetadata | null> {
    const storage = await this.loadStorage();
    return storage.agents.find(a => a.id === agentId) || null;
  }

  /**
   * Import (save) an agent
   */
  async importAgent(agent: AgentMetadata): Promise<void> {
    const storage = await this.loadStorage();
    
    // Check if agent already exists
    const existingIndex = storage.agents.findIndex(a => a.id === agent.id);
    
    if (existingIndex >= 0) {
      // Update existing agent
      storage.agents[existingIndex] = agent;
    } else {
      // Add new agent
      storage.agents.push(agent);
    }
    
    await this.saveStorage(storage);
  }

  /**
   * Remove an agent
   */
  async removeAgent(agentId: string): Promise<void> {
    const storage = await this.loadStorage();
    storage.agents = storage.agents.filter(a => a.id !== agentId);
    // Also remove associated threads
    storage.threads = storage.threads.filter(t => t.agentId !== agentId);
    await this.saveStorage(storage);
  }

  /**
   * List threads for a specific agent
   */
  async listThreads(agentId: string): Promise<AgentThread[]> {
    const storage = await this.loadStorage();
    return storage.threads.filter(t => t.agentId === agentId);
  }

  /**
   * Get a specific thread
   */
  async getThread(threadId: string): Promise<AgentThread | null> {
    const storage = await this.loadStorage();
    return storage.threads.find(t => t.id === threadId) || null;
  }

  /**
   * Save a thread
   */
  async saveThread(thread: AgentThread): Promise<void> {
    const storage = await this.loadStorage();
    
    const existingIndex = storage.threads.findIndex(t => t.id === thread.id);
    
    if (existingIndex >= 0) {
      storage.threads[existingIndex] = thread;
    } else {
      storage.threads.push(thread);
    }
    
    await this.saveStorage(storage);
  }

  /**
   * Delete a thread
   */
  async deleteThread(threadId: string): Promise<void> {
    const storage = await this.loadStorage();
    storage.threads = storage.threads.filter(t => t.id !== threadId);
    await this.saveStorage(storage);
  }

  /**
   * Update thread's last message time
   */
  async updateThreadLastMessage(threadId: string, timestamp: string): Promise<void> {
    const storage = await this.loadStorage();
    const thread = storage.threads.find(t => t.id === threadId);
    
    if (thread) {
      thread.lastMessageAt = timestamp;
      await this.saveStorage(storage);
    }
  }
}
