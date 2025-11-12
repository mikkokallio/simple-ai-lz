# Deployment Guide - AI Chat Application

This guide covers deploying the AI Chat Application to Azure Container Apps.

## Prerequisites

1. **Azure Resources Required**:
   - Azure Container Registry (ACR)
   - Azure Storage Account
   - Azure OpenAI Service (with gpt-4o deployment)
   - Azure Container Apps Environment

2. **Local Tools**:
   - Azure CLI installed and authenticated
   - Docker installed
   - Git (optional, for source control)

3. **Permissions**:
   - Contributor role on the resource group
   - Ability to create role assignments

## Step 1: Prepare Azure Resources

### 1.1 Set Variables

```bash
# Set these to your values
export SUBSCRIPTION_ID="your-subscription-id"
export RESOURCE_GROUP="rg-ai-chat"
export LOCATION="swedencentral"
export ACR_NAME="acraichat"  # Must be globally unique
export STORAGE_ACCOUNT="staichat"  # Must be globally unique
export OPENAI_NAME="oai-ai-chat"
export CONTAINER_ENV="cae-ai-chat"
export DEPLOYMENT_NAME="gpt-4o"

# Set active subscription
az account set --subscription $SUBSCRIPTION_ID
```

### 1.2 Create Resource Group (if needed)

```bash
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION
```

### 1.3 Create Container Registry (if needed)

```bash
az acr create \
  --name $ACR_NAME \
  --resource-group $RESOURCE_GROUP \
  --sku Standard \
  --admin-enabled false
```

### 1.4 Create Storage Account (if needed)

```bash
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS
```

### 1.5 Create OpenAI Resource (if needed)

```bash
# Create Cognitive Services account
az cognitiveservices account create \
  --name $OPENAI_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --kind OpenAI \
  --sku S0

# Deploy gpt-4o model
az cognitiveservices account deployment create \
  --name $OPENAI_NAME \
  --resource-group $RESOURCE_GROUP \
  --deployment-name $DEPLOYMENT_NAME \
  --model-name gpt-4o \
  --model-version "2024-08-06" \
  --model-format OpenAI \
  --sku-capacity 10 \
  --sku-name Standard
```

### 1.6 Create Container Apps Environment (if needed)

```bash
az containerapp env create \
  --name $CONTAINER_ENV \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION
```

## Step 2: Build and Push Docker Images

### 2.1 Login to ACR

```bash
az acr login --name $ACR_NAME
```

### 2.2 Build and Push Backend

```bash
cd backend

docker build -t $ACR_NAME.azurecr.io/ai-chat-backend:v1 .
docker push $ACR_NAME.azurecr.io/ai-chat-backend:v1

# Tag as latest
docker tag $ACR_NAME.azurecr.io/ai-chat-backend:v1 $ACR_NAME.azurecr.io/ai-chat-backend:latest
docker push $ACR_NAME.azurecr.io/ai-chat-backend:latest

cd ..
```

### 2.3 Build and Push Frontend

```bash
cd frontend

docker build -t $ACR_NAME.azurecr.io/ai-chat-frontend:v1 .
docker push $ACR_NAME.azurecr.io/ai-chat-frontend:v1

# Tag as latest
docker tag $ACR_NAME.azurecr.io/ai-chat-frontend:v1 $ACR_NAME.azurecr.io/ai-chat-frontend:latest
docker push $ACR_NAME.azurecr.io/ai-chat-frontend:latest

cd ..
```

## Step 3: Deploy Backend Container App

### 3.1 Create Backend App with Managed Identity

