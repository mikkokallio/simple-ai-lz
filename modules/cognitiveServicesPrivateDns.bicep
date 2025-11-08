// ============================================================================
// Private DNS Zones for Cognitive Services
// ============================================================================
// Creates Private DNS zones for Azure Cognitive Services and OpenAI
// Links them to the VNet for private endpoint resolution
// ============================================================================

@description('Virtual Network ID to link DNS zones')
param vnetId string

@description('Resource tags')
param tags object = {}

// ============================================================================
// PRIVATE DNS ZONES
// ============================================================================

// Private DNS Zone for Cognitive Services
resource cognitiveServicesPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.cognitiveservices.azure.com'
  location: 'global'
  tags: tags
}

// Link Cognitive Services DNS Zone to VNet
resource cognitiveServicesPrivateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: cognitiveServicesPrivateDnsZone
  name: 'link-to-vnet'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnetId
    }
  }
}

// Private DNS Zone for OpenAI
resource openAiPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.openai.azure.com'
  location: 'global'
  tags: tags
}

// Link OpenAI DNS Zone to VNet
resource openAiPrivateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: openAiPrivateDnsZone
  name: 'link-to-vnet'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnetId
    }
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output cognitiveServicesPrivateDnsZoneId string = cognitiveServicesPrivateDnsZone.id
output cognitiveServicesPrivateDnsZoneName string = cognitiveServicesPrivateDnsZone.name

output openAiPrivateDnsZoneId string = openAiPrivateDnsZone.id
output openAiPrivateDnsZoneName string = openAiPrivateDnsZone.name
