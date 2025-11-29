// ============================================================================
// Azure Cosmos DB for NoSQL - Free Tier
// ============================================================================
// Purpose: Shared metadata storage for applications in the landing zone
// Free Tier: First 1000 RU/s and 25 GB storage are free (one per subscription)
// Use cases: Agent thread metadata, configuration, lightweight app state

@description('Azure region for deployment')
param location string

@description('Unique suffix for resource naming')
param uniqueSuffix string

@description('Private endpoint subnet ID')
param privateEndpointSubnetId string

@description('Virtual network ID for private DNS zone linking')
param vnetId string

@description('Log Analytics workspace ID for diagnostics')
param logAnalyticsWorkspaceId string

@description('Resource tags')
param tags object

@description('Enable Cosmos DB free tier (one per subscription)')
param enableFreeTier bool = true

// ============================================================================
// VARIABLES
// ============================================================================

var cosmosAccountName = 'cosmos-ailz-${uniqueSuffix}'

// ============================================================================
// COSMOS DB ACCOUNT (FREE TIER)
// ============================================================================

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: enableFreeTier  // FREE TIER: First 1000 RU/s and 25 GB free (one per subscription)
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
      maxStalenessPrefix: 100
      maxIntervalInSeconds: 5
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      {
        name: 'EnableServerless'  // Serverless mode - pay per operation, no provisioned throughput
      }
    ]
    publicNetworkAccess: 'Disabled'  // Security: Private endpoint only
    disableKeyBasedMetadataWriteAccess: true  // Security: Require RBAC for management ops
    networkAclBypass: 'AzureServices'  // Allow Azure services (for portal access during dev)
  }
}

// ============================================================================
// PRIVATE ENDPOINT
// ============================================================================

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: '${cosmosAccountName}-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${cosmosAccountName}-plsc'
        properties: {
          privateLinkServiceId: cosmosAccount.id
          groupIds: [
            'Sql'  // NoSQL API endpoint
          ]
        }
      }
    ]
  }
}

// ============================================================================
// PRIVATE DNS ZONE
// ============================================================================

resource privateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.documents.azure.com'
  location: 'global'
  tags: tags
}

resource privateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: privateDnsZone
  name: '${cosmosAccountName}-dns-link'
  location: 'global'
  properties: {
    virtualNetwork: {
      id: vnetId
    }
    registrationEnabled: false
  }
}

resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-documents-azure-com'
        properties: {
          privateDnsZoneId: privateDnsZone.id
        }
      }
    ]
  }
}

// ============================================================================
// DIAGNOSTIC SETTINGS
// ============================================================================

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: cosmosAccount
  name: 'cosmosdb-diagnostics'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'Requests'
        enabled: true
      }
    ]
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output cosmosAccountName string = cosmosAccount.name
output cosmosAccountId string = cosmosAccount.id
output cosmosAccountEndpoint string = cosmosAccount.properties.documentEndpoint
output privateDnsZoneId string = privateDnsZone.id

// Instructions for developers
output setupInstructions string = '''
Cosmos DB Account Created (FREE TIER):
- Account: ${cosmosAccount.name}
- Endpoint: ${cosmosAccount.properties.documentEndpoint}
- Free Tier: 1000 RU/s and 25 GB storage included
- Mode: Serverless (pay per operation, no provisioned capacity)
- Access: Private endpoint only (secure by default)

Next Steps:
1. Applications create databases and containers as needed
2. Use Managed Identity for authentication (no connection strings)
3. Grant "Cosmos DB Built-in Data Contributor" role to app identities
4. Databases are automatically created by applications

Free Tier Benefits:
- First 1000 RU/s free (sufficient for development and small apps)
- First 25 GB storage free
- Only ONE free tier per subscription (shared across all apps)
- Perfect for metadata storage, configuration, session state
'''
