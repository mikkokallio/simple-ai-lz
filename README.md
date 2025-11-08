# Azure AI Landing Zone - MVP

A secure, production-like Azure infrastructure for AI-powered applications with VNet isolation, managed identities, and comprehensive security controls.

## Overview

This MVP deployment includes:

- ✅ **Virtual Network** with isolated subnets
- ✅ **Container Apps Environment** (shared, consumption-based)
- ✅ **Azure Storage** with Defender for malware scanning
- ✅ **Azure Key Vault** with RBAC
- ✅ **Log Analytics & Application Insights** for monitoring
- ✅ **Private Endpoints** for all PaaS services
- ✅ **Network Security Groups** with appropriate rules

## Prerequisites

1. **Azure Subscription** with appropriate permissions (Contributor or Owner)
2. **Azure CLI** installed ([Install Guide](https://docs.microsoft.com/cli/azure/install-azure-cli))
3. **PowerShell** 5.1 or later (Windows) or PowerShell Core (cross-platform)

## Quick Start

### 1. Clone or Download

Download this repository to your local machine.

### 2. Update Parameters

Edit `main.bicepparam` and update the required parameters:

```bicep
param ownerEmail = 'your.email@example.com'  // Required
param location = 'swedencentral'             // Optional (default: swedencentral)
```

**Note**: `swedencentral` is recommended as it has modern datacenter infrastructure with full AI service capacity. Avoid `westeurope` and `northeurope` due to capacity constraints.

### 3. Login to Azure

```bash
az login
az account set --subscription "Your Subscription Name"  # If you have multiple subscriptions
```

### 4. Deploy

**Option A: Use the deployment script (easiest)**

Windows (Command Prompt):
```cmd
deploy.bat
```

Bash (Linux/Mac/Git Bash):
```bash
chmod +x deploy.sh
./deploy.sh
```

**Option B: Deploy with parameters file directly**

```bash
az deployment sub create \
  --name ailz-mvp-deployment \
  --location swedencentral \
  --template-file main.bicep \
  --parameters main.bicepparam
```

**Option C: Override parameters at deployment time**

```bash
az deployment sub create \
  --name ailz-mvp-deployment \
  --location swedencentral \
  --template-file main.bicep \
  --parameters main.bicepparam \
  --parameters ownerEmail='your.email@example.com' location='swedencentral'
```

Deployment takes approximately 15-20 minutes.

### 5. Run Post-Deployment Configuration

**IMPORTANT**: After the main deployment completes, run the post-deployment script to configure VNet DNS:

Windows (PowerShell):
```powershell
.\post-deploy.ps1
```

Linux/Mac (Bash):
```bash
chmod +x post-deploy.sh
./post-deploy.sh
```

This script:
- Configures VNet DNS servers to use the DNS Resolver
- Regenerates VPN client configuration with DNS settings
- Enables automatic DNS resolution for VPN clients

**Why is this needed?** The VNet needs to exist before the DNS Resolver can be created, but the DNS Resolver's IP is needed to configure the VNet's DNS settings. This circular dependency is resolved by updating the configuration after deployment.

### 6. Verify Deployment

```bash
# View deployment outputs
az deployment sub show \
  --name ailz-mvp-deployment \
  --query properties.outputs

# List resources in the resource group
az resource list --resource-group rg-ailz-lab --output table
```

## What Gets Deployed

### Resource Group

- Name: `rg-ailz-lab`
- Contains all infrastructure resources

### Network Resources

- **Virtual Network**: `vnet-ailz-lab` (10.0.0.0/16)
  - Container Apps subnet (10.0.0.0/23)
  - Private Endpoints subnet (10.0.2.0/24)
- **Network Security Groups**: Configured for secure traffic flow

### Compute

- **Container Apps Environment**: `cae-ailz-<suffix>`
  - Consumption-based (pay-per-use)
  - VNet integrated
  - Ready for container app deployments

### Storage

- **Storage Account**: `stailz<suffix>`
  - Standard LRS (cost-optimized)
  - Private endpoint enabled
  - Microsoft Defender for Storage (malware scanning)
  - Pre-created containers: `uploads`, `processed`

### Security

- **Key Vault**: `kv-ailz-<suffix>`
  - RBAC enabled
  - Private endpoint enabled
  - Soft delete + purge protection

### Monitoring

- **Log Analytics Workspace**: `log-ailz-<suffix>`
  - 30-day retention
  - 1GB daily cap (cost control)
- **Application Insights**: `appi-ailz-<suffix>`
  - Connected to Log Analytics

## Testing the Deployment

### 1. Verify Resources in Portal

Navigate to the [Azure Portal](https://portal.azure.com) and open the `rg-ailz-lab` resource group. You should see all deployed resources.

### 2. Deploy a Test Container App

Deploy the included "Hello World" example:

```powershell
# Get the deployment outputs
$outputs = Get-Content deployment-outputs.json | ConvertFrom-Json

# Deploy the test app
az deployment group create `
  --resource-group rg-ailz-lab `
  --template-file examples\hello-world-app.bicep `
  --parameters containerAppsEnvironmentId=$outputs.containerAppsEnvironmentId.value `
               appInsightsConnectionString=$outputs.applicationInsightsConnectionString.value
```

Wait for deployment to complete (~2-3 minutes), then retrieve the app URL:

```powershell
$appOutputs = az deployment group show `
  --resource-group rg-ailz-lab `
  --name hello-world-app `
  --query properties.outputs `
  --output json | ConvertFrom-Json

Write-Host "Test app URL: $($appOutputs.appUrl.value)"
```

Open the URL in your browser. You should see the "Azure Container Apps" welcome page.

### 3. Test Storage Access

```powershell
# Get storage account name
$storageAccount = $outputs.storageAccountName.value

# Try to access directly (should fail - private endpoint only)
az storage blob list --account-name $storageAccount --container-name uploads

# This will fail with an authorization error, which is expected
# Storage can only be accessed from within the VNet via private endpoint
```

### 4. Test Key Vault Access

```powershell
# Get Key Vault name
$keyVault = $outputs.keyVaultName.value

# Try to access (you need appropriate RBAC role)
az keyvault secret list --vault-name $keyVault
```

If you get a permissions error, you need to assign yourself a role:

```powershell
# Get your user object ID
$userId = az ad signed-in-user show --query id -o tsv

# Assign Key Vault Secrets Officer role (for testing)
az role assignment create `
  --role "Key Vault Secrets Officer" `
  --assignee $userId `
  --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/rg-ailz-lab/providers/Microsoft.KeyVault/vaults/$keyVault"

# Wait a few seconds for propagation, then try again
az keyvault secret list --vault-name $keyVault
```

## Cost Estimation

Monthly costs for MVP (approximate, USD):

| Resource | Cost |
|----------|------|
| Container Apps Environment | $0 (consumption) |
| Hello World App (minimal usage) | ~$5-10 |
| Storage Account (Standard LRS) | ~$5 |
| Defender for Storage | ~$10 |
| Key Vault | ~$1 |
| Log Analytics (1GB/day) | ~$10-15 |
| Application Insights | $0-5 (first 5GB free) |
| Private Endpoints (3 × $7.30) | ~$22 |
| **Total** | **~$55-70/month** |

### Cost Optimization Tips

- Delete the deployment when not in use
- Reduce Log Analytics daily cap if needed
- Disable Defender for Storage if malware scanning not required for testing

## Deployment Outputs

After deployment, outputs are saved to `deployment-outputs.json`:

```json
{
  "resourceGroupName": "rg-ailz-lab",
  "location": "eastus",
  "containerAppsEnvironmentId": "<resource-id>",
  "containerAppsDefaultDomain": "<domain>",
  "storageAccountName": "<name>",
  "keyVaultName": "<name>",
  "keyVaultUri": "https://<name>.vault.azure.net/",
  "applicationInsightsConnectionString": "<connection-string>"
}
```

Use these values when deploying applications.

## Next Steps

### Deploy Real Applications

1. **Document Translation App**: See `req_spec.txt` section 11.1 for architecture
2. **Agentic AI App**: See `req_spec.txt` section 11.2 for architecture

### Add Optional Components

The MVP doesn't include:
- Azure AI Foundry (add when you need AI models)
- Azure Cosmos DB (add for high-performance data needs)
- API Management (add for API gateway needs)
- Application Gateway + WAF (add for public-facing production apps)

### Configure Authentication

See `app_authentication_guide.md` for:
- Creating App Registrations in Entra ID
- Configuring Easy Auth on Container Apps
- Setting up JWT validation in APIM

## Future Considerations / TODOs

### Infrastructure Testing Required
**Status**: Bicep files updated but NOT deployed/tested

**Changes Made (November 8, 2025)**:
1. Added `dnsServers` parameter to `modules/network.bicep`
2. Added `dhcpOptions` configuration to VNet resource for custom DNS
3. Created post-deployment scripts (`post-deploy.ps1` / `post-deploy.sh`)
4. Updated README with post-deployment step

**What Was Fixed**:
- VNet DNS servers now configured to use DNS Resolver (10.0.4.4)
- VPN clients automatically receive DNS settings when connecting
- Private DNS zone A record corrected (10.0.0.225)
- No more manual DNS configuration needed on client machines

**Testing Required**:
- [ ] Deploy updated Bicep to test environment
- [ ] Verify VNet DNS configuration applies correctly
- [ ] Test VPN client receives DNS automatically (no manual config)
- [ ] Confirm browser access to internal Container Apps works immediately after VPN connection
- [ ] Validate post-deployment script runs successfully
- [ ] Test with fresh VPN client (no previous manual DNS config)

**Files Changed**:
- `modules/network.bicep` - Added dnsServers parameter and dhcpOptions
- `main.bicep` - Added TODO comment about circular dependency
- `post-deploy.ps1` / `post-deploy.sh` - New post-deployment scripts
- `README.md` - Added post-deployment step to instructions

**Documentation**: See `LESSONS_LEARNED.md` Section 12 for detailed analysis

---

### DNS Resolution Review
**Status**: DNS Resolver deployed and functional, but VPN clients may not automatically receive DNS settings.

**Current Workarounds**:
- Manual DNS configuration on VPN interface (requires admin)
- Hosts file entries (requires admin)
- `curl --resolve` for testing (no admin required)

**Decision Needed**:
- [ ] Investigate why Azure VPN Client doesn't auto-push DNS from VPN Gateway
- [ ] Evaluate if DNS Resolver is necessary for solo developer labs (~$40-60/month cost)
- [ ] Consider Site-to-Site VPN or ExpressRoute if DNS auto-configuration is critical
- [ ] For team environments: Keep DNS Resolver, fix VPN client configuration

**Documentation**: See `LESSONS_LEARNED.md` Section 12 for detailed analysis

## Troubleshooting

### Deployment Fails

View detailed error information:

```bash
# Check deployment status
az deployment sub show --name ailz-mvp-deployment

# List all deployment operations to find the failed resource
az deployment sub operation list \
  --name ailz-mvp-deployment \
  --query "[?properties.provisioningState=='Failed']"
```

Common issues:
- **Subnet delegation error**: The Container Apps subnet must be delegated to `Microsoft.App/environments` (fixed in latest version)
- **Quota exceeded**: Check your subscription quotas for Container Apps and other services
- **Resource name conflicts**: If redeploying, ensure previous resources are fully deleted

### Private Endpoint Issues

Private endpoints can take 2-3 minutes to fully provision. If you get DNS resolution errors, wait a few minutes and try again.

### Permission Errors

Ensure you have:
- `Contributor` or `Owner` role on the subscription
- `Key Vault Administrator` role to access Key Vault (or assign it post-deployment)
- `Storage Blob Data Contributor` role to access Storage (use Managed Identity from apps)

## Cleanup

To delete all resources:

```powershell
az group delete --name rg-ailz-lab --yes --no-wait
```

**Warning**: This will delete all resources and data. Cannot be undone.

## Support

For issues or questions:
1. Check `req_spec.txt` for detailed architecture information
2. Review Azure documentation links in the spec
3. Check Azure Portal > Resource Group > Deployments for error details

## License

MIT License - See LICENSE file for details

## References

- [Azure Container Apps Documentation](https://learn.microsoft.com/azure/container-apps/)
- [Azure Private Link Documentation](https://learn.microsoft.com/azure/private-link/)
- [Azure Bicep Documentation](https://learn.microsoft.com/azure/azure-resource-manager/bicep/)
- [Microsoft Defender for Storage](https://learn.microsoft.com/azure/defender-for-cloud/defender-for-storage-introduction)
