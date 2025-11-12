# VPN and DNS Issue Resolution

## Issue Summary
After migrating VPN Gateway and DNS Resolver from Landing Zone VNet to Hub VNet, the Container App became inaccessible from both P2S VPN clients and test VM inside Azure.

## Date Resolved
November 12, 2025

## Root Cause
The private DNS zone wildcard record for Container Apps was pointing to an **incorrect IP address**:
- **Incorrect IP**: `10.0.1.144`
- **Correct IP**: `10.0.0.225` (Container Apps Environment static IP)

## Architecture
```
Hub VNet (10.1.0.0/16) - rg-connectivity-hub
├── GatewaySubnet (10.1.0.0/27)
│   └── vpngw-ailz-ezle7syi (VPN Gateway with Azure AD auth)
└── snet-dns-inbound (10.1.1.0/28)
    └── dnspr-ailz-ezle7syi (DNS Resolver at 10.1.1.4)

Landing Zone VNet (10.0.0.0/16) - rg-ailz-lab
└── snet-containerapps (10.0.0.0/23)
    └── cae-ailz-ezle7syi (Container Apps Environment)
        ├── Static IP: 10.0.0.225
        └── aca-ai-chat-frontend-ezle7syi

VNet Peering:
- hub-to-lz: allowGatewayTransit = true
- lz-to-hub: useRemoteGateways = true
```

## Investigation Steps

### 1. Initial Symptoms
- Container App accessible before VPN/DNS migration
- After migration to Hub VNet:
  - P2S VPN clients could not access Container App
  - DNS resolution failed
  - Connection timeouts when accessing Container App FQDN

### 2. DNS Configuration Verification (Already Fixed Earlier)
✅ Hub VNet DNS servers: `10.1.1.4` (correct)
✅ Landing Zone VNet DNS servers: `10.1.1.4` (correct)
✅ Private DNS zones linked to both Hub and Landing Zone VNets

### 3. Container App Configuration Verification
```bash
az containerapp env show --name cae-ailz-ezle7syi
```
- Static IP: `10.0.0.225`
- VNet Configuration: Internal mode (`internal: true`)
- Public Network Access: Disabled
- Infrastructure Subnet: `snet-containerapps`

### 4. Test VM Deployment
Deployed Windows VM in Hub VNet for testing:
- VM: `vm-test-hub` in `rg-connectivity-hub`
- Bastion: `bastion-hub-test` for secure access
- Purpose: Test connectivity from inside Azure VNet

### 5. Critical Discovery - DNS Resolution Test from VM
```powershell
Test-NetConnection -ComputerName aca-ai-chat-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io -Port 443
```

**Result:**
```
RemoteAddress: 10.0.1.144  # WRONG IP!
TcpTestSucceeded: False
```

**Expected:**
```
RemoteAddress: 10.0.0.225  # Container Apps static IP
```

### 6. Private DNS Zone Investigation
```bash
az network private-dns record-set a list \
  --resource-group rg-ailz-lab \
  --zone-name mangosmoke-47a72d95.swedencentral.azurecontainerapps.io
```

**Found:**
```json
{
  "name": "*",
  "aRecords": [{"ipv4Address": "10.0.1.144"}]  // INCORRECT!
}
```

## Resolution Applied

### Fix: Update DNS Wildcard Record
```bash
az network private-dns record-set a update \
  --resource-group rg-ailz-lab \
  --zone-name mangosmoke-47a72d95.swedencentral.azurecontainerapps.io \
  --name "*" \
  --set aRecords[0].ipv4Address=10.0.0.225
```

**Result:**
```json
{
  "name": "*",
  "fqdn": "*.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io.",
  "aRecords": [{"ipv4Address": "10.0.0.225"}],  // CORRECT!
  "ttl": 3600
}
```

### VPN Client Reconnection
P2S VPN clients needed to **disconnect and reconnect** after the DNS fix to:
1. Pick up the updated Hub VNet DNS configuration (10.1.1.4)
2. Clear local DNS cache
3. Establish proper DNS resolution through Azure DNS Resolver

## Verification

### From Test VM (Inside Azure)
✅ DNS resolves to `10.0.0.225`
✅ TCP connection to port 443 succeeds
✅ Container App loads in browser

### From P2S VPN Client (Laptop)
After VPN reconnection:
✅ VPN interface `vnet-hub-ezle7syi` connected
✅ Route to `10.0.0.0/16` via VPN interface exists
✅ DNS resolution works through `10.1.1.4`
✅ Container App accessible in browser

## Configuration Summary

### VPN Gateway Configuration
- **Name**: `vpngw-ailz-ezle7syi`
- **Resource Group**: `rg-connectivity-hub`
- **VNet**: `vnet-hub-ezle7syi`
- **Authentication**: Azure AD (AAD)
- **Protocol**: OpenVPN
- **Client Address Pool**: `172.16.201.0/24`
- **AAD Tenant**: `822e1525-06a0-418c-9fab-ffc6a51aaac5`

### DNS Resolver Configuration
- **Name**: `dnspr-ailz-ezle7syi`
- **Resource Group**: `rg-connectivity-hub`
- **VNet**: `vnet-hub-ezle7syi`
- **Subnet**: `snet-dns-inbound`
- **Inbound Endpoint IP**: `10.1.1.4`

