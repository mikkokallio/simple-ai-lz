// ============================================================================
// Azure AI Landing Zone - MVP
// ============================================================================
// This is a minimal viable product deployment for testing the core infrastructure
// Includes: VNet, Container Apps Environment, Storage, Key Vault, Monitoring

targetScope = 'subscription'

// ============================================================================
// PARAMETERS
// ============================================================================

@description('Azure region for all resources')
param location string = 'swedencentral'

@description('Unique suffix for globally unique resource names (3-8 lowercase alphanumeric characters)')
@minLength(3)
@maxLength(8)
param uniqueSuffix string = substring(uniqueString(subscription().subscriptionId, location), 0, 8)

@description('Owner email for resource tagging')
param ownerEmail string

@description('Microsoft Entra ID tenant ID for OAuth configuration')
param entraIdTenantId string = tenant().tenantId

@description('VNet address prefix')
param vnetAddressPrefix string = '10.0.0.0/16'

@description('Container Apps subnet address prefix')
param containerAppsSubnetPrefix string = '10.0.0.0/23'

@description('Private endpoints subnet address prefix')
param privateEndpointSubnetPrefix string = '10.0.2.0/24'

@description('Deploy AI Foundry and AI services')
param deployAiServices bool = true

@description('Deploy Document Intelligence service')
param deployDocumentIntelligence bool = true

@description('Deploy Document Translator service')
param deployDocumentTranslator bool = true

@description('Deploy AI Search service for Finlex ingestion')
param deployAiSearch bool = false

@description('Enable Cosmos DB free tier (one per subscription, not available for Microsoft internal subscriptions)')
param enableCosmosFreeTier bool = true

@description('Deployment timestamp')
param deploymentTimestamp string = utcNow('yyyy-MM-dd')

@description('Resource group name for landing zone resources')
param resourceGroupName string = 'rg-ailz-lab'

@description('Environment name for tagging')
param environmentName string = 'lab'

// ============================================================================
// HUB CONNECTIVITY (Optional - for VNet Peering)
// ============================================================================

@description('Enable VNet peering to Hub (requires existing Hub VNet with VPN Gateway)')
param enableHubPeering bool = true

@description('Hub VNet resource ID (required if enableHubPeering is true)')
param hubVnetId string = ''

@description('Hub resource group name (required for bidirectional peering)')
param hubResourceGroupName string = ''

@description('Hub VNet name (required for bidirectional peering)')
param hubVnetName string = ''

@description('Hub DNS Resolver IP address (typically 10.1.1.4)')
param hubDnsResolverIp string = '10.1.1.4'

// ============================================================================
// CONTAINER REGISTRY
// ============================================================================

@description('Enable public network access for ACR (Enabled for dev/build, Disabled for production)')
@allowed(['Enabled', 'Disabled'])
param acrPublicNetworkAccess string = 'Disabled'

// ============================================================================
// VARIABLES
// ============================================================================

