// ============================================================================
// Key Vault Module with Private Endpoint
// ============================================================================

@description('Azure region for resources')
param location string

@description('Unique suffix for resource names')
param uniqueSuffix string

@description('Entra ID tenant ID')
param entraIdTenantId string

@description('Private endpoint subnet resource ID')
param privateEndpointSubnetId string

@description('VNet resource ID for private DNS zone')
param vnetId string

@description('Resource tags')
param tags object

// ============================================================================
// VARIABLES
// ============================================================================

var keyVaultName = 'kv-ailz-${uniqueSuffix}'
var privateEndpointName = 'pe-${keyVaultName}'
var privateDnsZoneName = 'privatelink.vaultcore.azure.net'
var pvtEndpointDnsGroupName = '${privateEndpointName}/default'

// ============================================================================
// KEY VAULT
// ============================================================================

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: union(tags, { Shared: 'true' })
  properties: {
    tenantId: entraIdTenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true // Use RBAC instead of access policies
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Disabled' // Force private endpoint usage
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
      ipRules: []
      virtualNetworkRules: []
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
}

resource privateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: privateDnsZone
  name: '${privateDnsZoneName}-link'
  location: 'global'
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
          privateLinkServiceId: keyVault.id
          groupIds: [
            'vault'
          ]
        }
      }
    ]
  }
}

resource pvtEndpointDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  name: pvtEndpointDnsGroupName
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config1'
        properties: {
          privateDnsZoneId: privateDnsZone.id
        }
      }
    ]
  }
  dependsOn: [
    privateEndpoint
  ]
}

// ============================================================================
// OUTPUTS
// ============================================================================

output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
