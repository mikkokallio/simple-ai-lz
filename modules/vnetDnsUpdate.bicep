// ============================================================================
// MODULE: VNet DNS Server Update
// ============================================================================
// This module updates an existing VNet's DNS server configuration.
// Used after deploying a DNS Resolver to point the VNet to use it.
//
// IMPORTANT: This module references the existing VNet and redeploys it
// with the updated dhcpOptions.dnsServers property. All other VNet properties
// (addressSpace, subnets) are preserved from the existing configuration.
// ============================================================================

@description('Name of the existing VNet to update')
param vnetName string

@description('Array of DNS server IP addresses to configure')
param dnsServers array

// ============================================================================
// REFERENCE EXISTING VNET AND UPDATE DNS
// ============================================================================

// Reference the existing VNet to get its current configuration
resource vnet 'Microsoft.Network/virtualNetworks@2023-05-01' existing = {
  name: vnetName
}

// Update the VNet with new DNS servers while preserving all other properties
resource updateVnet 'Microsoft.Network/virtualNetworks@2023-05-01' = {
  name: vnet.name
  location: resourceGroup().location
  properties: {
    addressSpace: vnet.properties.addressSpace
    subnets: vnet.properties.subnets
    dhcpOptions: {
      dnsServers: dnsServers
    }
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output vnetId string = updateVnet.id
output vnetName string = updateVnet.name
output configuredDnsServers array = updateVnet.properties.dhcpOptions.dnsServers
