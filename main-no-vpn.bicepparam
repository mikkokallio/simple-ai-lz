// Temporary parameters file to redeploy without touching VPN Gateway
using './main.bicep'

param ownerEmail = 'mikkokallio@microsoft.com'
param location = 'swedencentral'
param deployVpnGateway = false  // Don't touch VPN Gateway
