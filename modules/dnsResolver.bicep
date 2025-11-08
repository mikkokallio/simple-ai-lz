// Azure DNS Private Resolver
// Enables P2S VPN clients to resolve Private DNS zones (including internal Container Apps)

param location string
param uniqueSuffix string
param vnetId string
param dnsResolverSubnetId string
param tags object = {}

// ============================================================================
// VARIABLES
// ============================================================================

var dnsResolverName = 'dnspr-ailz-${uniqueSuffix}'
var inboundEndpointName = 'inbound-endpoint'

// ============================================================================
// DNS PRIVATE RESOLVER
// ============================================================================
// Note: The subnet (snet-dns-inbound) must already exist and be delegated to Microsoft.Network/dnsResolvers

resource dnsResolver 'Microsoft.Network/dnsResolvers@2022-07-01' = {
  name: dnsResolverName
  location: location
  tags: tags
  properties: {
    virtualNetwork: {
      id: vnetId
    }
  }
}

// ============================================================================
// INBOUND ENDPOINT
// ============================================================================
// Provides an IP address for VPN clients to use as their DNS server
// VPN clients will be automatically configured to use this IP via the VNet's DNS settings

resource inboundEndpoint 'Microsoft.Network/dnsResolvers/inboundEndpoints@2022-07-01' = {
  parent: dnsResolver
  name: inboundEndpointName
  location: location
  tags: tags
  properties: {
    ipConfigurations: [
      {
        privateIpAllocationMethod: 'Dynamic'
        subnet: {
          id: dnsResolverSubnetId
        }
      }
    ]
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output dnsResolverName string = dnsResolver.name
output dnsResolverId string = dnsResolver.id
output inboundEndpointId string = inboundEndpoint.id
output inboundEndpointIp string = inboundEndpoint.properties.ipConfigurations[0].privateIpAddress

output setupInstructions string = '''
Azure DNS Private Resolver Configured Successfully!

The inbound endpoint IP (${inboundEndpoint.properties.ipConfigurations[0].privateIpAddress}) will be automatically configured 
as the DNS server for VPN clients through the VNet's custom DNS settings.

VPN clients will now be able to resolve:
- Private DNS zones linked to the VNet
- Internal Container Apps domains
- Private endpoints

No additional VPN client configuration is required.
'''
