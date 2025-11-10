// ============================================================================
// AI Chat Application Infrastructure
// ============================================================================
// Deploys frontend and backend Container Apps with managed identities
// and RBAC assignments to Azure OpenAI and Storage
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

@description('Storage account name for chat data')
param storageAccountName string = ''

@description('Storage account resource ID for RBAC')
param storageAccountResourceId string = ''

@description('AI Foundry endpoint URL')
param aiFoundryEndpoint string = 'https://foundry-mikkolabs.cognitiveservices.azure.com/'

@description('AI Foundry deployment name (model)')
param aiFoundryDeployment string = 'gpt-5-mini'

@description('AI Foundry API key (passed as secure parameter)')
@secure()
param aiFoundryKey string

@description('Key Vault name (for reference, though ai-foundry-key is now a Container App secret)')
param keyVaultName string

@description('Frontend container image')
param frontendImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Backend container image')
param backendImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// ============================================================================
// VARIABLES
// ============================================================================

var appNamePrefix = 'ai-chat'
var backendAppName = 'aca-${appNamePrefix}-backend-${uniqueSuffix}'
var frontendAppName = 'aca-${appNamePrefix}-frontend-${uniqueSuffix}'

// Storage Blob Data Contributor role for blob storage
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

// ============================================================================
// BACKEND CONTAINER APP
// ============================================================================

resource backendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: backendAppName
  location: location
  tags: {
    Application: 'ai-chat'
    Component: 'backend'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      registries: [
        {
          server: 'acrezle7syiailz.azurecr.io'
          username: 'acrezle7syiailz'
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acrPassword
        }
        {
          name: 'session-secret'
          value: uniqueString(resourceGroup().id, backendAppName)
        }
        {
          name: 'ai-foundry-key'
          value: aiFoundryKey
        }
      ]
      ingress: {
        external: true  // VNet-accessible (not public in internal environment)
        targetPort: 5000
        transport: 'auto'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: backendImage
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '5000'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsightsConnectionString
            }
            {
              name: 'AZURE_STORAGE_ACCOUNT_NAME'
              value: storageAccountName
            }
            {
              name: 'AZURE_STORAGE_CONTAINER_NAME'
              value: 'chat-data'
            }
            {
              name: 'AI_FOUNDRY_ENDPOINT'
              value: aiFoundryEndpoint
            }
            {
              name: 'AI_FOUNDRY_DEPLOYMENT_NAME'
              value: aiFoundryDeployment
            }
            {
              name: 'AI_FOUNDRY_KEY'
              secretRef: 'ai-foundry-key'
            }
            {
              name: 'SESSION_SECRET'
              secretRef: 'session-secret'
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
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// ============================================================================
// FRONTEND CONTAINER APP
// ============================================================================

resource frontendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: frontendAppName
  location: location
  tags: {
    Application: 'ai-chat'
    Component: 'frontend'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      registries: [
        {
          server: 'acrezle7syiailz.azurecr.io'
          username: 'acrezle7syiailz'
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acrPassword
        }
      ]
      ingress: {
        external: true  // VNet-accessible (not public in internal environment)
        targetPort: 80
        transport: 'auto'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: frontendImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
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
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}

// ============================================================================
// RBAC ASSIGNMENTS (Backend managed identity to Azure services)
// ============================================================================

// Reference to Storage Account in same resource group
resource storageAccountService 'Microsoft.Storage/storageAccounts@2023-01-01' existing = if (!empty(storageAccountResourceId)) {
  name: last(split(storageAccountResourceId, '/'))
}

// RBAC to Storage Account for blob data access
resource backendToStorageRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(storageAccountResourceId)) {
  name: guid(backendApp.id, storageAccountResourceId, storageBlobDataContributorRoleId)
  scope: storageAccountService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output backendAppName string = backendApp.name
output backendAppUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'
output backendPrincipalId string = backendApp.identity.principalId

output frontendAppName string = frontendApp.name
output frontendAppUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}'

output deploymentInstructions string = '''
=== AI Chat Application Deployed ===

Frontend URL: https://${frontendApp.properties.configuration.ingress.fqdn}
Backend API URL: https://${backendApp.properties.configuration.ingress.fqdn}

⚠️  These apps are INTERNAL - accessible only via VPN connection.

To access:
1. Connect to the Azure Point-to-Site VPN
2. Open the frontend URL in your browser
3. Start chatting with the AI!

To update container images:
az containerapp update -n ${backendApp.name} -g ${resourceGroup().name} --image <your-backend-image>
az containerapp update -n ${frontendApp.name} -g ${resourceGroup().name} --image <your-frontend-image>
'''
