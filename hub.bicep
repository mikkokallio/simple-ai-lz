// ============================================================================
// Azure Connectivity Hub - VPN Gateway & DNS Resolver
// ============================================================================
// Deploys the connectivity infrastructure in a separate Hub resource group
// following Azure Landing Zone Hub-Spoke architecture pattern

targetScope = 'subscription'

// ============================================================================
// PARAMETERS
// ============================================================================

@description('Azure region for all resources')
param location string = 'swedencentral'

@description('Unique suffix for globally unique resource names')
@minLength(3)
@maxLength(8)
param uniqueSuffix string

@description('Owner email for resource tagging')
param ownerEmail string

@description('Microsoft Entra ID tenant ID for VPN OAuth configuration')
param entraIdTenantId string = tenant().tenantId

@description('Hub VNet address prefix')
param hubVnetAddressPrefix string = '10.1.0.0/16'

@description('Gateway subnet address prefix (for VPN Gateway)')
param gatewaySubnetPrefix string = '10.1.0.0/27'

@description('DNS Resolver subnet address prefix')
param dnsResolverSubnetPrefix string = '10.1.1.0/28'

@description('VPN client address pool for P2S connections')
param vpnClientAddressPool string = '172.16.201.0/24'

@description('Custom routes to advertise to VPN clients (Landing Zone VNet)')
param vpnCustomRoutes array = ['10.0.0.0/16']

@description('Deployment timestamp')
param deploymentTimestamp string = utcNow('yyyy-MM-dd')

// ============================================================================
// VARIABLES
// ============================================================================

var resourceGroupName = 'rg-connectivity-hub'
var environmentName = 'hub'

// Common tags
var commonTags = {
  Environment: environmentName
  Purpose: 'connectivity'
  Owner: ownerEmail
  Project: 'AI-LZ'
  ManagedBy: 'Bicep'
  CreatedDate: deploymentTimestamp
}

// ============================================================================
// RESOURCE GROUP
// ============================================================================

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
  tags: commonTags
}

// ============================================================================
// HUB VNET
// ============================================================================

module hubNetwork 'modules/hubNetwork.bicep' = {
  scope: rg
  name: 'hub-network-deployment'
  params: {
    location: location
    tags: commonTags
    vnetName: 'vnet-hub-${uniqueSuffix}'
    vnetAddressPrefix: hubVnetAddressPrefix
    gatewaySubnetPrefix: gatewaySubnetPrefix
    dnsResolverSubnetPrefix: dnsResolverSubnetPrefix
    dnsServers: [] // Will be updated after DNS Resolver deployment
  }
}

// ============================================================================
// VPN GATEWAY
// ============================================================================

module vpnGateway 'modules/vpnGateway.bicep' = {
  scope: rg
  name: 'vpngateway-deployment'
  params: {
    location: location
    uniqueSuffix: uniqueSuffix
    tags: commonTags
    vnetId: hubNetwork.outputs.vnetId
    tenantId: entraIdTenantId
    vpnClientAddressPool: vpnClientAddressPool
    customRoutes: vpnCustomRoutes
  }
}

// ============================================================================
// DNS RESOLVER
// ============================================================================

module dnsResolver 'modules/dnsResolver.bicep' = {
  scope: rg
  name: 'dnsResolver-deployment'
  params: {
    location: location
    uniqueSuffix: uniqueSuffix
    tags: commonTags
    vnetId: hubNetwork.outputs.vnetId
    dnsResolverSubnetId: hubNetwork.outputs.dnsResolverSubnetId
  }
}

// ============================================================================
// UPDATE HUB VNET DNS
// ============================================================================

// Note: Hub VNet DNS must be updated after deployment to use DNS Resolver
// Run: az network vnet update --name vnet-hub-ezle7syi --resource-group rg-connectivity-hub --dns-servers <dns-resolver-ip>

// ============================================================================
// OUTPUTS
// ============================================================================

output resourceGroupName string = rg.name
output hubVnetId string = hubNetwork.outputs.vnetId
output hubVnetName string = hubNetwork.outputs.vnetName
output dnsResolverInboundIp string = dnsResolver.outputs.inboundEndpointIp
output dnsResolverName string = dnsResolver.outputs.dnsResolverName
output vpnGatewayName string = vpnGateway.outputs.vpnGatewayName
output vpnGatewayId string = vpnGateway.outputs.vpnGatewayId
