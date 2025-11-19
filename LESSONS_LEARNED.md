# Lessons Learned - Azure AI Landing Zone Implementation

## Last Updated: November 17, 2025

This document captures critical lessons learned during the implementation of a secure AI landing zone with VNet isolation, Point-to-Site VPN, and internal Container Apps.

---

## 1. AI Foundry Deployment Requirements (November 17, 2025) 🆕

### Issue
AI Foundry deployment failed repeatedly with various errors during demo environment setup:
- `InvalidApiSetId: The account type 'AIFoundry' is either invalid or unavailable`
- `Project can only created under AIServices Kind account with allowProjectManagement set to true`
- `Unsupported configuration. To create accounts or projects, you must enable a managed identity`

### Root Cause
AI Foundry has specific, undocumented requirements that differ from the Azure Portal deployment:

1. **Wrong `kind`**: Used `kind: 'AIFoundry'` but correct value is `kind: 'AIServices'`
2. **Outdated API version**: Used `@2024-10-01` but project resource requires `@2025-06-01`
3. **Missing property**: Account requires `allowProjectManagement: true` to support projects
4. **Missing identity**: Both account AND project require SystemAssigned managed identity

### Solution - Correct Bicep Configuration
```bicep
// AI Foundry Account
resource aiFoundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: aiFoundryName
  kind: 'AIServices'  // NOT 'AIFoundry'!
  identity: {
    type: 'SystemAssigned'  // Required
  }
  properties: {
    allowProjectManagement: true  // Required for projects
    publicNetworkAccess: 'Disabled'
    disableLocalAuth: true
  }
}

// AI Foundry Project
resource aiFoundryProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: aiFoundry
  name: projectName
  identity: {
    type: 'SystemAssigned'  // Also required on project!
  }
  properties: {
    description: 'AI Foundry project'
  }
}
```

### How We Found the Solution
1. **Exported working resource from Portal**: `az resource show --ids <resource-id> -o json`
2. **Compared Portal deployment vs Bicep**: Found `kind: 'AIServices'` and `allowProjectManagement: true`
3. **Checked API version errors**: Error messages revealed supported versions
4. **Iterative deployment with versioned resource groups**: `rg-ailz-demo-v2`, `v3`, `v4`... `v8` (finally succeeded!)

### Deployment Strategy: Versioned Resource Groups
**Pro tip from this experience:**
- Increment version on each attempt: `rg-ailz-demo-v2`, `v3`, `v4`...
- Allows comparison of partially deployed resources
- No need to wait for deletions
- Clean up old versions in batch: `az group delete --name rg-ailz-demo-v2 --yes --no-wait`

### Impact
- 8 deployment iterations to get AI Foundry working
- Errors were cryptic and didn't point to root cause
- Azure Portal successfully creates resources that Bicep templates cannot (different validation)
- Exporting ARM/JSON from Portal and comparing revealed missing properties

### Recommendations
1. **Export working Portal deployments** to discover undocumented requirements
2. **Use latest API versions** for new Azure services (2025-xx-xx vs 2024-xx-xx)
3. **Enable managed identity** on both parent and child resources
4. **Version your resource groups** during iterative troubleshooting (`-v1`, `-v2`, `-v3`...)
5. **Don't trust documentation** for preview services - validate with Portal deployments

---

## 2. Cosmos DB Free Tier Limitations (November 17, 2025) 🆕

### Issue
Cosmos DB deployment failed with:
```
Free tier is not supported for Internal subscriptions.
```

### Root Cause
Microsoft internal subscriptions (employee subscriptions) do not support Cosmos DB free tier, even though it's available for customer subscriptions.

### Solution
Make free tier optional in Bicep:
```bicep
@description('Enable Cosmos DB free tier (not available for Microsoft internal subscriptions)')
param enableFreeTier bool = true

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  properties: {
    enableFreeTier: enableFreeTier  // Parameterized
    databaseAccountOfferType: 'Standard'
    // ... other properties
  }
}
```

In parameters file for internal subscription:
```bicep
param enableCosmosFreeTier = false
```

### Impact
- First deployment failed due to hardcoded `enableFreeTier: true`
- Cost: Free tier saves ~$24/month (first 1000 RU/s and 25 GB free)
- With free tier disabled: Pay-as-you-go serverless pricing applies

