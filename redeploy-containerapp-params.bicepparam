using './main.bicep'

param ownerEmail = 'mikkokallio@microsoft.com'
param location = 'swedencentral'
param deployVpnGateway = false  // Skip VPN Gateway redeployment
