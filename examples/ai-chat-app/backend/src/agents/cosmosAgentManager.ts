// Agent metadata manager using Azure Cosmos DB
// Stores ONLY agent import metadata and thread-to-agent associations.
// The actual thread content and messages are stored in Azure AI Foundry's native storage.
import { CosmosClient, Container, Database } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';

// Agent metadata stored in Cosmos
export interface AgentMetadata {
  id: string;
  name: string;
  instructions: string;
  model: string;
  importedAt: string;
  foundryProjectEndpoint: string;
  isDefault?: boolean;      // True for the user's default agent
  partitionKey?: string;     // Same as id for single-partition simplicity
}

// Thread metadata - ONLY stores the association between threads and agents
// The actual thread content lives in Foundry's native storage
export interface AgentThread {
  id: string;              // Thread ID from Foundry
  agentId: string;         // Which agent this thread is associated with (partition key)
  createdAt: string;       // When the thread was created
  lastMessageAt: string;   // Last activity timestamp
  title: string;           // User-friendly title (auto-generated or user-set)
}

export class CosmosAgentManager {
  private client: CosmosClient;
  private database: Database | null = null;
  private agentsContainer: Container | null = null;
  private threadsContainer: Container | null = null;

  constructor(
    private endpoint: string,
    private databaseName: string
  ) {
    const credential = new DefaultAzureCredential();
    this.client = new CosmosClient({
      endpoint: this.endpoint,
      aadCredentials: credential
    });
  }

  /**
   * Initialize database and container references
   */
  async initialize(): Promise<void> {
    this.database = this.client.database(this.databaseName);
    this.agentsContainer = this.database.container('agents');
    this.threadsContainer = this.database.container('threads');
  }

  /**
   * List all imported agents
   */
  async listAgents(): Promise<AgentMetadata[]> {
    if (!this.agentsContainer) throw new Error('Manager not initialized');

    const { resources } = await this.agentsContainer.items
      .query('SELECT * FROM c')
      .fetchAll();
    
    return resources as AgentMetadata[];
  }

  /**
   * Get a specific agent by ID
   */
  async getAgent(agentId: string): Promise<AgentMetadata | null> {
    if (!this.agentsContainer) throw new Error('Manager not initialized');

    try {
      const { resource } = await this.agentsContainer
        .item(agentId, agentId)
        .read<AgentMetadata>();
      return resource || null;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Import (save) an agent
   */
  async importAgent(agent: AgentMetadata): Promise<void> {
    if (!this.agentsContainer) throw new Error('Manager not initialized');

    await this.agentsContainer.items.upsert({
      ...agent,
      partitionKey: agent.id
    });
  }

  /**
   * Remove an agent
   */
  async removeAgent(agentId: string): Promise<void> {
    if (!this.agentsContainer || !this.threadsContainer) {
      throw new Error('Manager not initialized');
    }

    // Delete agent
    await this.agentsContainer.item(agentId, agentId).delete();

    // Delete associated threads (query by partition key)
    const { resources: threads } = await this.threadsContainer.items
      .query({
        query: 'SELECT c.id FROM c WHERE c.agentId = @agentId',
        parameters: [{ name: '@agentId', value: agentId }]
      })
      .fetchAll();

    for (const thread of threads) {
      await this.threadsContainer.item(thread.id, agentId).delete();
    }
  }

  /**
   * List threads for a specific agent (efficient partition query)
   */
  async listThreads(agentId: string): Promise<AgentThread[]> {
    if (!this.threadsContainer) throw new Error('Manager not initialized');

    const { resources } = await this.threadsContainer.items
      .query({
        query: 'SELECT * FROM c WHERE c.agentId = @agentId ORDER BY c.lastMessageAt DESC',
        parameters: [{ name: '@agentId', value: agentId }]
      })
      .fetchAll();

    return resources as AgentThread[];
  }

  /**
   * Get a specific thread
   */
  async getThread(threadId: string, agentId: string): Promise<AgentThread | null> {
    if (!this.threadsContainer) throw new Error('Manager not initialized');

    try {
      const { resource } = await this.threadsContainer
        .item(threadId, agentId)
        .read<AgentThread>();
      return resource || null;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Save a thread
   */
  async saveThread(thread: AgentThread): Promise<void> {
    if (!this.threadsContainer) throw new Error('Manager not initialized');

    await this.threadsContainer.items.upsert(thread);
  }

  /**
   * Delete a thread
   */
  async deleteThread(threadId: string, agentId: string): Promise<void> {
    if (!this.threadsContainer) throw new Error('Manager not initialized');

    await this.threadsContainer.item(threadId, agentId).delete();
  }

  /**
   * Update thread's last message time
   */
  async updateThreadLastMessage(threadId: string, agentId: string, timestamp: string): Promise<void> {
    if (!this.threadsContainer) throw new Error('Manager not initialized');

    const thread = await this.getThread(threadId, agentId);
    if (thread) {
      thread.lastMessageAt = timestamp;
      await this.saveThread(thread);
    }
  }
}