```bash
az containerapp create \
  --name ai-chat-backend \
  --resource-group $RESOURCE_GROUP \
  --environment $CONTAINER_ENV \
  --image $ACR_NAME.azurecr.io/ai-chat-backend:latest \
  --target-port 5000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 3 \
  --cpu 1.0 \
  --memory 2.0Gi \
  --registry-server $ACR_NAME.azurecr.io \
  --system-assigned \
  --env-vars \
    PORT=5000 \
    NODE_ENV=production \
    AZURE_STORAGE_ACCOUNT_NAME=$STORAGE_ACCOUNT \
    AZURE_STORAGE_CONTAINER_NAME=chat-data \
    AZURE_OPENAI_ENDPOINT=https://$OPENAI_NAME.openai.azure.com \
    AZURE_OPENAI_DEPLOYMENT_NAME=$DEPLOYMENT_NAME \
    SESSION_SECRET=$(openssl rand -base64 32)
```

### 3.2 Grant Backend Permissions

```bash
# Get backend's managed identity principal ID
BACKEND_PRINCIPAL_ID=$(az containerapp show \
  --name ai-chat-backend \
  --resource-group $RESOURCE_GROUP \
  --query identity.principalId -o tsv)

echo "Backend Principal ID: $BACKEND_PRINCIPAL_ID"

# Get Storage Account resource ID
STORAGE_ID=$(az storage account show \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query id -o tsv)

# Grant Storage Blob Data Contributor role
az role assignment create \
  --assignee $BACKEND_PRINCIPAL_ID \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_ID

# Get OpenAI resource ID
OPENAI_ID=$(az cognitiveservices account show \
  --name $OPENAI_NAME \
  --resource-group $RESOURCE_GROUP \
  --query id -o tsv)

# Grant Cognitive Services OpenAI User role
az role assignment create \
  --assignee $BACKEND_PRINCIPAL_ID \
  --role "Cognitive Services OpenAI User" \
  --scope $OPENAI_ID

echo "✅ Permissions granted. Wait 1-2 minutes for role assignments to propagate."
```

### 3.3 Enable ACR Pull Access

```bash
# Get ACR resource ID
ACR_ID=$(az acr show \
  --name $ACR_NAME \
  --resource-group $RESOURCE_GROUP \
  --query id -o tsv)

# Grant AcrPull role
az role assignment create \
  --assignee $BACKEND_PRINCIPAL_ID \
  --role "AcrPull" \
  --scope $ACR_ID
```

## Step 4: Deploy Frontend Container App

### 4.1 Get Backend URL

```bash
BACKEND_URL=$(az containerapp show \
  --name ai-chat-backend \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn -o tsv)

echo "Backend URL: https://$BACKEND_URL"
```

### 4.2 Create Frontend App

```bash
az containerapp create \
  --name ai-chat-frontend \
  --resource-group $RESOURCE_GROUP \
  --environment $CONTAINER_ENV \
  --image $ACR_NAME.azurecr.io/ai-chat-frontend:latest \
  --target-port 80 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 5 \
  --cpu 0.5 \
  --memory 1.0Gi \
  --registry-server $ACR_NAME.azurecr.io \
  --system-assigned
```

### 4.3 Update Frontend nginx to Use Backend URL

You'll need to update `frontend/nginx.conf` to proxy to the actual backend URL:

```nginx
location /api {
    proxy_pass https://<backend-fqdn>;
    # ... rest of config
}
```

Then rebuild and redeploy the frontend.

## Step 5: Verify Deployment

### 5.1 Get Frontend URL

```bash
FRONTEND_URL=$(az containerapp show \
  --name ai-chat-frontend \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn -o tsv)

echo "🚀 Application URL: https://$FRONTEND_URL"
```

### 5.2 Check Backend Health

```bash
curl https://$BACKEND_URL/api/health
# Should return: {"status":"ok","timestamp":"..."}
```

### 5.3 View Logs

```bash
# Backend logs
az containerapp logs show \
  --name ai-chat-backend \
  --resource-group $RESOURCE_GROUP \
  --follow

# Frontend logs
az containerapp logs show \
  --name ai-chat-frontend \
  --resource-group $RESOURCE_GROUP \
  --follow
```

## Step 6: Configure Custom Domain (Optional)

