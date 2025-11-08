// ============================================================================
// Azure Container Registry Module
// ============================================================================
// Deploys Azure Container Registry for storing container images
// Includes private endpoint connectivity and admin access
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

@description('Log Analytics workspace ID for diagnostics')
param logAnalyticsWorkspaceId string

@description('ACR SKU - Basic, Standard, or Premium (Premium required for private endpoints)')
param sku string = 'Premium'

// ============================================================================
// VARIABLES
// ============================================================================

var acrName = 'acr${uniqueSuffix}ailz'
var privateEndpointName = 'pe-${acrName}'
var privateDnsZoneName = 'privatelink.azurecr.io'

// ============================================================================
// CONTAINER REGISTRY
// ============================================================================

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: tags
  sku: {
    name: sku
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    adminUserEnabled: true // Enable for easier initial setup
    publicNetworkAccess: 'Disabled' // Private endpoint only
    networkRuleBypassOptions: 'AzureServices'
    zoneRedundancy: 'Disabled' // Single zone for cost optimization
    dataEndpointEnabled: false
    policies: {
      quarantinePolicy: {
        status: 'disabled'
      }
      trustPolicy: {
        type: 'Notary'
        status: 'disabled'
      }
      retentionPolicy: {
        days: 7
        status: 'enabled'
      }
      exportPolicy: {
        status: 'enabled'
      }
    }
    encryption: {
      status: 'disabled' // Use platform-managed keys for simplicity
    }
  }
}

// ============================================================================
// PRIVATE DNS ZONE
// ============================================================================

resource privateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: privateDnsZoneName
  location: 'global'
  tags: tags
  properties: {}
}

resource privateDnsZoneVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: privateDnsZone
  name: 'vnet-link'
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnetId
    }
  }
}

// ============================================================================
// PRIVATE ENDPOINT
// ============================================================================

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = {
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
          privateLinkServiceId: acr.id
          groupIds: [
            'registry'
          ]
        }
      }
    ]
  }
}

resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-azurecr-io'
        properties: {
          privateDnsZoneId: privateDnsZone.id
        }
      }
    ]
  }
}

// ============================================================================
// DIAGNOSTIC SETTINGS
// ============================================================================

resource diagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: acr
  name: 'acr-diagnostics'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'ContainerRegistryRepositoryEvents'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
      {
        category: 'ContainerRegistryLoginEvents'
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

output acrName string = acr.name
output acrId string = acr.id
output acrLoginServer string = acr.properties.loginServer
output acrIdentityPrincipalId string = acr.identity.principalId
