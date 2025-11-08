// ============================================================================
// VPN Gateway Module - Point-to-Site VPN for Developer Access
// ============================================================================
// Deploys VPN Gateway with Azure AD (Entra ID) authentication for P2S VPN

@description('Azure region for resources')
param location string

@description('VNet ID')
param vnetId string

@description('Resource tags')
param tags object

@description('Unique suffix for resource names')
param uniqueSuffix string

@description('Azure AD tenant ID (auto-populated from subscription)')
param tenantId string

@description('VPN client address pool for P2S connections')
param vpnClientAddressPool string = '172.16.201.0/24'

// ============================================================================
// VARIABLES
// ============================================================================

var vpnGatewayName = 'vpngw-ailz-${uniqueSuffix}'
var publicIpName = 'pip-vpngw-ailz-${uniqueSuffix}'

// Azure AD authentication configuration for VPN
var aadTenant = 'https://login.microsoftonline.com/${tenantId}'
var aadAudience = 'c632b3df-fb67-4d84-bdcf-b95ad541b5c8'  // Microsoft's fixed GUID for VPN Gateway
var aadIssuer = 'https://sts.windows.net/${tenantId}/'     // Trailing slash is mandatory

// ============================================================================
// REFERENCE EXISTING GATEWAY SUBNET
// ============================================================================

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' existing = {
  name: split(vnetId, '/')[8]

  resource gatewaySubnet 'subnets' existing = {
    name: 'GatewaySubnet'
  }
}

// ============================================================================
// PUBLIC IP FOR VPN GATEWAY
// ============================================================================

resource publicIp 'Microsoft.Network/publicIPAddresses@2023-09-01' = {
  name: publicIpName
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
    publicIPAddressVersion: 'IPv4'
  }
}

// ============================================================================
// VPN GATEWAY with P2S Azure AD Configuration
// ============================================================================

resource vpnGateway 'Microsoft.Network/virtualNetworkGateways@2023-09-01' = {
  name: vpnGatewayName
  location: location
  tags: tags
  properties: {
    gatewayType: 'Vpn'
    vpnType: 'RouteBased'
    enableBgp: false
    activeActive: false
    sku: {
      name: 'VpnGw1'  // Basic tier, supports up to 128 P2S connections
      tier: 'VpnGw1'
    }
    ipConfigurations: [
      {
        name: 'default'
        properties: {
          privateIPAllocationMethod: 'Dynamic'
          publicIPAddress: {
            id: publicIp.id
          }
          subnet: {
            id: vnet::gatewaySubnet.id
          }
        }
      }
    ]
    // P2S VPN Client Configuration with Azure AD authentication
    vpnClientConfiguration: {
      vpnClientAddressPool: {
        addressPrefixes: [
          vpnClientAddressPool
        ]
      }
      vpnClientProtocols: [
        'OpenVPN'  // OpenVPN (SSL) - works on Windows, Mac, Linux, iOS, Android
      ]
      vpnAuthenticationTypes: [
        'AAD'  // Azure Active Directory
      ]
      // Azure AD (Entra ID) authentication configuration
      aadTenant: aadTenant
      aadAudience: aadAudience
      aadIssuer: aadIssuer
      // Custom DNS servers for VPN clients (Azure DNS for Private DNS resolution)
      vpnClientRootCertificates: []
      vpnClientRevokedCertificates: []
      radiusServers: []
      vpnClientIpsecPolicies: []
    }
    customRoutes: {
      addressPrefixes: []
    }
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output vpnGatewayId string = vpnGateway.id
output vpnGatewayName string = vpnGateway.name
output publicIpAddress string = publicIp.properties.ipAddress
output gatewaySubnetId string = vnet::gatewaySubnet.id
output vpnClientAddressPool string = vpnClientAddressPool

// Instructions for connecting to VPN with Azure AD authentication
output setupInstructions string = '''
VPN Gateway deployed with Azure AD (Entra ID) authentication!

âœ… READY TO USE - No certificate generation needed!

Configuration values:
  - Tenant: ${aadTenant}
  - Audience: ${aadAudience}
  - Issuer: ${aadIssuer}
  - Client Address Pool: ${vpnClientAddressPool}

STEP 1: Download Azure VPN Client for Windows
   https://aka.ms/azvpnclientdownload

STEP 2: Download VPN client configuration package:
   az network vnet-gateway vpn-client generate \\
     --resource-group rg-ailz-lab \\
     --name ${vpnGatewayName} \\
     --processor-architecture Amd64

STEP 3: Import configuration into Azure VPN Client
   - Open Azure VPN Client
   - Click "+" then "Import"
   - Select azurevpnconfig.xml from the downloaded ZIP

STEP 4: Connect
   - Click "Connect" and sign in with your Microsoft credentials
   - You'll receive an IP from ${vpnClientAddressPool}

STEP 5: Access internal resources
   - Internal Container Apps at *.internal.<environment-domain>
   - Private endpoints for Storage and Key Vault
'''
