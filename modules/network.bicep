// ============================================================================
// Network Module - VNet, Subnets, NSGs
// ============================================================================

@description('Azure region for resources')
param location string

@description('VNet address prefix')
param vnetAddressPrefix string

@description('Container Apps subnet address prefix')
param containerAppsSubnetPrefix string

@description('Private endpoints subnet address prefix')
param privateEndpointSubnetPrefix string

@description('Gateway subnet address prefix (optional, for VPN)')
param gatewaySubnetPrefix string = ''

@description('DNS Resolver subnet address prefix (for Private DNS Resolver)')
param dnsResolverSubnetPrefix string = ''

@description('Custom DNS servers for VNet (e.g., DNS Resolver inbound endpoint IP). Leave empty to use Azure default DNS.')
param dnsServers array = []

@description('Resource tags')
param tags object

// ============================================================================
// VARIABLES
// ============================================================================

var vnetName = 'vnet-ailz-lab'
var containerAppsSubnetName = 'snet-containerapps'
var privateEndpointSubnetName = 'snet-privateendpoints'
var containerAppsNsgName = 'nsg-containerapps'
var privateEndpointNsgName = 'nsg-privateendpoints'

// ============================================================================
// NETWORK SECURITY GROUPS
// ============================================================================

// NSG for Container Apps subnet
resource containerAppsNsg 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {
  name: containerAppsNsgName
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'Allow-HTTPS-Inbound'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          description: 'Allow HTTPS inbound for Container Apps ingress'
        }
      }
      {
        name: 'Allow-HTTP-Inbound'
        properties: {
          priority: 110
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '80'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          description: 'Allow HTTP inbound (will be redirected to HTTPS)'
        }
      }
      {
        name: 'Allow-EntraID-Outbound'
        properties: {
          priority: 100
          direction: 'Outbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: 'AzureActiveDirectory'
          description: 'Allow outbound to Entra ID for authentication'
        }
      }
      {
        name: 'Allow-Storage-Outbound'
        properties: {
          priority: 110
          direction: 'Outbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: 'Storage'
          description: 'Allow outbound to Azure Storage'
        }
      }
      {
        name: 'Allow-Internet-Outbound'
        properties: {
          priority: 200
          direction: 'Outbound'
          access: 'Allow'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: 'Internet'
          description: 'Allow outbound internet access for container pulls and updates'
        }
      }
    ]
  }
}

// NSG for Private Endpoints subnet
resource privateEndpointNsg 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {
  name: privateEndpointNsgName
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'Allow-VNet-Inbound'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: 'VirtualNetwork'
          destinationAddressPrefix: 'VirtualNetwork'
          description: 'Allow inbound from VNet to private endpoints'
        }
      }
      {
        name: 'Deny-All-Inbound'
        properties: {
          priority: 4096
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          description: 'Deny all other inbound traffic'
        }
      }
    ]
  }
}

// ============================================================================
// VIRTUAL NETWORK
// ============================================================================

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: vnetName
  location: location
  tags: union(tags, { Shared: 'true' })
  properties: {
    addressSpace: {
      addressPrefixes: [
        vnetAddressPrefix
      ]
    }
    // Configure custom DNS servers if provided (e.g., DNS Resolver inbound endpoint)
    // This enables VPN clients and Azure resources to resolve Private DNS zones
    dhcpOptions: !empty(dnsServers) ? {
      dnsServers: dnsServers
    } : null
    // Conditionally add GatewaySubnet and DNS Resolver subnet if prefixes are provided
    subnets: concat([
      {
        name: containerAppsSubnetName
        properties: {
          addressPrefix: containerAppsSubnetPrefix
          networkSecurityGroup: {
            id: containerAppsNsg.id
          }
          delegations: [
            {
              name: 'Microsoft.App.environments'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
          privateEndpointNetworkPolicies: 'Disabled'
          privateLinkServiceNetworkPolicies: 'Enabled'
        }
      }
      {
        name: privateEndpointSubnetName
        properties: {
          addressPrefix: privateEndpointSubnetPrefix
          networkSecurityGroup: {
            id: privateEndpointNsg.id
          }
          privateEndpointNetworkPolicies: 'Disabled'
          privateLinkServiceNetworkPolicies: 'Enabled'
        }
      }
    ], !empty(gatewaySubnetPrefix) ? [
      {
        name: 'GatewaySubnet'
        properties: {
          addressPrefix: gatewaySubnetPrefix
          serviceEndpoints: []
          delegations: []
        }
      }
    ] : [], !empty(dnsResolverSubnetPrefix) ? [
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
    ] : [])
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output vnetId string = vnet.id
output vnetName string = vnet.name

output containerAppsSubnetId string = vnet.properties.subnets[0].id
output containerAppsSubnetName string = vnet.properties.subnets[0].name

output privateEndpointSubnetId string = vnet.properties.subnets[1].id
output privateEndpointSubnetName string = vnet.properties.subnets[1].name

// DNS Resolver subnet ID (conditionally available based on deployment)
output dnsResolverSubnetId string = !empty(dnsResolverSubnetPrefix) ? vnet.properties.subnets[!empty(gatewaySubnetPrefix) ? 3 : 2].id : ''
output dnsResolverSubnetName string = !empty(dnsResolverSubnetPrefix) ? 'snet-dns-inbound' : ''