### Recommendations
1. **Parameterize subscription-specific features** like free tiers
2. **Test deployments in both customer and internal subscriptions** if applicable
3. **Document subscription requirements** in README
4. **Consider costs** when free tier unavailable (~$0.08/RU/s/hour serverless)

---

## 3. Hub-Spoke Architecture and Multi-Environment Deployments 🆕

### Pattern Established
Separated connectivity (Hub) from application platform (Landing Zone):

```
Hub (rg-connectivity-hub)           Demo LZ (rg-ailz-demo-v8)
├── VPN Gateway (shared)            ├── VNet: 10.2.0.0/16
├── DNS Resolver (shared)           ├── Container Apps Environment
└── Hub VNet: 10.1.0.0/16          ├── Cosmos DB (serverless, no free tier)
         │                          ├── Storage Account
         │                          ├── Key Vault
         └──── VNet Peering ───────>└── AI Services
                                    
Lab LZ (rg-ailz-lab) - UNTOUCHED
├── VNet: 10.0.0.0/16
├── Container Apps Environment
├── Cosmos DB (serverless, free tier)
└── All apps deployed
```

### Key Design Decisions
1. **Parameterized resource group names**: Changed from hardcoded `rg-ailz-lab` to parameter
   ```bicep
   @description('Resource group name for landing zone resources')
   param resourceGroupName string = 'rg-ailz-lab'
   ```

2. **Non-overlapping IP spaces**: Lab uses 10.0.0.0/16, Demo uses 10.2.0.0/16

3. **Unique suffixes**: Lab uses `ezle7syi`, Demo uses `demo08` to avoid naming conflicts

4. **Shared Hub infrastructure**: One VPN Gateway and DNS Resolver serve all landing zones via peering

### Private DNS Zone Architecture
Each landing zone's Bicep modules create private DNS zones (not centralized):
- `modules/cosmosdb.bicep` creates `privatelink.documents.azure.com`
- `modules/storage.bicep` creates `privatelink.blob.core.windows.net`
- `modules/keyvault.bicep` creates `privatelink.vaultcore.azure.net`
- `modules/cognitiveServicesPrivateDns.bicep` creates AI service zones
- Each zone auto-links to the landing zone's VNet

**Why this works:**
- Container Apps resolve private endpoints within same VNet ✅
- VPN clients query Hub DNS Resolver → forwards to landing zone private DNS zones ✅
- No manual DNS zone management needed
- Each environment isolated yet accessible via Hub

### Multi-Environment Strategy
- **Lab environment**: Production workloads, stable
- **Demo environment**: Testing infrastructure changes, ephemeral
- **Incremental versioning**: `rg-ailz-demo-v2`, `v3`... delete old versions when done
- **Zero impact migrations**: Deploy new, test, migrate apps, delete old

---

## 4. Container Apps Internal Ingress - Critical Gotcha! ⚠️

### Issue
**Container Apps in an internal environment have confusing `external` property behavior:**

When the Container Apps Environment is internal (`vnetConfiguration.internal: true`), the app's `external` property controls VNet vs environment-only access, NOT public vs private access:

1. **`external: true`** → "Accepting traffic from anywhere (VNet)"
   - Accessible from the entire VNet (including VPN clients)
   - **NOT publicly accessible** - the environment's internal setting prevents that
   - Use for frontend apps, APIs accessed via VPN

2. **`external: false`** → "Limited to Container Apps Environment"
   - Only accessible from other Container Apps in the SAME environment
   - **NOT accessible from VNet/VPN** - will return 404 error
   - Use ONLY for backend services called by other apps in the environment

### Root Cause
The naming is counter-intuitive: `external: true` sounds like it makes the app public, but in an internal environment, it only means "accessible from the VNet" (not the internet). The environment's `internal: true` setting is what prevents public access.

### Solution (Correctly Configured in Bicep)
For apps that need to be accessible from VNet (via VPN):
```bicep
resource app 'Microsoft.App/containerApps@2023-05-01' = {
  properties: {
    configuration: {
      ingress: {
        external: true  // VNet-accessible (NOT public!) when environment is internal
        targetPort: 80
      }
    }
  }
}
```

