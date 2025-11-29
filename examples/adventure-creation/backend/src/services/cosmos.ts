import { CosmosClient, Database, Container } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { User } from './users.js';
import { Template } from './templates.js';

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
  userId?: string; // Owner of the adventure
}

class CosmosService {
  private client: CosmosClient | null = null;
  private database: Database | null = null;
  private adventuresContainer: Container | null = null;
  private usersContainer: Container | null = null;
  private templatesContainer: Container | null = null;
  
  async initialize(): Promise<void> {
    const endpoint = process.env.COSMOS_ENDPOINT;
    const databaseName = process.env.COSMOS_DATABASE_NAME || 'adventureCreator';

    if (!endpoint) {
      throw new Error('COSMOS_ENDPOINT environment variable is required');
    }

    console.log('Initializing Cosmos DB client...');
    console.log(`Endpoint: ${endpoint}`);
    console.log(`Database: ${databaseName}`);

    try {
      // Use Managed Identity for authentication
      const credential = new DefaultAzureCredential();
      
      this.client = new CosmosClient({
        endpoint,
        aadCredentials: credential,
      });

      this.database = this.client.database(databaseName);
      this.adventuresContainer = this.database.container('adventures');
      this.usersContainer = this.database.container('users');
      this.templatesContainer = this.database.container('templates');

      console.log('✓ Cosmos DB client initialized with Managed Identity');
    } catch (error) {
      console.error('Failed to initialize Cosmos DB client:', error);
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.adventuresContainer || !this.usersContainer || !this.templatesContainer) {
      throw new Error('Cosmos DB client not initialized. Call initialize() first.');
    }
  }

  // ==================== ADVENTURE METHODS ====================   throw new Error('Cosmos DB client not initialized. Call initialize() first.');
  async createAdventure(adventure: Partial<Adventure> & { sessionId: string; userId?: string }): Promise<Adventure> {
    this.ensureInitialized();

    const newAdventure: Adventure = {
      ...adventure,
      id: adventure.id || crypto.randomUUID(),
      createdAt: adventure.createdAt || Date.now(),
      updatedAt: Date.now(),
    } as Adventure;

    const { resource } = await this.adventuresContainer!.items.create(newAdventure);
    console.log(`Created adventure: ${resource?.id} for user: ${adventure.userId || 'anonymous'}`);
    return resource as Adventure;
  }

  async getAdventure(id: string, sessionId: string, userId?: string): Promise<Adventure | null> {
    this.ensureInitialized();

    try {
      const { resource } = await this.adventuresContainer!.item(id, sessionId).read<Adventure>();
      
      // If userId is provided, verify ownership
      if (userId && resource?.userId && resource.userId !== userId) {
        console.log(`Access denied: User ${userId} tried to access adventure ${id} owned by ${resource.userId}`);
        return null;
      }
      
      return resource || null;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  async listAdventures(sessionId: string, userId?: string): Promise<Adventure[]> {
    this.ensureInitialized();

    let querySpec;
    
    if (userId) {
      // User-specific adventures only
      querySpec = {
        query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.updatedAt DESC',
        parameters: [{ name: '@userId', value: userId }],
      };
    } else {
      // Session-based (legacy support)
      querySpec = {
        query: 'SELECT * FROM c WHERE c.sessionId = @sessionId ORDER BY c.updatedAt DESC',
        parameters: [{ name: '@sessionId', value: sessionId }],
      };
    }

    const { resources } = await this.adventuresContainer!.items.query<Adventure>(querySpec).fetchAll();
    console.log(`Found ${resources.length} adventures for ${userId ? `user ${userId}` : `session ${sessionId}`}`);
    return resources;
  }

  async updateAdventure(id: string, sessionId: string, updates: Partial<Adventure>, userId?: string): Promise<Adventure> {
    this.ensureInitialized();

    const existing = await this.getAdventure(id, sessionId, userId);
    if (!existing) {
      throw new Error(`Adventure not found: ${id}`);
    }

    const updated: Adventure = {
      ...existing,
      ...updates,
      id,
      sessionId,
      userId: existing.userId, // Preserve original owner
      updatedAt: Date.now(),
    };

    const { resource } = await this.adventuresContainer!.item(id, sessionId).replace(updated);
    console.log(`Updated adventure: ${id}`);
    return resource as Adventure;
  }

  async deleteAdventure(id: string, sessionId: string, userId?: string): Promise<void> {
    this.ensureInitialized();

    // Verify ownership before deleting
    const adventure = await this.getAdventure(id, sessionId, userId);
    if (!adventure) {
      throw new Error(`Adventure not found or access denied: ${id}`);
    }

    await this.adventuresContainer!.item(id, sessionId).delete();
    console.log(`Deleted adventure: ${id}`);
  }

  // ==================== USER METHODS ====================

  async createUser(user: User): Promise<User> {
    this.ensureInitialized();
    const { resource } = await this.usersContainer!.items.create(user);
    return resource as User;
  }

  async getUser(id: string): Promise<User | null> {
    this.ensureInitialized();

    const querySpec = {
      query: 'SELECT * FROM c WHERE c.id = @id',
      parameters: [{ name: '@id', value: id }],
    };

    const { resources } = await this.usersContainer!.items.query<User>(querySpec).fetchAll();
    return resources[0] || null;
  }

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    this.ensureInitialized();

    const querySpec = {
      query: 'SELECT * FROM c WHERE c.googleId = @googleId',
      parameters: [{ name: '@googleId', value: googleId }],
    };

    const { resources } = await this.usersContainer!.items.query<User>(querySpec).fetchAll();
    return resources[0] || null;
  }

  async listUsers(): Promise<User[]> {
    this.ensureInitialized();

    const querySpec = {
      query: 'SELECT * FROM c ORDER BY c.createdAt DESC',
    };

    const { resources } = await this.usersContainer!.items.query<User>(querySpec).fetchAll();
    return resources;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    this.ensureInitialized();

    const existing = await this.getUser(id);
    if (!existing) {
      throw new Error(`User not found: ${id}`);
    }

    const updated: User = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
    };

    const { resource } = await this.usersContainer!.item(id, existing.googleId).replace(updated);
    return resource as User;
  }

  // ==================== TEMPLATE METHODS ====================

  async createTemplate(template: Template): Promise<Template> {
    this.ensureInitialized();
    const { resource } = await this.templatesContainer!.items.create(template);
    return resource as Template;
  }

  async listTemplates(): Promise<Template[]> {
    this.ensureInitialized();

    const querySpec = {
      query: 'SELECT * FROM c WHERE c.isCustom = true ORDER BY c.createdAt DESC',
    };

    const { resources } = await this.templatesContainer!.items.query<Template>(querySpec).fetchAll();
    return resources;
  }

  async deleteTemplate(id: string): Promise<void> {
    this.ensureInitialized();
    await this.templatesContainer!.item(id, id).delete();
  }
}

export const cosmosService = new CosmosService();
