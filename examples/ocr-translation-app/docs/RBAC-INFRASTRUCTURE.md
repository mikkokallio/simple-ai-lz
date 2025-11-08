# RBAC Permissions - Infrastructure as Code

## Issue
Role assignments were being created manually via Azure CLI commands, which meant:
- Deployments from the repo would fail with permission errors
- Configuration was not reproducible
- No documentation of required permissions

## Solution
All RBAC assignments are now **declared in Bicep** (`infrastructure/app.bicep`):

### Role Assignments

| Principal | Target | Role | Purpose |
|-----------|--------|------|---------|
| Backend Managed Identity | Document Intelligence | Cognitive Services User | OCR processing |
| Backend Managed Identity | Translator | Cognitive Services User | Document translation |
| Backend Managed Identity | Storage Account | Storage Blob Data Contributor | Upload/download files |
| Backend Managed Identity | AI Foundry (optional) | Cognitive Services User | Content understanding |

### Implementation Details

**1. Parameters Added:**
```bicep
@description('Storage account name for blob uploads')
param storageAccountName string = ''

@description('Storage account resource ID for RBAC')
param storageAccountResourceId string = ''
```

**2. Environment Variable Added:**
```bicep
{
  name: 'STORAGE_ACCOUNT_NAME'
  value: storageAccountName
}
```

**3. Role Definitions:**
```bicep
// Cognitive Services User role for AI services access
var cognitiveServicesUserRoleId = 'a97b65f3-24c7-4388-baec-2e87135dc908'

// Storage Blob Data Contributor role for blob uploads
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
```

**4. RBAC Resources:**
```bicep
// Reference existing resources for proper scoping
resource storageAccountService 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: last(split(storageAccountResourceId, '/'))
  scope: resourceGroup(split(storageAccountResourceId, '/')[2], split(storageAccountResourceId, '/')[4])
}

// Assign role to backend managed identity
resource backendToStorageRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(backendApp.id, storageAccountResourceId, storageBlobDataContributorRoleId)
  scope: storageAccountService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}
```

## Deployment

### Option A: Automated Script (Recommended)
```powershell
cd examples/ocr-translation-app/infrastructure/
./deploy-app.ps1 -ResourceGroup rg-ailz-lab -UniqueSuffix <your-suffix>
```

The script:
- Auto-discovers all resource IDs
- Passes correct parameters to Bicep
- RBAC assignments are created by Bicep during deployment

### Option B: Manual Deployment
```powershell
# 1. Create parameters file from example
cp app.parameters.example.json app.parameters.json

# 2. Edit with your resource IDs
code app.parameters.json

# 3. Deploy
az deployment group create \
  --resource-group rg-ailz-lab \
  --template-file app.bicep \
  --parameters @app.parameters.json
```

## Benefits

✅ **Reproducible** - Deploy from repo gets all permissions
✅ **Documented** - All roles visible in Bicep code
✅ **Idempotent** - Safe to re-run deployment
✅ **Auditable** - Changes tracked in Git
✅ **Principle of Least Privilege** - Explicit, minimal permissions

## Rule Going Forward

**EVERYTHING IN CODE** - All Azure resources, configurations, and RBAC assignments must be defined in Bicep templates. No manual Azure CLI commands for infrastructure changes unless for one-time debugging.
