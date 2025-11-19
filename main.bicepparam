// ============================================================================
// Azure AI Landing Zone - MVP Parameters
// ============================================================================
// This parameters file provides values for the MVP deployment
// Update the values below before deploying

using './main.bicep'

// Required: Your email address for resource tagging
param ownerEmail = 'mikkokallio@microsoft.com'

// Optional: Override the default location
param location = 'swedencentral'

// Optional: Provide a custom unique suffix (3-8 lowercase alphanumeric characters)
// If not specified, a unique string will be generated automatically
// param uniqueSuffix = 'lab001'

// Optional: Override the default Entra ID tenant ID
// If not specified, the current tenant ID will be used
// param entraIdTenantId = '00000000-0000-0000-0000-000000000000'

// Hub connectivity (for VNet peering to existing Hub)
param enableHubPeering = true
param hubVnetId = '/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-connectivity-hub/providers/Microsoft.Network/virtualNetworks/vnet-hub-ezle7syi'
param hubResourceGroupName = 'rg-connectivity-hub'
param hubVnetName = 'vnet-hub-ezle7syi'
param hubDnsResolverIp = '10.1.1.4'

// Optional: Customize network address spaces (use defaults if not specified)
// param vnetAddressPrefix = '10.0.0.0/16'
// param containerAppsSubnetPrefix = '10.0.0.0/23'
// param privateEndpointSubnetPrefix = '10.0.2.0/24'
// param gatewaySubnetPrefix = '10.0.3.0/27'

// Optional: Deploy VPN Gateway for secure developer access (default: true)
// Note: VPN Gateway takes 30-35 minutes to deploy and costs ~$5-20/month
param deployVpnGateway = true

// Optional: Customize VPN client address pool (default: 172.16.201.0/24)
// This is the IP range assigned to VPN clients when they connect
// param vpnClientAddressPool = '172.16.201.0/24'

// Optional: VPN authentication type (default: AzureAD - RECOMMENDED)
// AzureAD: Uses your Microsoft/Entra ID credentials (no certificates needed!)
// Certificate: Requires generating and managing certificates
// param vpnAuthType = 'AzureAD'
