// Healthcare Transcription App - Complete Infrastructure Deployment
// This Bicep template deploys all Azure resources and configurations

targetScope = 'resourceGroup'

@description('Environment suffix for resource naming (e.g., ezle7syi)')
param envSuffix string

@description('Location for all resources')
param location string = resourceGroup().location

@description('Azure OpenAI deployment name')
param openAiDeploymentName string = 'gpt-4o'

@description('Speech Service region-specific language')
param speechLanguage string = 'fi-FI'

// ============================================
// Existing Resources (reference only)
// ============================================

resource existingSpeechService 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = {
  name: 'speech-ailz-${envSuffix}'
}

resource existingOpenAI 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = {
  name: 'foundry-${envSuffix}'
}

resource existingCosmosDb 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' existing = {
  name: 'cosmos-ailz-${envSuffix}'
}

resource existingStorage 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: 'stailz${envSuffix}'
}

resource existingAcr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: 'acr${envSuffix}ailz'
}

resource existingAcaEnv 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: 'cae-ailz-${envSuffix}'
}

// ============================================
// Backend Container App
// ============================================

resource backendContainerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'aca-triage-backend'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: existingAcaEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 80
        transport: 'auto'
      }
      registries: [
        {
          server: existingAcr.properties.loginServer
          identity: 'system'
        }
      ]
      secrets: [
        {
          name: 'speech-key'
          value: existingSpeechService.listKeys().key1
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'aca-triage-backend'
          image: '${existingAcr.properties.loginServer}/healthcare-triage-backend:v4'
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            {
              name: 'AZURE_OPENAI_ENDPOINT'
              value: existingOpenAI.properties.endpoint
            }
            {
              name: 'AZURE_OPENAI_DEPLOYMENT'
              value: openAiDeploymentName
            }
            {
              name: 'AZURE_SPEECH_ENDPOINT'
              value: existingSpeechService.properties.endpoint
            }
            {
              name: 'AZURE_SPEECH_KEY'
              secretRef: 'speech-key'
            }
            {
              name: 'COSMOS_ENDPOINT'
              value: existingCosmosDb.properties.documentEndpoint
            }
            {
              name: 'STORAGE_ACCOUNT_NAME'
              value: existingStorage.name
            }
            {
              name: 'BLOB_CONTAINER_NAME'
              value: 'audio-uploads'
            }
            {
              name: 'AzureWebJobsStorage__accountName'
              value: existingStorage.name
            }
            {
              name: 'FUNCTIONS_WORKER_RUNTIME'
              value: 'node'
            }
            {
              name: 'AzureWebJobsScriptRoot'
              value: '/app'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 10
      }
    }
  }
}

// ============================================
// Frontend Container App
// ============================================

resource frontendContainerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'aca-triage-frontend'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: existingAcaEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: existingAcr.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'aca-triage-frontend'
          image: '${existingAcr.properties.loginServer}/healthcare-triage-frontend:v2'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'NEXT_PUBLIC_API_URL'
              value: 'https://${backendContainerApp.properties.configuration.ingress.fqdn}'
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

// ============================================
// RBAC Role Assignments
// ============================================

// Backend: Storage Blob Data Owner (for AzureWebJobsStorage)
resource backendStorageBlobOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(existingStorage.id, backendContainerApp.id, 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')
  scope: existingStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b') // Storage Blob Data Owner
    principalId: backendContainerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Backend: Storage Queue Data Contributor (for Azure Functions host)
resource backendStorageQueueContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(existingStorage.id, backendContainerApp.id, '974c5e8b-45b9-4653-ba55-5f855dd0fb88')
  scope: existingStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '974c5e8b-45b9-4653-ba55-5f855dd0fb88') // Storage Queue Data Contributor
    principalId: backendContainerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Backend: Storage Table Data Contributor (for diagnostic events)
resource backendStorageTableContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(existingStorage.id, backendContainerApp.id, '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')
  scope: existingStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3') // Storage Table Data Contributor
    principalId: backendContainerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Backend: Cosmos DB Data Contributor
resource backendCosmosContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-04-15' = {
  name: guid(existingCosmosDb.id, backendContainerApp.id, 'cosmos-contributor')
  parent: existingCosmosDb
  properties: {
    roleDefinitionId: '${existingCosmosDb.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002' // Cosmos DB Built-in Data Contributor
    principalId: backendContainerApp.identity.principalId
    scope: existingCosmosDb.id
  }
}

// Backend: Cognitive Services User (for Azure OpenAI)
resource backendOpenAIUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(existingOpenAI.id, backendContainerApp.id, 'a97b65f3-24c7-4388-baec-2e87135dc908')
  scope: existingOpenAI
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a97b65f3-24c7-4388-baec-2e87135dc908') // Cognitive Services User
    principalId: backendContainerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Backend: Cognitive Services Speech User
resource backendSpeechUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(existingSpeechService.id, backendContainerApp.id, 'f2dc8367-1007-4938-bd23-fe263f013447')
  scope: existingSpeechService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'f2dc8367-1007-4938-bd23-fe263f013447') // Cognitive Services Speech User
    principalId: backendContainerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Frontend: Cognitive Services Speech User (for token endpoint access)
resource frontendSpeechUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(existingSpeechService.id, frontendContainerApp.id, 'f2dc8367-1007-4938-bd23-fe263f013447')
  scope: existingSpeechService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'f2dc8367-1007-4938-bd23-fe263f013447') // Cognitive Services Speech User
    principalId: frontendContainerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Grant ACR Pull to both Container Apps
resource backendAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(existingAcr.id, backendContainerApp.id, '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  scope: existingAcr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalId: backendContainerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource frontendAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(existingAcr.id, frontendContainerApp.id, '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  scope: existingAcr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalId: frontendContainerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ============================================
// Outputs
// ============================================

output backendUrl string = 'https://${backendContainerApp.properties.configuration.ingress.fqdn}'
output frontendUrl string = 'https://${frontendContainerApp.properties.configuration.ingress.fqdn}'
output backendPrincipalId string = backendContainerApp.identity.principalId
output frontendPrincipalId string = frontendContainerApp.identity.principalId
