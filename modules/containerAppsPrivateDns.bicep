// Container Apps Private DNS Zone
// Creates a Private DNS zone for internal Container Apps Environment

param vnetId string
param containerAppsEnvironmentDefaultDomain string
param tags object = {}

resource privateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: containerAppsEnvironmentDefaultDomain
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

// Wildcard A record pointing to the Container Apps Environment static IP
resource wildcardRecord 'Microsoft.Network/privateDnsZones/A@2020-06-01' = {
  parent: privateDnsZone
  name: '*'
  properties: {
    ttl: 3600
    aRecords: [
      {
        ipv4Address: '10.0.1.144' // This should match the Container Apps Environment static IP
      }
    ]
  }
}

output privateDnsZoneName string = privateDnsZone.name
output privateDnsZoneId string = privateDnsZone.id
