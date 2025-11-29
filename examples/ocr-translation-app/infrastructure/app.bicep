// ============================================================================
// OCR & Translation App Infrastructure
// ============================================================================
// Deploys frontend and backend Container Apps with managed identities
// and RBAC assignments to Azure AI services
//
// DEPLOYMENT SCOPE: Resource Group (app-specific RG, not LZ RG)
// Best Practice: Each app gets its own RG for lifecycle management
// ============================================================================

targetScope = 'resourceGroup'

@description('Container Apps Environment resource ID (from LZ RG)')
param containerAppsEnvironmentId string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Unique suffix for resource names')
param uniqueSuffix string

@description('Azure Container Registry login server')
param acrLoginServer string

@description('Azure Container Registry username')
param acrUsername string

@description('Azure Container Registry password')
@secure()
param acrPassword string

@description('AI Foundry endpoint URL')
param aiFoundryEndpoint string = ''

@description('Document Intelligence endpoint URL')
param documentIntelligenceEndpoint string = ''

@description('Document Translator endpoint URL')
param documentTranslatorEndpoint string = ''

@description('AI Foundry resource ID for RBAC')
param aiFoundryResourceId string = ''

@description('AI Foundry API key - ONLY for AI Foundry (managed identity not yet supported by SDK)')
@secure()
param aiFoundryKey string = ''

@description('Document Intelligence endpoint URL')
param documentIntelligenceResourceId string = ''

@description('Document Translator resource ID for RBAC')
param documentTranslatorResourceId string = ''

@description('Storage account name for blob uploads')
param storageAccountName string = ''

@description('Storage account resource ID for RBAC')
param storageAccountResourceId string = ''

@description('Azure OpenAI endpoint URL (optional - uses AI Foundry if not provided)')
param azureOpenAIEndpoint string = ''

@description('Azure OpenAI deployment name (optional)')
param azureOpenAIDeployment string = 'gpt-4o'

@description('Azure OpenAI resource ID for RBAC (optional)')
param azureOpenAIResourceId string = ''

@description('Frontend container image')
param frontendImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Backend container image')
param backendImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// ============================================================================
// VARIABLES
// ============================================================================

var appNamePrefix = 'ocr-trans'
var backendAppName = 'aca-${appNamePrefix}-backend-${uniqueSuffix}'
var frontendAppName = 'aca-${appNamePrefix}-frontend-${uniqueSuffix}'

// Cognitive Services User role for AI services access
var cognitiveServicesUserRoleId = 'a97b65f3-24c7-4388-baec-2e87135dc908'

// Storage Blob Data Contributor role for blob uploads
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

// Parse storage account resource ID for cross-RG reference
var storageSubscriptionId = !empty(storageAccountResourceId) ? split(storageAccountResourceId, '/')[2] : subscription().subscriptionId
var storageResourceGroupName = !empty(storageAccountResourceId) ? split(storageAccountResourceId, '/')[4] : resourceGroup().name

// ============================================================================
// STORAGE CONTAINERS
// ============================================================================

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = if (!empty(storageAccountResourceId)) {
  name: storageAccountName
  scope: resourceGroup(storageSubscriptionId, storageResourceGroupName)
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' existing = if (!empty(storageAccountResourceId)) {
  parent: storageAccount
  name: 'default'
}

// Container for document uploads
resource uploadsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = if (!empty(storageAccountResourceId)) {
  parent: blobService
  name: 'uploads'
  properties: {
    publicAccess: 'None'
  }
}

// Container for processed documents
resource processedContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = if (!empty(storageAccountResourceId)) {
  parent: blobService
  name: 'processed'
  properties: {
    publicAccess: 'None'
  }
}

// Container for workspace metadata
resource workspaceContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = if (!empty(storageAccountResourceId)) {
  parent: blobService
  name: 'workspace'
  properties: {
    publicAccess: 'None'
  }
}

// Container for translation source files
resource translationSourceContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = if (!empty(storageAccountResourceId)) {
  parent: blobService
  name: 'translation-source'
  properties: {
    publicAccess: 'None'
  }
}

// Container for translation target files
resource translationTargetContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = if (!empty(storageAccountResourceId)) {
  parent: blobService
  name: 'translation-target'
  properties: {
    publicAccess: 'None'
  }
}

// ============================================================================
// BACKEND CONTAINER APP
// ============================================================================

resource backendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: backendAppName
  location: location
  tags: {
    Application: 'ocr-translation'
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
          server: acrLoginServer
          username: acrUsername
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
        {
          name: 'session-secret'
          value: uniqueString(resourceGroup().id, backendAppName, uniqueSuffix)
        }
      ]
      ingress: {
        external: true  // VNet-accessible (not public in internal environment)
        targetPort: 3000
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
              name: 'TRANSLATOR_ENDPOINT'
              value: documentTranslatorEndpoint
            }
            {
              name: 'STORAGE_ACCOUNT_NAME'
              value: storageAccountName
            }
            {
              name: 'AZURE_OPENAI_ENDPOINT'
              value: azureOpenAIEndpoint
            }
            {
              name: 'AZURE_OPENAI_DEPLOYMENT'
              value: azureOpenAIDeployment
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
  dependsOn: [
    uploadsContainer
    processedContainer
    workspaceContainer
    translationSourceContainer
    translationTargetContainer
  ]
}

// ============================================================================
// FRONTEND CONTAINER APP
// ============================================================================