For backend services that should only be called by other apps in the same environment:
```bicep
resource backendApp 'Microsoft.App/containerApps@2023-05-01' = {
  properties: {
    configuration: {
      ingress: {
        external: false  // Environment-only access
        targetPort: 80
      }
    }
  }
}
```
### Verification Test
```
1. Connect to VPN → App accessible ✅ (proves VNet access works)
2. Disconnect VPN → App NOT accessible ✅ (proves app is NOT public)
3. Reconnect VPN → App accessible again ✅ (confirms VNet-only access)
```

### Impact
- Initial deployment with `external: false` returned 404 errors from VPN
- Spent ~2 hours troubleshooting before discovering the solution
- All network/DNS/routing was correct - only the ingress setting needed adjustment
- Error message ("Container App stopped or does not exist") was misleading

### Recommendations
1. **Use `external: true`** for VNet-accessible apps in internal environments
2. **Use `external: false`** only for backend services accessible from same environment
3. **Test immediately** after deployment with VPN on/off to verify correct behavior
4. **Remember**: In internal environments, `external: true` ≠ publicly accessible!

---

## 2. Azure DNS Private Resolver Required for VPN DNS

### Issue
Point-to-Site VPN clients cannot resolve Private DNS zones by default, even when the VNet has custom DNS servers configured.

### Root Cause
- Azure VPN Gateway for OpenVPN with Azure AD authentication doesn't push DNS settings to VPN clients
- VPN clients use their local DNS servers (e.g., home router DNS)
- Private DNS zones are only resolvable from within Azure by default

### Solution
Deploy **Azure DNS Private Resolver** with an inbound endpoint:
- Cost: ~$40-60/month per resolver
- Provides an IP address (e.g., 10.0.4.4) that resolves Private DNS zones
- Configure VNet custom DNS servers to use this IP
- VPN clients inherit DNS settings from VNet

### Benefits
- Zero maintenance (fully managed PaaS)
- High availability and zone redundancy
- Eliminates need for custom DNS VMs
- DevOps-friendly (deployable via Bicep)

### Implementation Notes
- Requires dedicated subnet (/28 or larger) with delegation to `Microsoft.Network/dnsResolvers`
- Inbound endpoint IP can be static or dynamic
- Private DNS zones must be linked to the VNet
- After deploying resolver, update VNet DNS servers: `az network vnet update --dns-servers 10.0.4.4`

---

## 3. VPN Client Configuration Must Be Regenerated After DNS Changes

### Issue
After adding DNS Private Resolver and configuring VNet DNS servers, VPN clients continued using local DNS.

### Root Cause
The VPN client profile (azurevpnconfig.xml) is generated at the time of download and doesn't automatically update when VNet DNS settings change.

### Solution
1. After any DNS configuration changes, regenerate VPN client profile:
   ```bash
   az network vnet-gateway vpn-client generate \
     --resource-group rg-ailz-lab \
     --name vpngw-ailz-ezle7syi \
     --processor-architecture Amd64
   ```
2. Download and extract the ZIP file
3. In Azure VPN Client, import the new azurevpnconfig.xml
4. Reconnect to VPN

### Impact
VPN appeared connected but DNS resolution failed, causing confusion during troubleshooting.

---

## 4. Container Apps Environment `internal` Property Is Immutable

### Issue
Cannot change Container Apps Environment from `internal: false` to `internal: true` after creation.

### Root Cause
The internal/external configuration is a fundamental architectural property that affects:
- VNet integration
- Load balancer type (internal vs external)
- IP address assignment
- DNS configuration

### Solution
**Must delete and recreate the environment** with correct settings. No in-place update possible.

### Prevention
- **Plan carefully** before deployment - internal vs external is a critical decision
- **Test in separate resource group** first
- **Use Infrastructure as Code** (Bicep) to make recreation easier
- **Document the setting** prominently in deployment parameters

---

## 5. Resource Dependencies Can Block Updates

### Issue
When trying to update Container Apps Environment, encountered:
- Cannot delete environment (has apps deployed)
- Cannot delete apps (environment has issues)
- Cannot remove GatewaySubnet (VPN Gateway is using it)
- Cannot update VPN Gateway (requires subnet changes)

### Solution
**Clean slate approach** - delete entire resource group and redeploy:
```bash
az group delete -n rg-ailz-lab --yes
az deployment sub create --template-file main.bicep --parameters main.bicepparam
```

### Lessons
- **Avoid incremental fixes** for fundamental architectural issues
- **Complete redeployment** is often faster than complex update orchestration
- **Keep Bicep templates updated** so redeployment is reliable
- **Use parameter files** for environment-specific values

