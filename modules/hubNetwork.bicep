// ============================================================================
// Hub Network Module - VNet with Gateway and DNS Resolver subnets only
// ============================================================================

@description('Azure region for resources')
param location string

@description('Hub VNet name')
param vnetName string

@description('VNet address prefix')
param vnetAddressPrefix string

@description('Gateway subnet address prefix')
param gatewaySubnetPrefix string

@description('DNS Resolver subnet address prefix')
param dnsResolverSubnetPrefix string

@description('Custom DNS servers for VNet')
param dnsServers array = []

@description('Resource tags')
param tags object

// ============================================================================
// HUB VNET
// ============================================================================

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [vnetAddressPrefix]
    }
    dhcpOptions: empty(dnsServers) ? null : {
      dnsServers: dnsServers
    }
    subnets: [
      // Gateway Subnet for VPN Gateway
      {
        name: 'GatewaySubnet'
        properties: {
          addressPrefix: gatewaySubnetPrefix
          serviceEndpoints: []
        }
      }
      // DNS Resolver subnet
      {
        name: 'snet-dns-inbound'
        properties: {
          addressPrefix: dnsResolverSubnetPrefix
          delegations: [
            {
              name: 'Microsoft.Network.dnsResolvers'
              properties: {
                serviceName: 'Microsoft.Network/dnsResolvers'
              }
            }
          ]
        }
      }
    ]
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output vnetId string = vnet.id
output vnetName string = vnet.name
output gatewaySubnetId string = '${vnet.id}/subnets/GatewaySubnet'
output dnsResolverSubnetId string = '${vnet.id}/subnets/snet-dns-inbound'