// Common tags applied to all resources
var commonTags = {
  Environment: environmentName
  Purpose: 'demo'
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
// MODULE DEPLOYMENTS
// ============================================================================

// Monitoring (Log Analytics & Application Insights)
module monitoring 'modules/monitoring.bicep' = {
  scope: rg
  name: 'monitoring-deployment'
  params: {
    location: location
    uniqueSuffix: uniqueSuffix
    tags: commonTags
  }
}

// Networking (VNet, Subnets, NSGs)
module network 'modules/network.bicep' = {
  scope: rg
  name: 'network-deployment'
  params: {
    location: location
    vnetAddressPrefix: vnetAddressPrefix
    containerAppsSubnetPrefix: containerAppsSubnetPrefix
    privateEndpointSubnetPrefix: privateEndpointSubnetPrefix
    // VPN Gateway and DNS Resolver are deployed in Hub (hub.bicep), not in Landing Zone
    gatewaySubnetPrefix: ''
    dnsResolverSubnetPrefix: ''
    // DNS servers configured to Hub DNS Resolver if peering is enabled
    dnsServers: enableHubPeering ? [hubDnsResolverIp] : []
    tags: commonTags
  }
}

// ============================================================================
// HUB CONNECTIVITY - VNet Peering (if enabled)
// ============================================================================

// VNet Peering: Landing Zone to Hub
module vnetPeeringToHub 'modules/vnetPeering.bicep' = if (enableHubPeering && !empty(hubVnetId)) {
  scope: rg
  name: 'vnetPeering-lz-to-hub'
  params: {
    localVnetName: network.outputs.vnetName
    remoteVnetId: hubVnetId
    peeringName: '${environmentName}-to-hub'
    allowForwardedTraffic: true
    allowVnetAccess: true
    useRemoteGateways: true
  }
  dependsOn: [
    network
  ]
}

// VNet Peering: Hub to Landing Zone (requires deployment in Hub RG)
module vnetPeeringFromHub 'modules/vnetPeering.bicep' = if (enableHubPeering && !empty(hubVnetId) && !empty(hubResourceGroupName) && !empty(hubVnetName)) {
  scope: resourceGroup(hubResourceGroupName)
  name: 'vnetPeering-hub-to-${environmentName}'
  params: {
    localVnetName: hubVnetName
    remoteVnetId: network.outputs.vnetId
    peeringName: 'hub-to-${environmentName}'
    allowForwardedTraffic: true
    allowVnetAccess: true
    useRemoteGateways: false
    allowGatewayTransit: true
  }
  dependsOn: [
    network
  ]
}

// Key Vault
module keyVault 'modules/keyvault.bicep' = {
  scope: rg
  name: 'keyvault-deployment'
  params: {
    location: location
    uniqueSuffix: uniqueSuffix
    entraIdTenantId: entraIdTenantId
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    vnetId: network.outputs.vnetId
    tags: commonTags
  }
}

// Storage Account with Defender
module storage 'modules/storage.bicep' = {
  scope: rg
  name: 'storage-deployment'
  params: {
    location: location
    uniqueSuffix: uniqueSuffix
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    vnetId: network.outputs.vnetId
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    tags: commonTags
  }
}

// Cosmos DB (Free Tier - shared metadata storage)
module cosmosDb 'modules/cosmosdb.bicep' = {
  scope: rg
  name: 'cosmosdb-deployment'
  params: {
    location: location
    uniqueSuffix: uniqueSuffix
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    vnetId: network.outputs.vnetId
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    enableFreeTier: enableCosmosFreeTier
    tags: commonTags
  }
}

// ============================================================================
// AI SERVICES
// ============================================================================

// Private DNS Zones for Cognitive Services and OpenAI
module cognitiveServicesPrivateDns 'modules/cognitiveServicesPrivateDns.bicep' = if (deployAiServices) {
  scope: rg
  name: 'cognitiveServicesPrivateDns-deployment'
  params: {
    vnetId: network.outputs.vnetId
    tags: commonTags
  }
}

// AI Foundry (includes AI Studio and project)
module aiFoundry 'modules/aiFoundry.bicep' = if (deployAiServices) {
  scope: rg
  name: 'aiFoundry-deployment'
  params: {
    location: location
    uniqueSuffix: uniqueSuffix
    vnetId: network.outputs.vnetId
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    cognitiveServicesPrivateDnsZoneId: cognitiveServicesPrivateDns.outputs.cognitiveServicesPrivateDnsZoneId
    openAiPrivateDnsZoneId: cognitiveServicesPrivateDns.outputs.openAiPrivateDnsZoneId
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    tags: commonTags
  }
  dependsOn: [
    cognitiveServicesPrivateDns
  ]
}

// Cognitive Services (Document Intelligence, Document Translator)
module cognitiveServices 'modules/cognitiveServices.bicep' = if (deployAiServices) {
  scope: rg
  name: 'cognitiveServices-deployment'
  params: {
    location: location
    uniqueSuffix: uniqueSuffix
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    cognitiveServicesPrivateDnsZoneId: cognitiveServicesPrivateDns.outputs.cognitiveServicesPrivateDnsZoneId
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    deployDocumentIntelligence: deployDocumentIntelligence
    deployDocumentTranslator: deployDocumentTranslator
    tags: commonTags
  }
  dependsOn: [
    cognitiveServicesPrivateDns
  ]
}

// AI Search (for Finlex document indexing with vector search)
module aiSearch 'modules/aiSearch.bicep' = if (deployAiSearch) {
  scope: rg
  name: 'aiSearch-deployment'
  params: {
    location: location
    searchServiceName: 'srch-ailz-${uniqueSuffix}'
    sku: 'basic'
    replicaCount: 1
    partitionCount: 1
    semanticSearch: 'disabled' // Change to 'free' or 'standard' to enable semantic search
    tags: commonTags
  }
}

// ============================================================================
// CONTAINER APPS
// ============================================================================

// Container Apps Environment
module containerApps 'modules/containerApps.bicep' = {
  scope: rg
  name: 'containerapps-deployment'
  params: {
    location: location
    uniqueSuffix: uniqueSuffix
    containerAppsSubnetId: network.outputs.containerAppsSubnetId
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    tags: commonTags
  }
}

// Container Apps Private DNS Zone
module containerAppsPrivateDns 'modules/containerAppsPrivateDns.bicep' = {
  scope: rg
  name: 'containerAppsPrivateDns-deployment'
  params: {
    vnetId: network.outputs.vnetId
    containerAppsEnvironmentDefaultDomain: containerApps.outputs.defaultDomain
    tags: commonTags
  }
  dependsOn: [
    containerApps
  ]
}

// Azure Container Registry
module containerRegistry 'modules/containerRegistry.bicep' = {
  scope: rg
  name: 'acr-deployment'
  params: {
    location: location
    uniqueSuffix: uniqueSuffix
    vnetId: network.outputs.vnetId
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    publicNetworkAccess: acrPublicNetworkAccess
    tags: commonTags
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output resourceGroupName string = rg.name
output location string = location

// Network outputs
output vnetId string = network.outputs.vnetId
output vnetName string = network.outputs.vnetName
output containerAppsSubnetId string = network.outputs.containerAppsSubnetId
output privateEndpointSubnetId string = network.outputs.privateEndpointSubnetId

// Container Apps outputs
output containerAppsEnvironmentId string = containerApps.outputs.environmentId
output containerAppsDefaultDomain string = containerApps.outputs.defaultDomain
output containerAppsStaticIp string = containerApps.outputs.staticIp

// Storage outputs
output storageAccountName string = storage.outputs.storageAccountName
output storageAccountId string = storage.outputs.storageAccountId

// Cosmos DB outputs
output cosmosAccountName string = cosmosDb.outputs.cosmosAccountName
output cosmosAccountId string = cosmosDb.outputs.cosmosAccountId
output cosmosAccountEndpoint string = cosmosDb.outputs.cosmosAccountEndpoint
output cosmosSetupInstructions string = cosmosDb.outputs.setupInstructions

// Key Vault outputs
output keyVaultName string = keyVault.outputs.keyVaultName
output keyVaultUri string = keyVault.outputs.keyVaultUri

// Container Registry outputs
output acrName string = containerRegistry.outputs.acrName
output acrLoginServer string = containerRegistry.outputs.acrLoginServer

// Monitoring outputs
output logAnalyticsWorkspaceId string = monitoring.outputs.logAnalyticsWorkspaceId
output applicationInsightsConnectionString string = monitoring.outputs.applicationInsightsConnectionString
output applicationInsightsInstrumentationKey string = monitoring.outputs.applicationInsightsInstrumentationKey

// Configuration outputs
output entraIdTenantId string = entraIdTenantId

// Hub connectivity outputs
output hubPeeringEnabled bool = enableHubPeering
output hubVnetId string = enableHubPeering ? hubVnetId : ''
output hubDnsResolverIp string = enableHubPeering ? hubDnsResolverIp : ''
output peeringToHubState string = (enableHubPeering && !empty(hubVnetId)) ? vnetPeeringToHub.outputs.peeringState : 'Not configured'
output peeringFromHubState string = (enableHubPeering && !empty(hubVnetId) && !empty(hubResourceGroupName)) ? vnetPeeringFromHub.outputs.peeringState : 'Not configured'

// NOTE: VPN Gateway and DNS Resolver outputs are in Hub deployment (hub.bicep)
// These resources are shared across all landing zones via VNet peering

// AI Services outputs (if deployed)
output aiServicesDeployed bool = deployAiServices
output aiFoundryName string = deployAiServices ? aiFoundry!.outputs.aiFoundryName : 'Not deployed'
output aiFoundryEndpoint string = deployAiServices ? aiFoundry!.outputs.aiFoundryEndpoint : ''
output aiFoundryId string = deployAiServices ? aiFoundry!.outputs.aiFoundryId : ''
output aiFoundryProjectName string = deployAiServices ? aiFoundry!.outputs.aiFoundryProjectName : 'Not deployed'
output documentIntelligenceName string = (deployAiServices && deployDocumentIntelligence) ? cognitiveServices!.outputs.documentIntelligenceName : 'Not deployed'
output documentIntelligenceEndpoint string = (deployAiServices && deployDocumentIntelligence) ? cognitiveServices!.outputs.documentIntelligenceEndpoint : ''
output documentIntelligenceId string = (deployAiServices && deployDocumentIntelligence) ? cognitiveServices!.outputs.documentIntelligenceId : ''
output documentTranslatorName string = (deployAiServices && deployDocumentTranslator) ? cognitiveServices!.outputs.documentTranslatorName : 'Not deployed'
output documentTranslatorEndpoint string = (deployAiServices && deployDocumentTranslator) ? cognitiveServices!.outputs.documentTranslatorEndpoint : ''
output documentTranslatorId string = (deployAiServices && deployDocumentTranslator) ? cognitiveServices!.outputs.documentTranslatorId : ''

// AI Search outputs (if deployed)
output aiSearchDeployed bool = deployAiSearch
output aiSearchName string = deployAiSearch ? aiSearch!.outputs.searchServiceName : 'Not deployed'
output aiSearchEndpoint string = deployAiSearch ? aiSearch!.outputs.searchServiceEndpoint : ''
output aiSearchId string = deployAiSearch ? aiSearch!.outputs.searchServiceId : ''
