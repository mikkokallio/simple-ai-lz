// Container Apps Job for Finlex document ingestion
param jobName string
param location string = resourceGroup().location
param containerAppsEnvironmentId string
param containerRegistryName string
param imageName string = 'finlex-ingestion'
param imageTag string = 'latest'
param tags object = {}

@description('Target years to ingest (comma-separated)')
param targetYears string = '2024,2025'

@description('Finlex data URL')
param finlexUrl string

@description('Azure OpenAI endpoint')
param azureOpenAiEndpoint string

@description('Azure OpenAI deployment name for embeddings')
param azureOpenAiDeployment string = 'text-embedding-3-small'

@description('Vector dimensions for embeddings (1536 for compatibility, 768 or 512 for smaller)')
param embeddingDimensions string = '1536'

@description('Azure AI Search endpoint')
param azureSearchEndpoint string

@description('Azure AI Search admin key (for index creation)')
@secure()
param azureSearchKey string

@description('CRON schedule for the job (default: daily at 1 AM UTC)')
param schedule string = '0 1 * * *'

// Get container registry
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: containerRegistryName
}

// Container Apps Job
resource finlexJob 'Microsoft.App/jobs@2023-05-01' = {
  name: jobName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: containerAppsEnvironmentId
    configuration: {
      scheduleTriggerConfig: {
        cronExpression: schedule
        parallelism: 1
        replicaCompletionCount: 1
      }
      replicaTimeout: 7200 // 2 hours
      replicaRetryLimit: 1
      triggerType: 'Schedule'
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: 'system'
        }
      ]
      secrets: [
        {
          name: 'search-key'
          value: azureSearchKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'finlex-ingestion'
          image: '${containerRegistry.properties.loginServer}/${imageName}:${imageTag}'
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            {
              name: 'TARGET_YEARS'
              value: targetYears
            }
            {
              name: 'FINLEX_URL'
              value: finlexUrl
            }
            {
              name: 'AZURE_OPENAI_ENDPOINT'
              value: azureOpenAiEndpoint
            }
            {
              name: 'AZURE_OPENAI_DEPLOYMENT'
              value: azureOpenAiDeployment
            }
            {
              name: 'AZURE_OPENAI_DIMENSIONS'
              value: embeddingDimensions
            }
            {
              name: 'AZURE_SEARCH_ENDPOINT'
              value: azureSearchEndpoint
            }
            {
              name: 'AZURE_SEARCH_KEY'
              secretRef: 'search-key'
            }
          ]
        }
      ]
    }
  }
}

output jobName string = finlexJob.name
output jobId string = finlexJob.id
output jobPrincipalId string = finlexJob.identity.principalId
