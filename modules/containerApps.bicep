// ============================================================================
// Container Apps Environment Module
// ============================================================================

@description('Azure region for resources')
param location string

@description('Unique suffix for resource names')
param uniqueSuffix string

@description('Container Apps subnet resource ID')
param containerAppsSubnetId string

@description('Log Analytics workspace resource ID')
param logAnalyticsWorkspaceId string

@description('Resource tags')
param tags object

// ============================================================================
// VARIABLES
// ============================================================================

var environmentName = 'cae-ailz-${uniqueSuffix}'

// ============================================================================
// CONTAINER APPS ENVIRONMENT
// ============================================================================

resource environment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: environmentName
  location: location
  tags: union(tags, { Shared: 'true' })
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: reference(logAnalyticsWorkspaceId, '2022-10-01').customerId
        sharedKey: listKeys(logAnalyticsWorkspaceId, '2022-10-01').primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: containerAppsSubnetId
      internal: true // Internal for production security
    }
    zoneRedundant: false // Single zone for lab cost optimization
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output environmentId string = environment.id
output environmentName string = environment.name
output defaultDomain string = environment.properties.defaultDomain
output staticIp string = environment.properties.staticIp
