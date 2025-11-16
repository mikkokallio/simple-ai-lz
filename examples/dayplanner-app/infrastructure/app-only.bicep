// ============================================================================
// Funday Day Planner - App-Only Deployment
// ============================================================================
// Uses existing infrastructure (Cosmos, Storage, Container Apps Environment)
// Only deploys the Container Apps for frontend and backend
// ============================================================================

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Container Apps Environment resource ID')
param containerAppsEnvironmentId string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Azure Container Registry name')
param acrName string

@description('Azure Container Registry login server')
param acrLoginServer string

@description('Azure Container Registry password')
@secure()
param acrPassword string

@description('Frontend container image')
param frontendImage string

@description('Backend container image')
param backendImage string

@description('Azure OpenAI endpoint')
param openAiEndpoint string

@description('Azure OpenAI deployment name')
param openAiDeployment string

@description('Azure OpenAI resource ID for RBAC assignment')
param openAiResourceId string

@description('Existing Cosmos DB account name')
param cosmosAccountName string = 'cosmos-ailz-ezle7syi'

@description('Existing Storage account name')
param storageAccountName string = 'stailzezle7syi'

@description('Cosmos DB database name for this app')
param cosmosDatabaseName string = 'dayplanner-db'

@description('Cosmos DB container name')
param cosmosContainerName string = 'itineraries'

@description('Storage container name for this app')
param storageContainerName string = 'dayplanner-data'

// ============================================================================
// Reference existing Cosmos DB Account
// ============================================================================

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' existing = {
  name: cosmosAccountName
}

// Create database in existing Cosmos account (serverless - no throughput settings)
resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-11-15' = {
  parent: cosmosAccount
  name: cosmosDatabaseName
  properties: {
    resource: {
      id: cosmosDatabaseName
    }
  }
}

// Create container in the database
resource cosmosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: cosmosDatabase
  name: cosmosContainerName
  properties: {
    resource: {
      id: cosmosContainerName
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          { path: '/*' }
        ]
      }
    }
  }
}

// ============================================================================
// Reference existing Storage Account
// ============================================================================

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

// Create blob container in existing storage account
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' existing = {
  parent: storageAccount
  name: 'default'
}

resource storageContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: storageContainerName
  properties: {
    publicAccess: 'None'
  }
}

// ============================================================================
// Backend Container App
// ============================================================================

resource backendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'ca-dayplanner-backend'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        corsPolicy: {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
        }
      }
      registries: [
        {
          server: acrLoginServer
          username: acrName
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acrPassword
        }
        {
          name: 'appinsights-connection-string'
          value: appInsightsConnectionString
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: backendImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'COSMOS_ENDPOINT'
              value: cosmosAccount.properties.documentEndpoint
            }
            {
              name: 'COSMOS_DATABASE'
              value: cosmosDatabaseName
            }
            {
              name: 'COSMOS_CONTAINER'
              value: cosmosContainerName
            }
            {
              name: 'STORAGE_ACCOUNT_NAME'
              value: storageAccountName
            }
            {
              name: 'STORAGE_CONTAINER_NAME'
              value: storageContainerName
            }
            {
              name: 'AZURE_OPENAI_ENDPOINT'
              value: openAiEndpoint
            }
            {
              name: 'AZURE_OPENAI_DEPLOYMENT'
              value: openAiDeployment
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              secretRef: 'appinsights-connection-string'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '10'
              }
            }
          }
        ]
      }
    }
  }
}

// ============================================================================
// Frontend Container App
// ============================================================================

resource frontendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'ca-dayplanner-frontend'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
        transport: 'http'
      }
      registries: [
        {
          server: acrLoginServer
          username: acrName
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acrPassword
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: frontendImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'VITE_API_BASE_URL'
              value: 'https://${backendApp.properties.configuration.ingress.fqdn}'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// ============================================================================
// RBAC Role Assignments
// ============================================================================

// Cosmos DB Data Contributor role for backend
resource cosmosRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosAccount.id, backendApp.id, 'cosmosDataContributor')
  parent: cosmosAccount
  properties: {
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: backendApp.identity.principalId
    scope: cosmosAccount.id
  }
}

// Storage Blob Data Contributor role for backend
resource storageRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, backendApp.id, 'storageBlobDataContributor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: backendApp.identity.principalId
  }
}

// Reference to existing Azure OpenAI resource for RBAC
resource openAiResource 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = {
  name: last(split(openAiResourceId, '/'))
  scope: resourceGroup(split(openAiResourceId, '/')[2], split(openAiResourceId, '/')[4])
}

// Cognitive Services OpenAI User role for backend
resource openAiRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(openAiResource.id, backendApp.id, 'cognitiveServicesOpenAIUser')
  scope: openAiResource
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
    principalId: backendApp.identity.principalId
  }
}

// ============================================================================
// Outputs
// ============================================================================

output backendUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'
output frontendUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}'
output backendPrincipalId string = backendApp.identity.principalId
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output cosmosDatabaseName string = cosmosDatabaseName
output cosmosContainerName string = cosmosContainerName
output storageAccountName string = storageAccountName
output storageContainerName string = storageContainerName
