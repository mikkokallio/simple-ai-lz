// Container Apps Job for multi-stage ingestion pipeline
param environmentName string
param location string = resourceGroup().location
param containerRegistryName string
param stageName string
param stageScript string
param targetYears string = '2024,2025'
param skipExisting string = 'true'

// Azure resources
param storageAccountName string
param searchEndpoint string
param searchIndexName string
param openAiEndpoint string
param openAiDeployment string = 'text-embedding-3-small'
param embeddingDimensions int = 1536

var jobName = 'finlex-${stageName}-job'
var imageName = 'finlex-${stageName}:latest'

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: containerRegistryName
}

resource environment 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource job 'Microsoft.App/jobs@2023-05-01' = {
  name: jobName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: environment.id
    configuration: {
      replicaTimeout: 7200  // 2 hours
      replicaRetryLimit: 1
      triggerType: 'Manual'
      registries: [
        {
          server: containerRegistry.properties.loginServer
          username: containerRegistry.listCredentials().username
          passwordSecretRef: 'registry-password'
        }
      ]
      secrets: [
        {
          name: 'registry-password'
          value: containerRegistry.listCredentials().passwords[0].value
        }
      ]
    }
    template: {
      containers: [
        {
          name: jobName
          image: '${containerRegistry.properties.loginServer}/${imageName}'
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
              name: 'SKIP_EXISTING'
              value: skipExisting
            }
            {
              name: 'STORAGE_ACCOUNT_NAME'
              value: storageAccountName
            }
            {
              name: 'AZURE_SEARCH_ENDPOINT'
              value: searchEndpoint
            }
            {
              name: 'AZURE_SEARCH_INDEX'
              value: searchIndexName
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
              name: 'AZURE_OPENAI_DIMENSIONS'
              value: string(embeddingDimensions)
            }
          ]
          command: [
            'python'
            '-u'
            stageScript
          ]
        }
      ]
    }
  }
}

output jobName string = job.name
output jobId string = job.id
output principalId string = job.identity.principalId
