// ============================================================================
// Cosmos DB Database and Container for Agent Metadata
// ============================================================================
// Purpose: Store agent thread metadata (thread-to-agent associations, titles, timestamps)
// Parent: Cosmos DB account deployed at infrastructure layer (cosmos-ailz-{suffix})

@description('Cosmos DB account name (from infrastructure layer)')
param cosmosAccountName string

@description('Database name for agent metadata')
param databaseName string = 'agents'

@description('Container name for thread metadata')
param containerName string = 'threads'

// ============================================================================
// EXISTING COSMOS ACCOUNT REFERENCE
// ============================================================================

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' existing = {
  name: cosmosAccountName
}

// ============================================================================
// DATABASE (SERVERLESS - NO THROUGHPUT NEEDED)
// ============================================================================

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
}

// ============================================================================
// CONTAINER (THREAD METADATA)
// ============================================================================

resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: containerName
  properties: {
    resource: {
      id: containerName
      partitionKey: {
        paths: [
          '/agentId'  // Partition by agent ID for efficient queries
        ]
        kind: 'Hash'
      }
      indexingPolicy: {
        automatic: true
        indexingMode: 'consistent'
        includedPaths: [
          {
            path: '/*'  // Index all properties by default
          }
        ]
        excludedPaths: [
          {
            path: '/"_etag"/?'  // Exclude system properties from indexing
          }
        ]
      }
      defaultTtl: -1  // No automatic expiration (threads persist until deleted)
    }
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output databaseName string = database.name
output containerName string = container.name
output cosmosAccountEndpoint string = cosmosAccount.properties.documentEndpoint

// Connection information for applications
output connectionInfo object = {
  accountName: cosmosAccount.name
  databaseName: database.name
  containerName: container.name
  endpoint: cosmosAccount.properties.documentEndpoint
  // Note: Applications should use Managed Identity for authentication
  // No connection strings or keys in outputs
}

output usageInstructions string = '''
Container Created for Agent Thread Metadata:
- Database: ${database.name}
- Container: ${container.name}
- Partition Key: /agentId (threads grouped by agent)

Schema:
{
  "id": "thread_abc123",           // Thread ID from Foundry
  "agentId": "asst_xyz789",        // Partition key - which agent
  "createdAt": "2025-11-11T...",   // ISO timestamp
  "lastMessageAt": "2025-11-11...", // Last activity
  "title": "Product inquiry",      // User-friendly title
  "userId": "user_123"             // Optional: for multi-tenancy
}

Queries (from application code):
- List threads for agent:
  SELECT * FROM c WHERE c.agentId = 'asst_xyz' ORDER BY c.lastMessageAt DESC
  
- Get specific thread:
  SELECT * FROM c WHERE c.id = 'thread_abc' (point read)

Access:
1. Grant app Managed Identity: "Cosmos DB Built-in Data Contributor" role
2. Use Azure SDK with DefaultAzureCredential (no connection strings)
3. Example: @azure/cosmos npm package

Performance:
- Partition key queries: ~5-10ms latency
- Point reads (by id): ~1-2ms latency
- Cross-partition queries: Avoid (use agentId filter)
'''
