// ============================================================================
// Funday Day Planner - Main Infrastructure
// ============================================================================
// Deploys Cosmos DB, Container Apps (frontend/backend), and RBAC assignments
// ============================================================================

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Unique suffix for resource names')
param uniqueSuffix string = uniqueString(resourceGroup().id)

@description('Container Apps Environment resource ID')
param containerAppsEnvironmentId string

@description('Application Insights connection string')
param appInsightsConnectionString string

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
param openAiDeployment string = 'gpt-4o'

@description('Storage account name for blob storage')
param storageAccountName string

@description('Shared Cosmos DB account name from landing zone')
param cosmosDbAccountName string

// ============================================================================
// Reference Existing Shared Cosmos DB Account
// ============================================================================

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' existing = {
  name: cosmosDbAccountName
}

// ============================================================================
// App-Specific Cosmos DB Database
// ============================================================================

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-11-15' = {
  parent: cosmosAccount
  name: 'dayplanner-db'
  properties: {
    resource: {
      id: 'dayplanner-db'
    }
  }
}

resource itinerariesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: cosmosDatabase
  name: 'itineraries'
  properties: {
    resource: {
      id: 'itineraries'
      partitionKey: {
        paths: ['/userId']
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
      }
    }
  }
}

// ============================================================================
// Reference Existing Shared Storage Account
// ============================================================================

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' existing = {
  parent: storageAccount
  name: 'default'
}

// App-specific blob container
resource dayplannerContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'dayplanner-data'
  properties: {
    publicAccess: 'None'
  }
}

// ============================================================================
// Backend Container App
// ============================================================================

resource backendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-dayplanner-backend-${uniqueSuffix}'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: containerAppsEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        corsPolicy: {
          allowedOrigins: [
            'https://ca-dayplanner-frontend-${uniqueSuffix}.${environment().suffixes.acrLoginServer}'
            'http://localhost:5173'
          ]
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
          allowCredentials: true
        }
      }
      registries: [
        {
          server: acrLoginServer
          username: acrLoginServer
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
              name: 'AZURE_OPENAI_ENDPOINT'
              value: openAiEndpoint
            }
            {
              name: 'AZURE_OPENAI_DEPLOYMENT'
              value: openAiDeployment
            }
            {
              name: 'COSMOS_ENDPOINT'
              value: cosmosAccount.properties.documentEndpoint
            }
            {
              name: 'COSMOS_DATABASE'
              value: 'dayplanner-db'
            }
            {
              name: 'COSMOS_CONTAINER'
              value: 'itineraries'
            }
            {
              name: 'STORAGE_ACCOUNT_NAME'
              value: storageAccountName
            }
            {
              name: 'STORAGE_CONTAINER'
              value: 'dayplanner-data'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsightsConnectionString
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
// Frontend Container App
// ============================================================================

resource frontendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-dayplanner-frontend-${uniqueSuffix}'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: containerAppsEnvironmentId
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
          username: acrLoginServer
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
// RBAC Assignments - Backend Managed Identity
// ============================================================================

// Cosmos DB Data Contributor
resource cosmosRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosAccount.id, backendApp.id, 'cosmos-contributor')
  parent: cosmosAccount
  properties: {
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002' // Cosmos DB Built-in Data Contributor
    principalId: backendApp.identity.principalId
    scope: cosmosAccount.id
  }
}

// Storage Blob Data Contributor
resource storageBlobRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, backendApp.id, 'blob-contributor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe') // Storage Blob Data Contributor
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Cognitive Services OpenAI User (assumes OpenAI resource exists)
// Note: This would be defined at the OpenAI resource scope
// User needs to manually assign or use separate Bicep module

// ============================================================================
// Outputs
// ============================================================================

output cosmosAccountName string = cosmosAccount.name
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output backendUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'
output frontendUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}'
output backendPrincipalId string = backendApp.identity.principalId
output storageAccountName string = storageAccount.name
