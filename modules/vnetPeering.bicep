// ============================================================================
// MODULE: VNet Peering to Hub
// ============================================================================
// Creates peering from Landing Zone VNet to Hub VNet
// Enables use of Hub's VPN Gateway and DNS Resolver

@description('Name of the local (Landing Zone) VNet')
param localVnetName string

@description('Resource ID of the remote (Hub) VNet')
param remoteVnetId string

@description('Name for the peering connection')
param peeringName string = 'lz-to-hub'

@description('Allow traffic forwarded from remote VNet')
param allowForwardedTraffic bool = true

@description('Allow access to remote VNet')
param allowVnetAccess bool = true

@description('Use remote VNet gateway (Hub VPN Gateway)')
param useRemoteGateways bool = true

// ============================================================================
// VNET PEERING
// ============================================================================

resource localVnet 'Microsoft.Network/virtualNetworks@2023-05-01' existing = {
  name: localVnetName
}

resource peering 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2023-05-01' = {
  parent: localVnet
  name: peeringName
  properties: {
    allowVirtualNetworkAccess: allowVnetAccess
    allowForwardedTraffic: allowForwardedTraffic
    useRemoteGateways: useRemoteGateways
    remoteVirtualNetwork: {
      id: remoteVnetId
    }
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output peeringName string = peering.name
output peeringState string = peering.properties.peeringState
output remoteVnetId string = remoteVnetId
