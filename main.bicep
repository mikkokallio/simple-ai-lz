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

@description('Gateway subnet address prefix (for VPN Gateway)')
param gatewaySubnetPrefix string = '10.0.3.0/27'

@description('DNS Resolver subnet address prefix (for Private DNS Resolver)')
param dnsResolverSubnetPrefix string = '10.0.4.0/28'

@description('Deploy VPN Gateway for secure developer access')
param deployVpnGateway bool = true

@description('VPN client address pool for P2S connections')
param vpnClientAddressPool string = '172.16.201.0/24'

@description('Deploy AI Foundry and AI services')
param deployAiServices bool = true

@description('Deploy Document Intelligence service')
param deployDocumentIntelligence bool = true

@description('Deploy Document Translator service')
param deployDocumentTranslator bool = true

@description('Deploy AI Search service for Finlex ingestion')
param deployAiSearch bool = false

@description('Deployment timestamp')
param deploymentTimestamp string = utcNow('yyyy-MM-dd')

// ============================================================================
// VARIABLES
// ============================================================================

var resourceGroupName = 'rg-ailz-lab'
var environmentName = 'lab'

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
// NOTE: VNet DNS servers should be configured AFTER DNS Resolver deployment
// to enable automatic DNS resolution for VPN clients. This creates a circular
// dependency (VNet needed before DNS Resolver, but DNS Resolver IP needed for VNet DNS).
// Solution: Deploy infrastructure, then run post-deployment script to update VNet DNS.
module network 'modules/network.bicep' = {
  scope: rg
  name: 'network-deployment'
  params: {
    location: location
    vnetAddressPrefix: vnetAddressPrefix
    containerAppsSubnetPrefix: containerAppsSubnetPrefix
    privateEndpointSubnetPrefix: privateEndpointSubnetPrefix
    gatewaySubnetPrefix: deployVpnGateway ? gatewaySubnetPrefix : ''
    dnsResolverSubnetPrefix: dnsResolverSubnetPrefix
    // dnsServers: [] // TODO: After DNS Resolver deployment, update to [dnsResolver.outputs.inboundEndpointIp]
    tags: commonTags
  }
}

// VPN Gateway (optional, for developer access with Azure AD auth)
module vpnGateway 'modules/vpnGateway.bicep' = if (deployVpnGateway) {
  scope: rg
  name: 'vpngateway-deployment'
  params: {
    location: location
    vnetId: network.outputs.vnetId
    uniqueSuffix: uniqueSuffix
    tenantId: tenant().tenantId
    vpnClientAddressPool: vpnClientAddressPool
    tags: commonTags
  }
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
    tags: commonTags
  }
}

// DNS Private Resolver (for VPN clients to resolve Private DNS zones)
module dnsResolver 'modules/dnsResolver.bicep' = {
  scope: rg
  name: 'dnsResolver-deployment'
  params: {
    location: location
    uniqueSuffix: uniqueSuffix
    vnetId: network.outputs.vnetId
    dnsResolverSubnetId: network.outputs.dnsResolverSubnetId
    tags: commonTags
  }
  dependsOn: [
    containerAppsPrivateDns
  ]
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

// DNS Resolver outputs
output dnsResolverInboundIp string = dnsResolver.outputs.inboundEndpointIp
output dnsResolverName string = dnsResolver.outputs.dnsResolverName
output dnsResolverSetupInstructions string = dnsResolver.outputs.setupInstructions

// VPN Gateway outputs (if deployed)
output vpnGatewayDeployed bool = deployVpnGateway
output vpnGatewayName string = deployVpnGateway ? vpnGateway!.outputs.vpnGatewayName : 'Not deployed'
output vpnGatewayPublicIp string = deployVpnGateway ? vpnGateway!.outputs.publicIpAddress : 'Not deployed'
output vpnSetupInstructions string = deployVpnGateway ? vpnGateway!.outputs.setupInstructions : 'VPN Gateway not deployed. Set deployVpnGateway=true to enable.'

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