---

## 6. Azure VPN Gateway with Azure AD Authentication

### Configuration That Works
```bicep
vpnClientConfiguration: {
  vpnClientAddressPool: {
    addressPrefixes: ['172.16.201.0/24']
  }
  vpnClientProtocols: ['OpenVPN']
  vpnAuthenticationTypes: ['AAD']
  aadTenant: 'https://login.microsoftonline.com/${tenantId}'
  aadAudience: 'c632b3df-fb67-4d84-bdcf-b95ad541b5c8'  // Fixed Microsoft GUID
  aadIssuer: 'https://sts.windows.net/${tenantId}/'    // Trailing slash REQUIRED
}
```

### Key Points
- **aadAudience** is always `c632b3df-fb67-4d84-bdcf-b95ad541b5c8` (Microsoft's VPN Gateway app ID)
- **aadIssuer** MUST have trailing slash
- **tenantId** can be retrieved dynamically: `tenant().tenantId`
- No certificates required with Azure AD auth
- Cost: ~$5-20/month (VpnGw1 SKU) vs ~$140/month for Azure Bastion

---

## 7. Network Routing and Connectivity Testing

### Testing Progression
1. **VPN Connection**: `ipconfig | Select-String "172.16.201"`
2. **DNS Resolution**: `nslookup <internal-fqdn> 10.0.4.4`
3. **Network Connectivity**: `ping <static-ip>` or `Test-NetConnection -Port 80`
4. **Application Access**: `curl http://<ip> -H "Host: <fqdn>"`

### Common Issues
- ❌ DNS resolves but ping fails → Check NSG rules
- ❌ Ping works but curl fails → Check application ingress settings
- ❌ Curl returns 404 → Check ingress type (environment-only vs VNet-accessible)
- ❌ Connection timeout → Check if app is running and healthy

### Tools Used
- `curl.exe` (Windows native curl, not PowerShell alias)
- `nslookup` with specific DNS server
- `Test-NetConnection` for port testing
- `az containerapp logs show` for application troubleshooting

---

## 8. Bicep Module Organization

### Effective Structure
```
modules/
  ├── network.bicep              # VNet, subnets, NSGs
  ├── vpnGateway.bicep           # VPN Gateway with P2S
  ├── dnsResolver.bicep          # DNS Private Resolver
  ├── containerApps.bicep        # Container Apps Environment
  ├── containerAppsPrivateDns.bicep  # Private DNS zone for Container Apps
  ├── keyvault.bicep             # Key Vault with private endpoint
  ├── storage.bicep              # Storage with Defender + private endpoint
  └── monitoring.bicep           # Log Analytics + App Insights
```

### Best Practices
- **One resource type per module** (easier to understand and maintain)
- **Output all critical properties** (IDs, FQDNs, IPs)
- **Use descriptive parameter names** (avoid abbreviations)
- **Include setup instructions** in outputs for complex resources
- **Conditional deployment** for optional resources (VPN Gateway)

---

## 9. Cost Optimization Decisions

| Resource | Monthly Cost | Decision |
|----------|-------------|----------|
| VPN Gateway (VpnGw1) | $5-20 | ✅ Chosen over Bastion |
| Azure Bastion (Basic) | $140 | ❌ Too expensive for single-user lab |
| DNS Private Resolver | $40-60 | ✅ Required for VPN DNS resolution |
| Container Apps (Consumption) | ~$0 (idle) | ✅ Scales to zero when not in use |
| Log Analytics (30-day retention) | ~$10-20 | ✅ Essential for troubleshooting |

**Total estimated cost**: ~$60-100/month for fully configured lab environment

---

## 10. Container Apps with Nginx: Port Binding and Permissions

### Issue
Frontend container running nginx crashed immediately after deployment with error:
```
nginx: [emerg] bind() to 0.0.0.0:80 failed (13: Permission denied)
```

### Root Cause
- Dockerfile used `USER nginx-user` to run nginx as non-root
- Ports below 1024 (like port 80) are privileged ports on Linux
- Non-root users cannot bind to privileged ports
- This caused nginx master process to fail immediately

### Solution
Remove the `USER` directive from Dockerfile and run nginx as root:
```dockerfile
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Why this is safe:**
- Container Apps provides security isolation at the platform level
- Running as root inside the container doesn't expose the host
- Alternative would be to use port 8080+ and update ingress targetPort

### Attempted Alternatives (not used)
1. Custom nginx.conf to listen on port 8080
2. Giving write permissions to /tmp for nginx temp files
3. Both approaches work but add complexity

### Impact
- Multiple Container App revisions remained unhealthy (1u6dhwf, fix1, rootnginx)
- All used the old image with permission error
- Had to rebuild image and create new revision (v3) to resolve

---

## 11. Azure Container Registry: Private Endpoints Block Builds

### Issue
ACR builds (using `az acr build`) failed repeatedly with:
```
failed to login, ran out of retries: denied: client with IP '172.160.222.136' is not allowed access
```

### Root Cause
- ACR had `publicNetworkAccess: 'Disabled'` for security
- ACR uses external build agents (not in your VNet)
- Build agents couldn't authenticate with private-only ACR
- Build IDs dt7, dt8, dt9 all failed within 6 seconds

### Solution
**Temporarily enable public access during builds:**
```bash
# Enable for builds
az acr update -n <acr-name> --public-network-enabled true

# Build images
az acr build --registry <acr-name> --image <image:tag> <path>

# Optional: Disable again for security (can impact future builds)
az acr update -n <acr-name> --public-network-enabled false
```

### Alternative Solutions
1. Use Azure DevOps/GitHub Actions agents in your VNet
2. Use ACR Tasks with managed identity
3. Build images locally and push to ACR

### Impact
- Spent ~30 minutes debugging why builds failed
- Multiple Container App updates pulled old images
- Had to enable public access to unblock deployment

### Recommendation
For dev/lab environments: Keep public access enabled during active development
For production: Use CI/CD pipelines with VNet integration

---

## 12. VPN DNS Resolution: Resolver vs Manual Configuration

### Issue Discovered (November 8, 2025)
Even with VPN connected and DNS Resolver deployed:
- Browser couldn't access internal Container Apps
- `nslookup` failed to resolve internal FQDNs
- VPN interface (`vnet-ailz-lab`) had NO DNS servers configured

### Root Cause
Azure VPN Client (Point-to-Site) doesn't automatically push DNS settings from VPN Gateway profile. The DNS Resolver (10.0.4.4) was deployed but not configured on the VPN interface.

### Workaround: Manual DNS Configuration
Two approaches that work:

**Option 1: Configure DNS on VPN interface (requires admin)**
```powershell
Set-DnsClientServerAddress -InterfaceAlias "vnet-ailz-lab" -ServerAddresses "10.0.4.4"
```

**Option 2: Use hosts file (requires admin)**
Add to `C:\Windows\System32\drivers\etc\hosts`:
```
10.0.0.225    aca-ocr-trans-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io
10.0.0.225    aca-ocr-trans-backend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io
```

**Option 3: curl with --resolve flag (no admin required)**
```bash
curl.exe --resolve <fqdn>:443:<static-ip> https://<fqdn>
```

### Does This Make DNS Resolver Unnecessary?

**No, the DNS Resolver is still valuable:**

| Scenario | DNS Resolver | Manual Config | Verdict |
|----------|--------------|---------------|---------|
| **User Experience** | Automatic (when properly configured) | Manual setup required per client | Resolver better for teams |
| **Multiple Resources** | Resolves ALL private DNS zones | Need entry for each resource | Resolver scales better |
| **Maintenance** | Zero maintenance | Update hosts file when resources change | Resolver eliminates toil |
| **Private Endpoints** | Resolves Key Vault, Storage, etc. | Manual entry for each endpoint | Resolver handles all |
| **Multi-user Teams** | One-time infra setup | Each user configures manually | Resolver better for teams |
| **Cost** | ~$40-60/month | $0 | Manual cheaper for solo dev |

### Why DNS Isn't Automatically Pushed

The Azure VPN Gateway configuration should include DNS servers, but:
1. The VPN profile must be regenerated after VNet DNS changes
2. Azure VPN Client may require specific settings enabled
3. Some VPN clients don't honor DNS push from server

### Proper DNS Configuration Flow
1. Deploy DNS Resolver with inbound endpoint (10.0.4.4)
2. Configure VNet DNS servers: `az network vnet update --dns-servers 10.0.4.4`
3. Regenerate VPN client profile with new DNS settings
4. Download and import new profile to Azure VPN Client
5. Verify VPN interface has DNS server configured after connection

### Recommendation
- **Solo developer lab**: Manual configuration (hosts file) is acceptable
- **Team environment**: Fix DNS push configuration, use DNS Resolver properly
- **Production**: DNS Resolver is required for scale and maintainability

### TODO for Future
- [ ] Investigate why Azure VPN Client isn't pushing DNS settings
- [ ] Consider if DNS Resolver can be removed for cost savings (solo dev scenario)
- [ ] Test alternative: Site-to-Site VPN or ExpressRoute (auto-configures DNS)
- [ ] Document proper Azure VPN Client configuration for DNS push

---

## 13. Key Takeaways

### What Worked Well ✅
- **Bicep for Infrastructure as Code** - made redeployment painless
- **Azure DNS Private Resolver** - elegant solution for VPN DNS
- **Point-to-Site VPN with Azure AD** - no certificate management
- **Modular Bicep architecture** - easy to understand and modify
- **Comprehensive documentation** - reduced troubleshooting time

### What Was Challenging ⚠️
- **Container Apps ingress settings** - not well documented
- **VPN DNS configuration** - required profile regeneration
- **Immutable resource properties** - forced complete redeployment
- **Misleading error messages** - "Container App stopped" when it was actually a networking issue

### What to Do Differently Next Time 🔄
1. **Test ingress settings immediately** after Container Apps deployment
2. **Verify all network/DNS/routing** before debugging application issues
3. **Use separate test resource group** for risky architectural changes
4. **Document ALL manual Portal configurations** that can't be done via Bicep
5. **Create troubleshooting runbook** as you go (don't rely on memory)

---

## Quick Reference Commands

### VPN Client Setup
```bash
# Generate VPN client configuration
az network vnet-gateway vpn-client generate \
  --resource-group rg-ailz-lab \
  --name vpngw-ailz-ezle7syi \
  --processor-architecture Amd64
```

### DNS Testing
```bash
# Test DNS resolution via Private Resolver
nslookup <internal-fqdn> 10.0.4.4

# Update VNet DNS servers
az network vnet update \
  --resource-group rg-ailz-lab \
  --name vnet-ailz-lab \
  --dns-servers 10.0.4.4
```

### Container Apps Debugging
```bash
# Check ingress configuration
az containerapp ingress show \
  --resource-group rg-ailz-lab \
  --name <app-name>

# View logs
az containerapp logs show \
  --resource-group rg-ailz-lab \
  --name <app-name> \
  --tail 50 --follow false

# Check revision status
az containerapp revision list \
  --resource-group rg-ailz-lab \
  --name <app-name>
```

---

## Architecture Diagram

```
Internet
   │
   ├─── Azure VPN Gateway (P2S, Azure AD auth)
   │      │ 135.225.93.100 (Public IP)
   │      │ VPN Client Pool: 172.16.201.0/24
   │      └─── Routes to 10.0.0.0/16
   │
   └─── VNet: 10.0.0.0/16 (swedencentral)
          │
          ├─── GatewaySubnet: 10.0.3.0/27
          │     └─── VPN Gateway
          │
          ├─── snet-containerapps: 10.0.0.0/23
          │     └─── Container Apps Environment (internal)
          │           └─── Static IP: 10.0.1.144
          │                 └─── Container Apps (internal ingress)
          │
          ├─── snet-privateendpoints: 10.0.2.0/24
          │     ├─── Key Vault Private Endpoint
          │     └─── Storage Private Endpoint
          │
          └─── snet-dns-inbound: 10.0.4.0/28
                └─── DNS Private Resolver: 10.0.4.4
                      └─── Resolves Private DNS zones:
                            ├─── gentlecoast-*.azurecontainerapps.io
                            ├─── privatelink.vaultcore.azure.net
                            └─── privatelink.blob.core.windows.net
```

---

## Final Status: ✅ RESOLVED

All infrastructure successfully deployed and tested:
- ✅ VPN with Azure AD authentication
- ✅ DNS Private Resolver for internal name resolution
- ✅ Container Apps with corrected ingress settings (external for testing)
- ✅ Private DNS zones linked and functional
- ✅ Network routing and connectivity working

**Next Steps**: Deploy production workloads and configure proper internal ingress with VNet access.
