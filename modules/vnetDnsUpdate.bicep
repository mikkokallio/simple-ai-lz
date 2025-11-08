// ============================================================================
// VNet DNS Configuration Update Module
// ============================================================================
// This module updates the VNet's DNS servers after the DNS Resolver is deployed
// to enable automatic DNS resolution for VPN clients and Azure resources

@description('VNet name to update')
param vnetName string

@description('DNS server IP addresses (DNS Resolver inbound endpoint)')
param dnsServers array

// ============================================================================
// UPDATE VNET DNS CONFIGURATION
// ============================================================================

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' existing = {
  name: vnetName
}

// Note: We can't directly update existing VNet properties in Bicep
// This module documents the required manual step or Azure CLI command
// The VNet DNS configuration must be updated after DNS Resolver deployment

// ============================================================================
// OUTPUTS
// ============================================================================

output setupInstructions string = '''
To complete VNet DNS configuration, run:
az network vnet update \\
  --resource-group ${resourceGroup().name} \\
  --name ${vnetName} \\
  --dns-servers ${join(dnsServers, ' ')}

This configures the VNet to use the DNS Resolver for all resources,
including VPN clients (Point-to-Site connections will automatically
receive these DNS servers).

After updating, regenerate VPN client configuration:
az network vnet-gateway vpn-client generate \\
  --resource-group ${resourceGroup().name} \\
  --name <vpn-gateway-name> \\
  --processor-architecture Amd64
'''
