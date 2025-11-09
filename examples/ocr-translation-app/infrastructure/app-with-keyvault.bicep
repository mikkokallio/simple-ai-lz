// ============================================================================
// OCR & Translation App Infrastructure with Key Vault Integration
// ============================================================================
// Deploys frontend and backend Container Apps with managed identities,
// stores secrets in Key Vault, and references them securely
// ============================================================================

@description('Container Apps Environment resource ID')
param containerAppsEnvironmentId string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Unique suffix for resource names')
param uniqueSuffix string

@description('Key Vault resource ID where secrets will be stored')
param keyVaultResourceId string

@description('Key Vault name where secrets will be stored')
param keyVaultName string

@description('Azure Container Registry password')
@secure()
param acrPassword string

// ============================================================================
// AI SERVICE ENDPOINTS (Public values, not sensitive)
// ============================================================================

@description('AI Foundry endpoint URL')
param aiFoundryEndpoint string = ''

@description('Document Intelligence endpoint URL')
param documentIntelligenceEndpoint string = ''

@description('Document Translator endpoint URL')
param documentTranslatorEndpoint string = ''

@description('Storage account name for blob uploads')
param storageAccountName string = ''

// ============================================================================
// AI SERVICE KEYS (Secure parameters - will be stored in Key Vault)
// ============================================================================

@description('AI Foundry API key')
@secure()
param aiFoundryKey string = ''

@description('Document Translator API key')
@secure()
param translatorKey string = ''

@description('Azure OpenAI endpoint URL')
param azureOpenAIEndpoint string = ''

@description('Azure OpenAI API key')
@secure()
param azureOpenAIKey string = ''

@description('Azure OpenAI deployment name')
param azureOpenAIDeployment string = ''

// ============================================================================
// RBAC Resource IDs (for managed identity permissions)
// ============================================================================

@description('AI Foundry resource ID for RBAC')
param aiFoundryResourceId string = ''

@description('Document Intelligence resource ID for RBAC')
param documentIntelligenceResourceId string = ''

@description('Document Translator resource ID for RBAC')
param documentTranslatorResourceId string = ''

@description('Storage account resource ID for RBAC')
param storageAccountResourceId string = ''

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

// Built-in Azure RBAC role IDs
var cognitiveServicesUserRoleId = 'a97b65f3-24c7-4388-baec-2e87135dc908'
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

// Key Vault secret names
var secretNames = {
  acrPassword: 'acr-password'
  aiFoundryKey: 'ai-foundry-key'
  translatorKey: 'translator-key'
  azureOpenAIKey: 'azure-openai-key'
}

// ============================================================================
// KEY VAULT - Reference existing Key Vault
// ============================================================================

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
  scope: resourceGroup()
}

// ============================================================================
// KEY VAULT SECRETS - Store sensitive values
// ============================================================================

resource secretAcrPassword 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (acrPassword != '') {
  parent: keyVault
  name: secretNames.acrPassword
  properties: {
    value: acrPassword
    contentType: 'Azure Container Registry Password'
  }
}

resource secretAiFoundryKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (aiFoundryKey != '') {
  parent: keyVault
  name: secretNames.aiFoundryKey
  properties: {
    value: aiFoundryKey
    contentType: 'AI Foundry API Key'
  }
}

resource secretTranslatorKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (translatorKey != '') {
  parent: keyVault
  name: secretNames.translatorKey
  properties: {
    value: translatorKey
    contentType: 'Azure Translator API Key'
  }
}

resource secretAzureOpenAIKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (azureOpenAIKey != '') {
  parent: keyVault
  name: secretNames.azureOpenAIKey
  properties: {
    value: azureOpenAIKey
    contentType: 'Azure OpenAI API Key'
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
          server: 'acrezle7syiailz.azurecr.io'
          username: 'acrezle7syiailz'
          passwordSecretRef: secretNames.acrPassword
        }
      ]
      secrets: [
        {
          name: secretNames.acrPassword
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${secretNames.acrPassword}'
          identity: 'system'
        }
        {
          name: secretNames.aiFoundryKey
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${secretNames.aiFoundryKey}'
          identity: 'system'
        }
        {
          name: secretNames.translatorKey
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${secretNames.translatorKey}'
          identity: 'system'
        }
        {
          name: secretNames.azureOpenAIKey
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${secretNames.azureOpenAIKey}'
          identity: 'system'
        }
      ]
      ingress: {
        external: true
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
            // Public endpoints (not sensitive)
            {
              name: 'AI_FOUNDRY_ENDPOINT'
              value: aiFoundryEndpoint
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
            // Secrets from Key Vault
            {
              name: 'AI_FOUNDRY_KEY'
              secretRef: secretNames.aiFoundryKey
            }
            {
              name: 'TRANSLATOR_KEY'
              secretRef: secretNames.translatorKey
            }
            {
              name: 'AZURE_OPENAI_API_KEY'
              secretRef: secretNames.azureOpenAIKey
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
    secretAcrPassword
    secretAiFoundryKey
    secretTranslatorKey
    secretAzureOpenAIKey
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
          server: 'acrezle7syiailz.azurecr.io'
          username: 'acrezle7syiailz'
          passwordSecretRef: secretNames.acrPassword
        }
      ]
      secrets: [
        {
          name: secretNames.acrPassword
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${secretNames.acrPassword}'
          identity: 'system'
        }
      ]
      ingress: {
        external: true
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
              name: 'VITE_BACKEND_URL'
              value: 'https://${backendApp.properties.configuration.ingress.fqdn}'
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
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    secretAcrPassword
  ]
}

// ============================================================================
// RBAC ASSIGNMENTS - Grant Container Apps access to Key Vault
// ============================================================================

resource backendKeyVaultRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(backendApp.id, keyVaultResourceId, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource frontendKeyVaultRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(frontendApp.id, keyVaultResourceId, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: frontendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// RBAC ASSIGNMENTS - Grant backend access to AI services and Storage
// ============================================================================

resource aiFoundryRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (aiFoundryResourceId != '') {
  name: guid(backendApp.id, aiFoundryResourceId, cognitiveServicesUserRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource documentIntelligenceRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (documentIntelligenceResourceId != '') {
  name: guid(backendApp.id, documentIntelligenceResourceId, cognitiveServicesUserRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource translatorRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (documentTranslatorResourceId != '') {
  name: guid(backendApp.id, documentTranslatorResourceId, cognitiveServicesUserRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource storageRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (storageAccountResourceId != '') {
  name: guid(backendApp.id, storageAccountResourceId, storageBlobDataContributorRoleId)
  scope: resourceGroup()
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
output backendUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'
output backendIdentityPrincipalId string = backendApp.identity.principalId

output frontendAppName string = frontendApp.name
output frontendUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}'
output frontendIdentityPrincipalId string = frontendApp.identity.principalId

output keyVaultName string = keyVaultName
output secretsStored array = [
  secretNames.acrPassword
  secretNames.aiFoundryKey
  secretNames.translatorKey
  secretNames.azureOpenAIKey
]
