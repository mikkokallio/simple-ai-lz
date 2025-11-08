// ============================================================================
// Azure AI Foundry Module
// ============================================================================
// Deploys Azure AI Foundry resource (kind: AIFoundry) with projects architecture
// Includes private endpoint connectivity and system-assigned managed identity
// ============================================================================

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Unique suffix for resource names')
param uniqueSuffix string

@description('Resource tags')
param tags object = {}

@description('Virtual Network ID for private endpoint')
param vnetId string

@description('Private endpoint subnet ID')
param privateEndpointSubnetId string

@description('Private DNS zone ID for cognitive services')
param cognitiveServicesPrivateDnsZoneId string

@description('Private DNS zone ID for OpenAI')
param openAiPrivateDnsZoneId string

@description('Log Analytics workspace ID for diagnostics')
param logAnalyticsWorkspaceId string

// ============================================================================
// VARIABLES
// ============================================================================

var aiFoundryName = 'aif-ailz-${uniqueSuffix}'
var aiFoundryProjectName = 'aifp-ailz-${uniqueSuffix}'
var privateEndpointName = 'pe-aif-ailz-${uniqueSuffix}'

// ============================================================================
// AI FOUNDRY RESOURCE (PARENT)
// ============================================================================

resource aiFoundry 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: aiFoundryName
  location: location
  tags: tags
  kind: 'AIFoundry'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: aiFoundryName
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      defaultAction: 'Deny'
    }
    disableLocalAuth: true // Enforce managed identity only
    restrictOutboundNetworkAccess: false
  }
}

// ============================================================================
// AI FOUNDRY PROJECT (CHILD)
// ============================================================================

resource aiFoundryProject 'Microsoft.CognitiveServices/accounts/projects@2024-10-01' = {
  parent: aiFoundry
  name: aiFoundryProjectName
  location: location
  tags: tags
  properties: {
    description: 'AI Foundry project for AI Landing Zone'
  }
}

// ============================================================================
// PRIVATE ENDPOINT
// ============================================================================

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: privateEndpointName
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: privateEndpointName
        properties: {
          privateLinkServiceId: aiFoundry.id
          groupIds: [
            'account'
          ]
        }
      }
    ]
  }
}

// Private DNS Zone Group for both cognitive services and OpenAI zones
resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'cognitiveservices'
        properties: {
          privateDnsZoneId: cognitiveServicesPrivateDnsZoneId
        }
      }
      {
        name: 'openai'
        properties: {
          privateDnsZoneId: openAiPrivateDnsZoneId
        }
      }
    ]
  }
}

// ============================================================================
// DIAGNOSTIC SETTINGS
// ============================================================================

resource diagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'diag-${aiFoundryName}'
  scope: aiFoundry
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'Audit'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
      {
        category: 'RequestResponse'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output aiFoundryId string = aiFoundry.id
output aiFoundryName string = aiFoundry.name
output aiFoundryEndpoint string = aiFoundry.properties.endpoint
output aiFoundryPrincipalId string = aiFoundry.identity.principalId
output aiFoundryProjectId string = aiFoundryProject.id
output aiFoundryProjectName string = aiFoundryProject.name