### Private DNS Zones (All Linked to Both VNets)
1. `mangosmoke-47a72d95.swedencentral.azurecontainerapps.io` ✅ Fixed wildcard record
2. `privatelink.azurecr.io`
3. `privatelink.blob.core.windows.net`
4. `privatelink.cognitiveservices.azure.com`
5. `privatelink.documents.azure.com`
6. `privatelink.openai.azure.com`
7. `privatelink.vaultcore.azure.net`

### Container Apps Environment
- **Name**: `cae-ailz-ezle7syi`
- **Static IP**: `10.0.0.225`
- **Default Domain**: `mangosmoke-47a72d95.swedencentral.azurecontainerapps.io`
- **VNet Integration**: Internal (`internal: true`)
- **Infrastructure Subnet**: `snet-containerapps` (10.0.0.0/23)

## Key Learnings

### 1. Private DNS Record Accuracy is Critical
Even with perfect VPN, DNS Resolver, and VNet configuration, **incorrect IP addresses in private DNS zones** will break connectivity. Always verify DNS records point to correct IPs.

### 2. Container Apps Static IP
When Container Apps Environment is deployed with VNet integration:
- The `staticIp` property contains the ingress IP
- This IP must match the private DNS zone wildcard record
- All apps in the environment share this IP (hostname-based routing)

### 3. VPN Client DNS Behavior
Azure VPN Client with Azure AD authentication:
- Does NOT create traditional Windows network adapters visible in `Get-NetAdapter`
- DNS configuration comes from Hub VNet settings
- **Requires disconnect/reconnect** to pick up DNS changes
- Route table will show VPN interface name (e.g., `vnet-hub-ezle7syi`)

### 4. Testing from Inside Azure
Deploying a test VM with Bastion in the Hub VNet proved invaluable:
- Isolated network issues from VPN client problems
- Confirmed DNS resolution behavior
- Validated Container Apps accessibility
- Test VM remains available for future troubleshooting

## Previous Fixes Applied (Before This Issue)

### Earlier Fix 1: Hub VNet DNS Configuration
```bash
az network vnet update \
  --name vnet-hub-ezle7syi \
  --resource-group rg-connectivity-hub \
  --dns-servers 10.1.1.4
```

### Earlier Fix 2: Private DNS Zone VNet Links
Created VNet links for all 7 private DNS zones to Hub VNet:
```bash
az network private-dns link vnet create \
  --resource-group rg-ailz-lab \
  --zone-name <zone-name> \
  --name hub-vnet-link \
  --virtual-network /subscriptions/.../vnet-hub-ezle7syi \
  --registration-enabled false
```

## Final Status
✅ **RESOLVED** - Container App accessible from:
- P2S VPN clients (after reconnection)
- Test VM in Hub VNet
- Any resource in peered VNets

## Troubleshooting Commands Reference

### Check DNS Resolution
```powershell
# From Windows client
nslookup aca-ai-chat-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io

# Check which DNS server is being used
Get-DnsClientServerAddress -AddressFamily IPv4

# Check VPN routes
Get-NetRoute -DestinationPrefix "10.0.0.0/16"
```

### Verify Container Apps
```bash
# Get Container Apps Environment static IP
az containerapp env show --name cae-ailz-ezle7syi \
  --resource-group rg-ailz-lab \
  --query "{staticIp:properties.staticIp,defaultDomain:properties.defaultDomain}"

# Check Container App status
az containerapp show --name aca-ai-chat-frontend-ezle7syi \
  --resource-group rg-ailz-lab \
  --query "{name:name,fqdn:properties.configuration.ingress.fqdn,running:properties.runningStatus}"
```

### Check Private DNS Records
```bash
# List all A records in Container Apps zone
az network private-dns record-set a list \
  --resource-group rg-ailz-lab \
  --zone-name mangosmoke-47a72d95.swedencentral.azurecontainerapps.io

# Check VNet links
az network private-dns link vnet list \
  --resource-group rg-ailz-lab \
  --zone-name mangosmoke-47a72d95.swedencentral.azurecontainerapps.io
```

### Test from Azure VM
```bash
# Run command on VM
az vm run-command invoke \
  --resource-group rg-connectivity-hub \
  --name vm-test-hub \
  --command-id RunPowerShellScript \
  --scripts "Test-NetConnection -ComputerName aca-ai-chat-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io -Port 443"
```

## Resources Deployed

### Hub Resource Group (rg-connectivity-hub)
- VPN Gateway: `vpngw-ailz-ezle7syi`
- DNS Resolver: `dnspr-ailz-ezle7syi`
- Hub VNet: `vnet-hub-ezle7syi`
- Public IP: `pip-vpngw-ailz-ezle7syi`
- Test VM: `vm-test-hub`
- Bastion: `bastion-hub-test`
- Bastion Public IP: `pip-bastion-hub-test`

### Landing Zone Resource Group (rg-ailz-lab)
- Container Apps Environment: `cae-ailz-ezle7syi`
- Container App: `aca-ai-chat-frontend-ezle7syi`
- Landing Zone VNet: `vnet-ailz-lab`
- 7 Private DNS Zones (all linked to both VNets)

---
**Document Author**: GitHub Copilot
**Last Updated**: November 12, 2025
