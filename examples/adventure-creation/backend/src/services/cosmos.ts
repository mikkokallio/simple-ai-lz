import { CosmosClient, Database, Container } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';

// Adventure type matching frontend
export interface Adventure {
  id: string;
  name: string;
  stage: string;
  overview: any;
  conflict: any;
  structure: any;
  locations: any[];
  npcs: any[];
  rewards: any[];
  customStatBlocks: any[];
  createdAt: number;
  updatedAt: number;
  sessionId: string; // For session-based isolation
}

class CosmosService {
  private client: CosmosClient | null = null;
  private database: Database | null = null;
  private container: Container | null = null;

  async initialize(): Promise<void> {
    const endpoint = process.env.COSMOS_ENDPOINT;
    const databaseName = process.env.COSMOS_DATABASE_NAME || 'adventureCreator';
    const containerName = process.env.COSMOS_CONTAINER_NAME || 'adventures';

    if (!endpoint) {
      throw new Error('COSMOS_ENDPOINT environment variable is required');
    }

    console.log('Initializing Cosmos DB client...');
    console.log(`Endpoint: ${endpoint}`);
    console.log(`Database: ${databaseName}, Container: ${containerName}`);

    try {
      // Use Managed Identity for authentication
      const credential = new DefaultAzureCredential();
      
      this.client = new CosmosClient({
        endpoint,
        aadCredentials: credential,
      });

      this.database = this.client.database(databaseName);
      this.container = this.database.container(containerName);

      console.log('✓ Cosmos DB client initialized with Managed Identity');
    } catch (error) {
      console.error('Failed to initialize Cosmos DB client:', error);
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.container) {
      throw new Error('Cosmos DB client not initialized. Call initialize() first.');
    }
  }

  async createAdventure(adventure: Omit<Adventure, 'id' | 'createdAt' | 'updatedAt'>): Promise<Adventure> {
    this.ensureInitialized();

    const newAdventure: Adventure = {
      ...adventure,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { resource } = await this.container!.items.create(newAdventure);
    console.log(`Created adventure: ${resource?.id}`);
    return resource as Adventure;
  }

  async getAdventure(id: string, sessionId: string): Promise<Adventure | null> {
    this.ensureInitialized();

    try {
      const { resource } = await this.container!.item(id, sessionId).read<Adventure>();
      return resource || null;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  async listAdventures(sessionId: string): Promise<Adventure[]> {
    this.ensureInitialized();

    const querySpec = {
      query: 'SELECT * FROM c WHERE c.sessionId = @sessionId ORDER BY c.updatedAt DESC',
      parameters: [{ name: '@sessionId', value: sessionId }],
    };

    const { resources } = await this.container!.items.query<Adventure>(querySpec).fetchAll();
    console.log(`Found ${resources.length} adventures for session ${sessionId}`);
    return resources;
  }

  async updateAdventure(id: string, sessionId: string, updates: Partial<Adventure>): Promise<Adventure> {
    this.ensureInitialized();

    const existing = await this.getAdventure(id, sessionId);
    if (!existing) {
      throw new Error(`Adventure not found: ${id}`);
    }

    const updated: Adventure = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      sessionId, // Ensure partition key doesn't change
      updatedAt: Date.now(),
    };

    const { resource } = await this.container!.item(id, sessionId).replace(updated);
    console.log(`Updated adventure: ${id}`);
    return resource as Adventure;
  }

  async deleteAdventure(id: string, sessionId: string): Promise<void> {
    this.ensureInitialized();

    await this.container!.item(id, sessionId).delete();
    console.log(`Deleted adventure: ${id}`);
  }
}

export const cosmosService = new CosmosService();
