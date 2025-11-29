// Container Apps deployment for Adventure Creator (frontend + backend)
// Uses existing Container Apps Environment, ACR, and Azure services

@description('Location for resources')
param location string = resourceGroup().location

@description('Unique suffix for resource names')
param uniqueSuffix string

@description('Resource ID of existing Container Apps Environment')
param containerAppsEnvironmentId string

@description('Name of existing Container Registry')
param containerRegistryName string

@description('Name of existing Cosmos DB account')
param cosmosAccountName string

@description('Cosmos DB database name')
param cosmosDatabaseName string = 'adventureCreator'

@description('Cosmos DB container name')
param cosmosContainerName string = 'adventures'

@description('Azure OpenAI endpoint')
param azureOpenAIEndpoint string

@description('Azure OpenAI GPT-4 deployment name')
param azureOpenAIDeploymentGPT4 string = 'gpt-4o'

@description('Azure OpenAI DALL-E deployment name')
param azureOpenAIDeploymentDALLE string = 'dall-e-3'

@description('Azure OpenAI API version')
param azureOpenAIAPIVersion string = '2024-07-01'

@description('Backend container image tag')
param backendImageTag string = 'latest'

@description('Frontend container image tag')
param frontendImageTag string = 'latest'

// Reference existing resources
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' existing = {
  name: cosmosAccountName
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: containerRegistryName
}

// Cosmos DB database
resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: cosmosDatabaseName
  properties: {
    resource: {
      id: cosmosDatabaseName
    }
  }
}

// Cosmos DB containers
resource adventuresContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: cosmosContainerName
  properties: {
    resource: {
      id: cosmosContainerName
      partitionKey: {
        paths: [
          '/sessionId'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource usersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'users'
  properties: {
    resource: {
      id: 'users'
      partitionKey: {
        paths: [
          '/googleId'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource templatesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'templates'
  properties: {
    resource: {
      id: 'templates'
      partitionKey: {
        paths: [
          '/createdBy'
        ]
        kind: 'Hash'
      }
    }
  }
}

// Backend Container App
resource backendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-adventure-backend-${uniqueSuffix}'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: containerAppsEnvironmentId
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: '${containerRegistry.properties.loginServer}/adventure-creator-backend:${backendImageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'PORT'
              value: '8080'
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
              name: 'COSMOS_DATABASE_NAME'
              value: cosmosDatabaseName
            }
            {
              name: 'COSMOS_CONTAINER_NAME'
              value: cosmosContainerName
            }
            {
              name: 'AZURE_OPENAI_ENDPOINT'
              value: azureOpenAIEndpoint
            }
            {
              name: 'AZURE_OPENAI_API_VERSION'
              value: azureOpenAIAPIVersion
            }
            {
              name: 'AZURE_OPENAI_DEPLOYMENT_GPT4'
              value: azureOpenAIDeploymentGPT4
            }
            {
              name: 'AZURE_OPENAI_DEPLOYMENT_DALLE'
              value: azureOpenAIDeploymentDALLE
            }
            {
              name: 'FRONTEND_URL'
              value: 'https://${frontendApp.properties.configuration.ingress.fqdn}'
            }
          ]
          probes: [
            {
              type: 'liveness'
              httpGet: {
                path: '/health'
                port: 8080
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'readiness'
              httpGet: {
                path: '/health'
                port: 8080
              }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 5
      }
    }
  }
}

// Frontend Container App
resource frontendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-adventure-frontend-${uniqueSuffix}'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: containerAppsEnvironmentId
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: '${containerRegistry.properties.loginServer}/adventure-creator-frontend:${frontendImageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'BACKEND_URL'
              value: 'https://${backendApp.properties.configuration.ingress.fqdn}'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 5
      }
    }
  }
}

// Role assignment: Backend → Cosmos DB Data Contributor
resource cosmosRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmosAccount
  name: guid(backendApp.id, cosmosAccount.id, 'CosmosDBDataContributor')
  properties: {
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002' // Built-in Data Contributor
    principalId: backendApp.identity.principalId
    scope: cosmosAccount.id
  }
}

// Role assignment: Backend → ACR Pull
resource backendAcrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(backendApp.id, containerRegistry.id, 'AcrPull')
  scope: containerRegistry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Role assignment: Frontend → ACR Pull
resource frontendAcrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(frontendApp.id, containerRegistry.id, 'AcrPull')
  scope: containerRegistry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalId: frontendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Role assignment: Backend → Cognitive Services OpenAI User
// Note: This requires the Cognitive Services resource ID
// Will be added after getting the correct resource reference

output backendUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'
output frontendUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}'
output backendPrincipalId string = backendApp.identity.principalId
output frontendPrincipalId string = frontendApp.identity.principalId
