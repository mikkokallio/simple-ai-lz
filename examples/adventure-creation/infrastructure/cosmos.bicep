// Cosmos DB database and container setup for Adventure Creator
// Creates database and container in existing Cosmos account

@description('Name of the existing Cosmos DB account')
param cosmosAccountName string

@description('Name of the database to create')
param databaseName string = 'adventureCreator'

@description('Name of the container to create')
param containerName string = 'adventures'

@description('Location for resources')
param location string = resourceGroup().location

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
    options: {
      // Use serverless for low-cost demo
    }
  }
}

// Create container for adventures
resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: containerName
  properties: {
    resource: {
      id: containerName
      partitionKey: {
        paths: [
          '/sessionId'
        ]
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
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
    }
  }
}

output databaseName string = database.name
output containerName string = container.name
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
