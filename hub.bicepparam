using './hub.bicep'

// Replace with your actual values
param uniqueSuffix = 'ezle7syi'
param ownerEmail = 'mikkokallio@microsoft.com'

// Hub VNet uses 10.1.0.0/16 (different from LZ 10.0.0.0/16)
param hubVnetAddressPrefix = '10.1.0.0/16'
param gatewaySubnetPrefix = '10.1.0.0/27'
param dnsResolverSubnetPrefix = '10.1.1.0/28'

// VPN configuration
param vpnClientAddressPool = '172.16.201.0/24'

// Custom routes = Landing Zone VNet CIDR
param vpnCustomRoutes = ['10.0.0.0/16']
