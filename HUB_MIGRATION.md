# Hub-Spoke Migration Guide

## Overview

This migration separates the connectivity infrastructure (VPN Gateway and DNS Resolver) from the Landing Zone into a dedicated Hub resource group, following Azure Landing Zone best practices.

## Architecture

**Before:**
```
rg-ailz-lab
├── vnet-ailz-lab (10.0.0.0/16)
│   ├── snet-containerapps
│   ├── snet-privateendpoints
│   ├── GatewaySubnet (VPN Gateway)
│   └── snet-dns-inbound (DNS Resolver)
├── Container Apps Environment
├── Storage, KeyVault, etc.
├── VPN Gateway
└── DNS Resolver
```

**After:**
```
rg-connectivity-hub                    rg-ailz-lab
├── vnet-hub-ezle7syi (10.1.0.0/16)  ├── vnet-ailz-lab (10.0.0.0/16)
│   ├── GatewaySubnet                │   ├── snet-containerapps
│   └── snet-dns-inbound             │   └── snet-privateendpoints
├── VPN Gateway                       ├── Container Apps Environment
└── DNS Resolver                      └── Storage, KeyVault, etc.
        │                                     │
        └─────────VNet Peering────────────────┘
                (with Gateway Transit)
```

## Migration Steps

### 1. Review Files

New files created:
- `hub.bicep` - Hub infrastructure template
- `hub.bicepparam` - Hub parameters
- `modules/hubNetwork.bicep` - Simplified network module for hub
- `migrate-to-hub.ps1` - Automated migration script

### 2. Execute Migration

Run the migration script:

```powershell
.\migrate-to-hub.ps1
```

The script will:
1. ✅ Delete VPN Gateway from rg-ailz-lab (15-20 min)
2. ✅ Delete DNS Resolver from rg-ailz-lab
3. ✅ Remove GatewaySubnet and snet-dns-inbound from Landing Zone VNet
4. ✅ Deploy Hub infrastructure (rg-connectivity-hub)
5. ✅ Set up VNet peering (Hub ↔ Landing Zone)
6. ✅ Update Landing Zone VNet DNS to use Hub DNS Resolver

### 3. Update VPN Client

After migration completes:

```powershell
# Generate new VPN profile
az network vnet-gateway vpn-client generate `
    --resource-group rg-connectivity-hub `
    --name vpngw-ezle7syi `
    --authentication-method EAPTLS -o tsv
```

Download the ZIP, extract, and import `AzureVPN/azurevpnconfig.xml` into Azure VPN Client.

### 4. Verify Connectivity

1. Connect to VPN
2. Test DNS resolution:
   ```powershell
   nslookup aca-ai-chat-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io
   ```
   Should resolve to `10.0.1.x` (private IP)

3. Open browser: `https://aca-ai-chat-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io`

## Key Configuration

### Hub VNet
- **Address Space**: 10.1.0.0/16
- **Gateway Subnet**: 10.1.0.0/27
- **DNS Resolver Subnet**: 10.1.1.0/28

### Landing Zone VNet
- **Address Space**: 10.0.0.0/16 (unchanged)
- **DNS Servers**: Points to Hub DNS Resolver (10.1.1.4)

### VPN Configuration
- **Client Pool**: 172.16.201.0/24
- **Custom Routes**: 10.0.0.0/16 (advertises LZ VNet to VPN clients)
- **DNS**: 10.1.1.4 (Hub DNS Resolver)

### VNet Peering
- **Hub → LZ**: Gateway transit enabled
- **LZ → Hub**: Use remote gateways enabled

## Benefits

✅ **Separation of Concerns**: Connectivity infra isolated from workload infra
✅ **Hub-Spoke Pattern**: Follows Azure Landing Zone best practices
✅ **Scalability**: Easy to add more spokes in future
✅ **Better DNS Management**: Central DNS resolver serves all spokes
✅ **Gateway Sharing**: Single VPN gateway can serve multiple spokes

## What Didn't Change

⚠️ **Container Apps**: No changes, no redeployment
⚠️ **Private Endpoints**: Remain in Landing Zone VNet
⚠️ **Storage, KeyVault, etc.**: All workload resources untouched
⚠️ **Private DNS Zones**: Still in rg-ailz-lab, linked to both VNets

## Rollback

If needed, you can revert by:
1. Deleting rg-connectivity-hub resource group
2. Redeploying VPN/DNS in rg-ailz-lab using original main.bicep

## Cost Impact

**No additional cost** - same resources, different organization.

## Next Steps

After migration is complete and verified:
1. Update `main.bicep` to remove VPN/DNS modules (optional)
2. Document the hub-spoke architecture
3. Consider adding additional spokes for other workloads
