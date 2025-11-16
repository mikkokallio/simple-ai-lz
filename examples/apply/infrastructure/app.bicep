// ============================================================================
// AppLy - Job Application Assistant Infrastructure
// ============================================================================
// Deploys Cosmos DB containers, blob storage containers, and Container Apps
// ============================================================================

@description('Container Apps Environment resource ID')
param containerAppsEnvironmentId string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Unique suffix for resource names')
param uniqueSuffix string

@description('Azure Container Registry password')
@secure()
param acrPassword string

@description('AI Foundry endpoint URL')
param aiFoundryEndpoint string

@description('AI Foundry API key')
@secure()
param aiFoundryKey string

@description('Document Intelligence endpoint URL')
param documentIntelligenceEndpoint string

@description('Storage account name')
param storageAccountName string

@description('Storage account resource ID for RBAC')
param storageAccountResourceId string

@description('Cosmos DB account name')
param cosmosDbAccountName string

@description('AI Foundry resource ID for RBAC')
param aiFoundryResourceId string = ''

@description('Document Intelligence resource ID for RBAC')
param documentIntelligenceResourceId string = ''

// ============================================================================
// Variables
// ============================================================================

var appName = 'apply'
var frontendName = 'aca-${appName}-frontend-${uniqueSuffix}'
var backendName = 'aca-${appName}-backend-${uniqueSuffix}'
var acrName = 'acr${uniqueSuffix}ailz'
var cosmosDbDatabaseName = 'apply-db'

// ============================================================================
// Existing Resources
// ============================================================================

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: last(split(containerAppsEnvironmentId, '/'))
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

resource cosmosDbAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' existing = {
  name: cosmosDbAccountName
}

// Note: RBAC assignments for AI services handled via managed identity authentication
// No need to reference the resources directly since we're using managed identity

// ============================================================================
// Cosmos DB Database and Containers
// ============================================================================

resource applyDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-11-15' = {
  name: cosmosDbDatabaseName
  parent: cosmosDbAccount
  properties: {
    resource: {
      id: cosmosDbDatabaseName
    }
    // No throughput for serverless accounts
  }
}

resource profilesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  name: 'profiles'
  parent: applyDatabase
  properties: {
    resource: {
      id: 'profiles'
      partitionKey: {
        paths: ['/userId']
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
      }
    }
  }
}

resource jobsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  name: 'jobs'
  parent: applyDatabase
  properties: {
    resource: {
      id: 'jobs'
      partitionKey: {
        paths: ['/userId']
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
      }
    }
  }
}

resource analysesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  name: 'analyses'
  parent: applyDatabase
  properties: {
    resource: {
      id: 'analyses'
      partitionKey: {
        paths: ['/userId']
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
      }
    }
  }
}

// ============================================================================
// Blob Storage Containers
// ============================================================================

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' existing = {
  name: 'default'
  parent: storageAccount
}

resource applyCvContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: 'apply-cv'
  parent: blobService
  properties: {
    publicAccess: 'None'
  }
}

resource applyJobsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: 'apply-jobs'
  parent: blobService
  properties: {
    publicAccess: 'None'
  }
}

resource applyReportsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: 'apply-reports'
  parent: blobService
  properties: {
    publicAccess: 'None'
  }
}

// ============================================================================
// Backend Container App
// ============================================================================

resource backendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: backendName
  location: location
  tags: {
    Application: 'apply'
    Component: 'backend'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      ingress: {
        external: true  // External ingress (accessible via VPN)
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: '${acrName}.azurecr.io'
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
          name: 'ai-foundry-key'
          value: aiFoundryKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: '${acrName}.azurecr.io/apply-backend:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsightsConnectionString
            }
            {
              name: 'AI_FOUNDRY_ENDPOINT'
              value: aiFoundryEndpoint
            }
            {
              name: 'AI_FOUNDRY_KEY'
              secretRef: 'ai-foundry-key'
            }
            {
              name: 'DOCUMENT_INTELLIGENCE_ENDPOINT'
              value: documentIntelligenceEndpoint
            }
            {
              name: 'STORAGE_ACCOUNT_NAME'
              value: storageAccountName
            }
            {
              name: 'COSMOS_DB_ENDPOINT'
              value: cosmosDbAccount.properties.documentEndpoint
            }
            {
              name: 'COSMOS_DB_DATABASE'
              value: cosmosDbDatabaseName
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-rule'
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
  name: frontendName
  location: location
  tags: {
    Application: 'apply'
    Component: 'frontend'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      ingress: {
        external: true  // External ingress (accessible via VPN)
        targetPort: 80
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: '${acrName}.azurecr.io'
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
          image: '${acrName}.azurecr.io/apply-frontend:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'VITE_API_URL'
              value: 'https://${backendApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'BACKEND_URL'
              value: 'https://${backendApp.properties.configuration.ingress.fqdn}'
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
        maxReplicas: 5
        rules: [
          {
            name: 'http-rule'
            http: {
              metadata: {
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
}

// ============================================================================
// RBAC Assignments
// ============================================================================

// Storage Blob Data Contributor for backend
resource backendStorageRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, backendApp.id, 'StorageBlobDataContributor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe') // Storage Blob Data Contributor
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Cosmos DB Data Contributor for backend
resource backendCosmosRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosDbAccount.id, backendApp.id, 'CosmosDBDataContributor')
  parent: cosmosDbAccount
  properties: {
    roleDefinitionId: resourceId('Microsoft.DocumentDB/databaseAccounts/sqlRoleDefinitions', cosmosDbAccount.name, '00000000-0000-0000-0000-000000000002') // Cosmos DB Built-in Data Contributor
    principalId: backendApp.identity.principalId
    scope: cosmosDbAccount.id
  }
}

// Cognitive Services User for AI Foundry (using resource ID directly)
resource backendAiFoundryRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(aiFoundryResourceId)) {
  name: guid(aiFoundryResourceId, backendApp.id, 'CognitiveServicesUser')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a97b65f3-24c7-4388-baec-2e87135dc908') // Cognitive Services User
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Cognitive Services User for Document Intelligence (using resource ID directly)
resource backendDocIntelRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(documentIntelligenceResourceId)) {
  name: guid(documentIntelligenceResourceId, backendApp.id, 'CognitiveServicesUser')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a97b65f3-24c7-4388-baec-2e87135dc908') // Cognitive Services User
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Outputs
// ============================================================================

output frontendUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}'
output backendUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'
output backendPrincipalId string = backendApp.identity.principalId
output databaseName string = cosmosDbDatabaseName
output containersCreated array = [
  'profiles'
  'jobs'
  'analyses'
]
output blobContainersCreated array = [
  'apply-cv'
  'apply-jobs'
  'apply-reports'
]
