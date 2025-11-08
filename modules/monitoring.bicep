// ============================================================================
// Monitoring Module - Log Analytics & Application Insights
// ============================================================================

@description('Azure region for resources')
param location string

@description('Unique suffix for resource names')
param uniqueSuffix string

@description('Resource tags')
param tags object

// ============================================================================
// VARIABLES
// ============================================================================

var logAnalyticsName = 'log-ailz-${uniqueSuffix}'
var appInsightsName = 'appi-ailz-${uniqueSuffix}'

// ============================================================================
// LOG ANALYTICS WORKSPACE
// ============================================================================

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  tags: union(tags, { Shared: 'true' })
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    workspaceCapping: {
      dailyQuotaGb: 1 // Cost control: 1GB per day limit for lab
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ============================================================================
// APPLICATION INSIGHTS
// ============================================================================

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: union(tags, { Shared: 'true' })
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output logAnalyticsWorkspaceId string = logAnalytics.id
output logAnalyticsWorkspaceName string = logAnalytics.name
output logAnalyticsCustomerId string = logAnalytics.properties.customerId

output applicationInsightsId string = appInsights.id
output applicationInsightsName string = appInsights.name
output applicationInsightsConnectionString string = appInsights.properties.ConnectionString
output applicationInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
