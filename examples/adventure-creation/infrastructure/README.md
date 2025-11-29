# Adventure Creator Infrastructure

Infrastructure as Code for deploying the Adventure Creator application to Azure Container Apps.

## Prerequisites

- Azure CLI installed and logged in
- Access to Azure subscription with Contributor role
- Existing infrastructure:
  - Container Apps Environment
  - Container Registry (Premium SKU)
  - Cosmos DB account
  - Azure OpenAI service

## Quick Start

```powershell
# 1. Build images
.\build-images.ps1 -RegistryName <your-acr-name>

# 2. Deploy infrastructure  
.\deploy.ps1 -ResourceGroup <your-rg-name>

# 3. Assign OpenAI permissions (replace with your values)
$backendId = az containerapp show --name ca-adventure-backend-<suffix> --resource-group <rg> --query "identity.principalId" -o tsv
az role assignment create --assignee $backendId --role "Cognitive Services OpenAI User" --scope <openai-resource-id>
```

## What Gets Deployed

The Bicep template (`app.bicep`) creates:
- **Backend Container App**: Node.js Express API (port 8080)
- **Frontend Container App**: nginx serving React SPA (port 8080)
- **ACR Role Assignments**: Managed identity permissions to pull images
- **Environment Variables**: Including FRONTEND_URL for CORS

## Manual Steps Required

### 1. Azure OpenAI Access
Backend needs OpenAI permissions (not in Bicep because OpenAI may be in different RG):
```powershell
az role assignment create --assignee <backend-principal-id> --role "Cognitive Services OpenAI User" --scope <openai-scope>
```

### 2. Cosmos DB Access  
Backend needs Cosmos DB permissions:
```powershell
az cosmosdb sql role assignment create --account-name <cosmos> --resource-group <rg> --role-definition-id 00000000-0000-0000-0000-000000000002 --principal-id <backend-principal-id> --scope "/"
```

## Configuration

Update `app.bicepparam` with your values:
- `containerAppsEnvironmentId`: Your Container Apps Environment resource ID
- `containerRegistryName`: Your ACR name
- `cosmosAccountName`: Your Cosmos DB account name
- `azureOpenAIEndpoint`: Your OpenAI endpoint URL
- `azureOpenAIDeploymentGPT4`: Your GPT-4 deployment name
- `azureOpenAIDeploymentDALLE`: Your DALL-E deployment name

## Troubleshooting

### Image Pull Failures
- Check ACR role assignment exists
- Wait 5-10 minutes for RBAC propagation
- Apps auto-retry failed revisions

### CORS Errors
- Verify FRONTEND_URL env var in backend matches frontend FQDN
- Redeploy backend if URL changed

### Port Issues
- Both apps use port 8080
- Ingress targetPort must match nginx config (8080)
