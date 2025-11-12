# VPN & DNS Configuration Fix - Summary

## Issue Analysis

### Original Problem
When VPN Gateway and DNS Resolver were moved from the Landing Zone to a separate Hub VNet:
- Your laptop could not resolve private endpoint addresses (e.g., Container Apps)
- Error: "Non-existent domain" when trying to resolve `*.azurecontainerapps.io`
- Root cause: DNS Resolver in Hub VNet couldn't access private DNS zones that were only linked to Landing Zone VNet

### Architecture
```
Hub VNet (10.1.0.0/16) - rg-connectivity-hub
├── VPN Gateway (GatewaySubnet: 10.1.0.0/27)
├── DNS Resolver (snet-dns-inbound: 10.1.1.0/28, IP: 10.1.1.4)
└── Peered to Landing Zone VNet

Landing Zone VNet (10.0.0.0/16) - rg-ailz-lab
├── Private Endpoints (Container Apps, Storage, Key Vault, etc.)
├── Private DNS Zones
└── Peered to Hub VNet
```

## Root Causes Identified

1. **Hub VNet Missing DNS Configuration**
   - Hub VNet had `dnsServers: null`
   - Should be: `dnsServers: [10.1.1.4]`
   - Impact: Hub VNet resources couldn't use the DNS Resolver

2. **Private DNS Zones Not Linked to Hub VNet**
   - All private DNS zones were only linked to Landing Zone VNet
   - DNS Resolver in Hub VNet couldn't resolve private endpoint addresses
   - Impact: VPN clients using DNS Resolver couldn't resolve private endpoints

3. **VPN Client DNS Not Updated**
   - VPN clients need to reconnect to pick up new DNS settings
   - DNS server should be: 10.1.1.4

## Fixes Applied

### 1. Updated Hub VNet DNS Configuration ✅
```bash
az network vnet update \
  --name vnet-hub-ezle7syi \
  --resource-group rg-connectivity-hub \
  --dns-servers 10.1.1.4
```

**Result**: Hub VNet now uses DNS Resolver for all name resolution

### 2. Linked Private DNS Zones to Hub VNet ✅

Created VNet links for all 7 private DNS zones:

| DNS Zone | Purpose | Link Status |
|----------|---------|-------------|
| `mangosmoke-47a72d95.swedencentral.azurecontainerapps.io` | Container Apps | ✅ Linked |
| `privatelink.azurecr.io` | Container Registry | ✅ Linked |
| `privatelink.blob.core.windows.net` | Blob Storage | ✅ Linked |
| `privatelink.cognitiveservices.azure.com` | Cognitive Services | ✅ Linked |
| `privatelink.documents.azure.com` | Cosmos DB | ✅ Linked |
| `privatelink.openai.azure.com` | OpenAI | ✅ Linked |
| `privatelink.vaultcore.azure.net` | Key Vault | ✅ Linked |

**Result**: DNS Resolver can now resolve all private endpoint addresses

## Verification Steps

### 1. Reconnect VPN
**Important**: You must disconnect and reconnect for VPN to pick up new DNS settings

1. Open VPN settings
2. Disconnect from VPN
3. Wait 10 seconds
4. Reconnect to VPN

### 2. Verify DNS Server
After reconnecting, check that your laptop is using the correct DNS server:

```powershell
ipconfig /all | Select-String "DNS Servers"
```

**Expected**: Should show `10.1.1.4` as one of the DNS servers

### 3. Test Private Endpoint Resolution
```powershell
nslookup aca-ai-chat-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io
```

**Expected Result**:
```
Server:  UnKnown
Address:  10.1.1.4

Name:    aca-ai-chat-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io
Address:  10.0.x.x  (private IP)
```

### 4. Test Container App Access
```powershell
Start-Process https://aca-ai-chat-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io
```

**Expected**: Browser opens and loads the application (may need to sign in)

## Troubleshooting

### If DNS Resolution Still Fails

1. **Check VPN Connection**:
   ```powershell
   Get-VpnConnection | Format-List Name, ServerAddress, ConnectionStatus
   ```
   - Status should be "Connected"

2. **Check DNS Server Assignment**:
   ```powershell
   Get-DnsClientServerAddress | Where-Object {$_.InterfaceAlias -like '*VPN*'}
   ```
   - Should show 10.1.1.4

3. **Flush DNS Cache**:
   ```powershell
   ipconfig /flushdns
   Clear-DnsClientCache
   ```

4. **Test DNS Resolver Directly**:
   ```powershell
   nslookup aca-ai-chat-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io 10.1.1.4
   ```

### If VPN Won't Connect

Check VPN Gateway status:
```bash
az network vnet-gateway show \
  --name vpngw-ailz-ezle7syi \
  --resource-group rg-connectivity-hub \
  --query "provisioningState"
```

## Configuration Reference

### Hub VNet Configuration
- **Resource Group**: rg-connectivity-hub
- **VNet Name**: vnet-hub-ezle7syi
- **Address Space**: 10.1.0.0/16
- **DNS Servers**: 10.1.1.4
- **Subnets**:
  - GatewaySubnet: 10.1.0.0/27 (VPN Gateway)
  - snet-dns-inbound: 10.1.1.0/28 (DNS Resolver)

### Landing Zone VNet Configuration
- **Resource Group**: rg-ailz-lab
- **VNet Name**: vnet-ailz-lab
- **Address Space**: 10.0.0.0/16
- **DNS Servers**: 10.1.1.4

### VNet Peering
- **Hub to LZ**: hub-to-lz (allowGatewayTransit: true)
- **LZ to Hub**: lz-to-hub (useRemoteGateways: true)
- **Status**: Connected, FullyInSync

### DNS Resolver
- **Name**: dnspr-ailz-ezle7syi
- **Resource Group**: rg-connectivity-hub
- **VNet**: vnet-hub-ezle7syi
- **Subnet**: snet-dns-inbound (10.1.1.0/28)
- **Inbound Endpoint IP**: 10.1.1.4

## How It Works Now

1. **VPN Client Connects**:
   - Receives IP from pool 172.16.201.0/24
   - Receives DNS server: 10.1.1.4
   - Receives routes: 10.0.0.0/16 (Landing Zone), 10.1.0.0/16 (Hub)

2. **DNS Resolution**:
   - Client queries 10.1.1.4 (DNS Resolver in Hub)
   - DNS Resolver checks private DNS zones (now linked to both VNets)
   - Returns private IP for private endpoints (e.g., Container Apps: 10.0.x.x)
   - Forwards public DNS queries to Azure DNS

3. **Traffic Flow**:
   - Client → VPN Gateway (Hub) → VNet Peering → Landing Zone
   - Client can access private endpoints in Landing Zone

## Key Learnings

1. **DNS Resolver Needs Access to Private DNS Zones**
   - Private DNS zones must be linked to ALL VNets where DNS resolution is needed
   - Including the Hub VNet where the DNS Resolver resides

2. **VNet DNS Configuration Matters**
   - Both Hub and Landing Zone VNets need DNS servers configured
   - Even if DNS Resolver is in the same VNet, explicit configuration is needed

3. **VPN Client Must Reconnect**
   - DNS settings are negotiated during VPN connection establishment
   - Changes require disconnect/reconnect to take effect

4. **Hub-Spoke Architecture Requires Careful DNS Planning**
   - Can't just move DNS Resolver without updating all DNS zone links
   - Both Hub and Spoke VNets need proper DNS configuration

## Date: November 12, 2025
**Status**: ✅ Configuration Complete - Awaiting VPN Reconnection Test