resource frontendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: frontendAppName
  location: location
  tags: {
    Application: 'ocr-translation'
    Component: 'frontend'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      registries: [
        {
          server: acrLoginServer
          username: acrUsername
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
            cpu: json('0.25')
            memory: '0.5Gi'
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
// RBAC ASSIGNMENTS (Backend managed identity to AI services)
// ============================================================================

// Parse resource IDs for cross-RG references
var aiFoundrySubscriptionId = !empty(aiFoundryResourceId) ? split(aiFoundryResourceId, '/')[2] : subscription().subscriptionId
var aiFoundryRgName = !empty(aiFoundryResourceId) ? split(aiFoundryResourceId, '/')[4] : resourceGroup().name

var docIntelSubscriptionId = !empty(documentIntelligenceResourceId) ? split(documentIntelligenceResourceId, '/')[2] : subscription().subscriptionId
var docIntelRgName = !empty(documentIntelligenceResourceId) ? split(documentIntelligenceResourceId, '/')[4] : resourceGroup().name

var translatorSubscriptionId = !empty(documentTranslatorResourceId) ? split(documentTranslatorResourceId, '/')[2] : subscription().subscriptionId
var translatorRgName = !empty(documentTranslatorResourceId) ? split(documentTranslatorResourceId, '/')[4] : resourceGroup().name

var openAiSubscriptionId = !empty(azureOpenAIResourceId) ? split(azureOpenAIResourceId, '/')[2] : subscription().subscriptionId
var openAiRgName = !empty(azureOpenAIResourceId) ? split(azureOpenAIResourceId, '/')[4] : resourceGroup().name

// Reference to AI services for proper scoping (cross-RG)
resource aiFoundryService 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = if (!empty(aiFoundryResourceId)) {
  name: last(split(aiFoundryResourceId, '/'))
  scope: resourceGroup(aiFoundrySubscriptionId, aiFoundryRgName)
}

resource documentIntelligenceService 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = if (!empty(documentIntelligenceResourceId)) {
  name: last(split(documentIntelligenceResourceId, '/'))
  scope: resourceGroup(docIntelSubscriptionId, docIntelRgName)
}

resource translatorService 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = if (!empty(documentTranslatorResourceId)) {
  name: last(split(documentTranslatorResourceId, '/'))
  scope: resourceGroup(translatorSubscriptionId, translatorRgName)
}

resource storageAccountService 'Microsoft.Storage/storageAccounts@2023-01-01' existing = if (!empty(storageAccountResourceId)) {
  name: storageAccountName
  scope: resourceGroup(storageSubscriptionId, storageResourceGroupName)
}

resource azureOpenAIService 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = if (!empty(azureOpenAIResourceId)) {
  name: last(split(azureOpenAIResourceId, '/'))
  scope: resourceGroup(openAiSubscriptionId, openAiRgName)
}

// RBAC to AI Foundry
resource backendToAiFoundryRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(aiFoundryResourceId)) {
  name: guid(backendApp.id, aiFoundryResourceId, cognitiveServicesUserRoleId)
  scope: aiFoundryService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC to Document Intelligence
resource backendToDocIntelligenceRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(documentIntelligenceResourceId)) {
  name: guid(backendApp.id, documentIntelligenceResourceId, cognitiveServicesUserRoleId)
  scope: documentIntelligenceService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC to Document Translator
resource backendToTranslatorRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(documentTranslatorResourceId)) {
  name: guid(backendApp.id, documentTranslatorResourceId, cognitiveServicesUserRoleId)
  scope: translatorService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC to Storage Account (for blob uploads)
resource backendToStorageRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(storageAccountResourceId)) {
  name: guid(backendApp.id, storageAccountResourceId, storageBlobDataContributorRoleId)
  scope: storageAccountService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC to Azure OpenAI
resource backendToAzureOpenAIRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(azureOpenAIResourceId)) {
  name: guid(backendApp.id, azureOpenAIResourceId, cognitiveServicesUserRoleId)
  scope: azureOpenAIService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC: Translator needs Storage access for Document Translation (managed identity - no SAS)
resource translatorToStorageRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(documentTranslatorResourceId) && !empty(storageAccountResourceId)) {
  name: guid(documentTranslatorResourceId, storageAccountResourceId, storageBlobDataContributorRoleId)
  scope: storageAccountService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: translatorService.identity.principalId
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

output storageContainersCreated array = [
  'uploads'
  'processed'
  'workspace'
  'translation-source'
  'translation-target'
]

output deploymentInstructions string = '''
=== OCR & Translation App Deployed ===

Frontend URL: https://${frontendApp.properties.configuration.ingress.fqdn}
Backend API URL: https://${backendApp.properties.configuration.ingress.fqdn}

⚠️  These apps are INTERNAL - accessible only via VPN connection.

Security Configuration:
✅ Managed Identity: Document Intelligence, Translator, Storage (using RBAC)
✅ Auto-generated Session Secret: Secure session management
✅ Storage Containers: All required containers created automatically
⚠️  AI Foundry Key: Required (SDK doesn't support managed identity yet - Azure limitation)

To access:
1. Connect to the Azure Point-to-Site VPN
2. Open the frontend URL in your browser
3. The frontend will communicate with the backend API

To update container images:
az containerapp update -n ${backendApp.name} -g ${resourceGroup().name} --image <your-backend-image>
az containerapp update -n ${frontendApp.name} -g ${resourceGroup().name} --image <your-frontend-image>
'''