### 6.1 Add Custom Domain to Frontend

```bash
# Add certificate
az containerapp hostname add \
  --name ai-chat-frontend \
  --resource-group $RESOURCE_GROUP \
  --hostname chat.yourdomain.com

# Bind certificate
az containerapp hostname bind \
  --name ai-chat-frontend \
  --resource-group $RESOURCE_GROUP \
  --hostname chat.yourdomain.com \
  --validation-method CNAME
```

## Updating the Application

### Option 1: Using Docker Tags

```bash
# Build and push new version
cd backend
docker build -t $ACR_NAME.azurecr.io/ai-chat-backend:v2 .
docker push $ACR_NAME.azurecr.io/ai-chat-backend:v2

# Update container app
az containerapp update \
  --name ai-chat-backend \
  --resource-group $RESOURCE_GROUP \
  --image $ACR_NAME.azurecr.io/ai-chat-backend:v2
```

### Option 2: Using Latest Tag

```bash
# Build and push
cd backend
docker build -t $ACR_NAME.azurecr.io/ai-chat-backend:latest .
docker push $ACR_NAME.azurecr.io/ai-chat-backend:latest

# Force revision update
az containerapp update \
  --name ai-chat-backend \
  --resource-group $RESOURCE_GROUP \
  --image $ACR_NAME.azurecr.io/ai-chat-backend:latest
```

## Monitoring and Troubleshooting

### View Application Insights (if configured)

```bash
# Enable Application Insights
az containerapp update \
  --name ai-chat-backend \
  --resource-group $RESOURCE_GROUP \
  --enable-dapr false \
  --enable-ingress true
```

### Common Issues

**Issue: Backend can't connect to Storage**
- Check role assignments: `az role assignment list --assignee $BACKEND_PRINCIPAL_ID`
- Verify storage account name in environment variables
- Check managed identity is enabled

**Issue: Backend can't connect to OpenAI**
- Verify OpenAI endpoint URL format
- Check deployment name matches
- Ensure Cognitive Services role is assigned
- Wait 2-3 minutes after role assignment

**Issue: Frontend can't reach Backend**
- Check nginx.conf proxy configuration
- Verify backend ingress is enabled
- Check CORS settings in backend

**Issue: Images fail to pull**
- Ensure ACR login credentials are correct
- Check AcrPull role assignment
- Verify image tags exist: `az acr repository show-tags --name $ACR_NAME --repository ai-chat-backend`

## Cleanup

To delete all resources:

```bash
# Delete Container Apps
az containerapp delete --name ai-chat-backend --resource-group $RESOURCE_GROUP --yes
az containerapp delete --name ai-chat-frontend --resource-group $RESOURCE_GROUP --yes

# Delete entire resource group (if you want to remove everything)
az group delete --name $RESOURCE_GROUP --yes
```

## Cost Optimization

1. **Scale to Zero**: Configure min replicas to 0 for dev environments
   ```bash
   az containerapp update \
     --name ai-chat-backend \
     --resource-group $RESOURCE_GROUP \
     --min-replicas 0
   ```

2. **Use Consumption Plan**: Container Apps automatically scale based on load

3. **Monitor Costs**: Set up Azure Cost Management alerts

4. **Storage Lifecycle**: Configure blob lifecycle management to archive old data

## Security Best Practices

1. ✅ Use Managed Identity (no keys in code)
2. ✅ Enable HTTPS only
3. ✅ Configure appropriate CORS origins
4. ✅ Use network policies in Container Apps Environment
5. ✅ Regularly update base images
6. ✅ Use Azure Key Vault for secrets (future enhancement)
7. ✅ Enable diagnostic logs
8. ✅ Set up Azure Monitor alerts

## Next Steps

- Set up CI/CD pipeline (GitHub Actions or Azure DevOps)
- Configure custom domain
- Add authentication (Azure AD B2C)
- Set up monitoring and alerting
- Configure auto-scaling rules
- Implement rate limiting
