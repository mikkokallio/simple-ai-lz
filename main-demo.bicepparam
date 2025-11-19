// ============================================================================
// Azure AI Landing Zone - Demo Environment Parameters
// ============================================================================
// NEW demo environment deployment in rg-ailz-demo
// Keeps existing rg-ailz-lab untouched
// Uses Hub infrastructure from rg-connectivity-hub (already deployed)

using './main.bicep'

// Required: Your email address for resource tagging
param ownerEmail = 'mikkokallio@microsoft.com'

// Location
param location = 'swedencentral'

// CRITICAL: New resource group name for demo environment (increment version on each deployment)
param resourceGroupName = 'rg-ailz-demo-v8'
param environmentName = 'demo'

// CRITICAL: Use different suffix to avoid naming conflicts with lab environment
param uniqueSuffix = 'demo08'

// CRITICAL: Use different VNet address space to avoid IP conflicts with lab (10.0.0.0/16)
param vnetAddressPrefix = '10.2.0.0/16'
param containerAppsSubnetPrefix = '10.2.0.0/23'
param privateEndpointSubnetPrefix = '10.2.2.0/24'

// Entra ID tenant
param entraIdTenantId = '975e0a89-c2d3-4837-a06d-b3c00555d7f6'

// Hub connectivity (enables VPN access via Hub VPN Gateway)
param enableHubPeering = true
param hubVnetId = '/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-connectivity-hub/providers/Microsoft.Network/virtualNetworks/vnet-hub-ezle7syi'
param hubResourceGroupName = 'rg-connectivity-hub'
param hubVnetName = 'vnet-hub-ezle7syi'
param hubDnsResolverIp = '10.1.1.4'

// Container Registry: Enable public access for image builds (use Disabled for production)
param acrPublicNetworkAccess = 'Enabled'

// Cosmos DB: Disable free tier for Microsoft internal subscriptions
param enableCosmosFreeTier = false

// AI Services deployment flags
param deployAiServices = true
param deployDocumentIntelligence = true
param deployDocumentTranslator = true
param deployAiSearch = false
