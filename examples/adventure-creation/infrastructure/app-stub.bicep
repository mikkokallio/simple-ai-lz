// Part 1: Deploy Container Apps with dummy images to create Managed Identities
// This allows role assignments to be created and propagate before deploying real apps

@description('Location for all resources')
param location string = 'swedencentral'

@description('Unique suffix for resource naming')
param uniqueSuffix string = 'demo11'

@description('Container Apps Environment resource ID')
param containerAppsEnvironmentId string

@description('Container Registry name')
param containerRegistryName string

@description('Cosmos DB account name')
param cosmosAccountName string

// Reference existing resources
resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: split(containerAppsEnvironmentId, '/')[8]
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: containerRegistryName
}

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' existing = {
  name: cosmosAccountName
}

// Backend Container App (with dummy image)
resource backendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-adventure-backend-${uniqueSuffix}'
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
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'backend-stub'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

// Frontend Container App (with dummy image)
resource frontendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-adventure-frontend-${uniqueSuffix}'
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
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'frontend-stub'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

// Role Assignment: Backend -> ACR Pull
resource backendAcrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: containerRegistry
  name: guid(backendApp.id, containerRegistry.id, 'AcrPull')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Role Assignment: Frontend -> ACR Pull
resource frontendAcrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: containerRegistry
  name: guid(frontendApp.id, containerRegistry.id, 'AcrPull')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalId: frontendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Role Assignment: Backend -> Cosmos DB Data Contributor
resource backendCosmosRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  name: guid(backendApp.id, cosmosAccount.id, 'CosmosDBDataContributor')
  parent: cosmosAccount
  properties: {
    roleDefinitionId: resourceId('Microsoft.DocumentDB/databaseAccounts/sqlRoleDefinitions', cosmosAccount.name, '00000000-0000-0000-0000-000000000002')
    principalId: backendApp.identity.principalId
    scope: cosmosAccount.id
  }
}

output backendPrincipalId string = backendApp.identity.principalId
output frontendPrincipalId string = frontendApp.identity.principalId
output backendAppName string = backendApp.name
output frontendAppName string = frontendApp.name
