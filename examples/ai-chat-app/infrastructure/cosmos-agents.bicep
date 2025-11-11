// Cosmos DB database and container for agent metadata
// This deploys into an existing Cosmos DB account (created at infrastructure layer)

@description('Name of the Cosmos DB account (must already exist)')
param cosmosAccountName string

@description('Name of the database to create')
param databaseName string = 'agent-metadata'

@description('Name of the container for agent threads')
param containerName string = 'threads'

@description('Location for resources')
param location string = resourceGroup().location

@description('Tags to apply to resources')
param tags object = {}

// Reference existing Cosmos DB account
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' existing = {
  name: cosmosAccountName
}

// Create database
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
  tags: tags
}

// Create container for agent threads
resource threadsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: containerName
  properties: {
    resource: {
      id: containerName
      partitionKey: {
        paths: [
          '/agentId'  // Partition by agentId for efficient queries
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
            path: '/"_etag"/?'  // Exclude etag from indexing
          }
        ]
      }
      defaultTtl: -1  // No automatic expiration
    }
  }
}

// Container for imported agents metadata
resource agentsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'agents'
  properties: {
    resource: {
      id: 'agents'
      partitionKey: {
        paths: [
          '/id'  // Partition by agent ID
        ]
        kind: 'Hash'
      }
      indexingPolicy: {
        automatic: true
        indexingMode: 'consistent'
        includedPaths: [
          {
            path: '/*'
          }
        ]
        excludedPaths: [
          {
            path: '/"_etag"/?'
          }
        ]
      }
      defaultTtl: -1
    }
  }
}

// Outputs
output databaseName string = database.name
output threadsContainerName string = threadsContainer.name
output agentsContainerName string = agentsContainer.name
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
