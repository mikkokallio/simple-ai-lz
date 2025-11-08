// ============================================================================
// Example: Hello World Container App
// ============================================================================
// This example deploys a simple "Hello World" container app to test the
// Container Apps Environment infrastructure
//
// Usage:
//   az deployment group create \
//     --resource-group rg-ailz-lab \
//     --template-file examples/hello-world-app.bicep \
//     --parameters containerAppsEnvironmentId='<env-id>' \
//                  appInsightsConnectionString='<connection-string>'
//
// ============================================================================

@description('Container Apps Environment resource ID')
param containerAppsEnvironmentId string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Azure region for resources')
param location string = resourceGroup().location

// ============================================================================
// VARIABLES
// ============================================================================

var appName = 'hello-world'
var containerAppName = 'aca-ailz-${appName}'

// ============================================================================
// HELLO WORLD CONTAINER APP
// ============================================================================

resource helloWorldApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  tags: {
    Application: appName
    Purpose: 'test'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      ingress: {
        external: true  // For internal env: true = VNet-accessible, false = environment-only
        // IMPORTANT: In an internal Container Apps Environment (vnetConfiguration.internal = true):
        // - external: true  → "Accepting traffic from anywhere" = accessible from entire VNet (including VPN)
        // - external: false → "Limited to Container Apps Environment" = only from apps in same environment
        // 
        // Despite the confusing name, 'external: true' does NOT make the app publicly accessible
        // when the environment itself is internal. The environment's internal setting controls that.
        // 
        // Use external: false for BACKEND services that should only receive traffic from other
        // apps in the same environment (e.g., internal APIs, databases, message queues).
        targetPort: 80
        transport: 'auto'
        allowInsecure: false
      }
      dapr: {
        enabled: false
      }
    }
    template: {
      containers: [
        {
          name: 'hello-world'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsightsConnectionString
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-rule'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output appUrl string = 'https://${helloWorldApp.properties.configuration.ingress.fqdn}'
output appName string = helloWorldApp.name
