// ============================================================================
// OCR & Translation App Infrastructure
// ============================================================================
// Deploys frontend and backend Container Apps with managed identities
// and RBAC assignments to Azure AI services
// ============================================================================

@description('Container Apps Environment resource ID')
param containerAppsEnvironmentId string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Unique suffix for resource names')
param uniqueSuffix string

@description('Azure Container Registry password (use listCredentials or managed identity in production)')
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

@description('Document Intelligence resource ID for RBAC')
param documentIntelligenceResourceId string = ''

@description('Document Translator resource ID for RBAC')
param documentTranslatorResourceId string = ''

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
              name: 'DOCUMENT_INTELLIGENCE_ENDPOINT'
              value: documentIntelligenceEndpoint
            }
            {
              name: 'TRANSLATOR_ENDPOINT'
              value: documentTranslatorEndpoint
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

// RBAC to AI Foundry
resource backendToAiFoundryRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(aiFoundryResourceId)) {
  name: guid(backendApp.id, aiFoundryResourceId, cognitiveServicesUserRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC to Document Intelligence
resource backendToDocIntelligenceRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(documentIntelligenceResourceId)) {
  name: guid(backendApp.id, documentIntelligenceResourceId, cognitiveServicesUserRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC to Document Translator
resource backendToTranslatorRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(documentTranslatorResourceId)) {
  name: guid(backendApp.id, documentTranslatorResourceId, cognitiveServicesUserRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
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
=== OCR & Translation App Deployed ===

Frontend URL: https://${frontendApp.properties.configuration.ingress.fqdn}
Backend API URL: https://${backendApp.properties.configuration.ingress.fqdn}

⚠️  These apps are INTERNAL - accessible only via VPN connection.

To access:
1. Connect to the Azure Point-to-Site VPN
2. Open the frontend URL in your browser
3. The frontend will communicate with the backend API

To update container images:
az containerapp update -n ${backendApp.name} -g ${resourceGroup().name} --image <your-backend-image>
az containerapp update -n ${frontendApp.name} -g ${resourceGroup().name} --image <your-frontend-image>
'''
