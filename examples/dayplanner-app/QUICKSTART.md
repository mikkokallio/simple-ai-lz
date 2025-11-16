# 🚀 Funday - Quick Start Guide

This guide will get you up and running with Funday in 10 minutes.

## Prerequisites

✅ Azure Subscription with:
- Resource Group: `rg-ailz-lab`
- Container Apps Environment
- Azure Container Registry (ACR)
- Azure OpenAI resource (GPT-4o deployment)
- Application Insights

✅ Local Tools:
- Node.js 20+
- Docker Desktop
- Azure CLI
- PowerShell 7+

## Local Development Setup

### 1. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend  
cd ../frontend
npm install
```

### 2. Configure Environment

```bash
# Copy environment templates
cp backend/.env.example backend/.env

# Edit backend/.env with your values:
# - AZURE_OPENAI_ENDPOINT
# - AZURE_OPENAI_API_KEY (for local dev)
# - COSMOS_ENDPOINT
# - COSMOS_KEY (for local dev)
```

### 3. Run with Docker Compose

```bash
# From project root
docker-compose up --build
```

**🎉 App is now running at http://localhost:5173**

### Alternative: Run Manually

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend  
npm run dev
```

## Azure Deployment

### 1. Set Your Variables

```powershell
$resourceGroup = "rg-ailz-lab"
$acrName = "<your-acr-name>"
$location = "swedencentral"

# Get existing resource IDs
$envId = az containerapp env show `
    --name <your-container-env> `
    --resource-group $resourceGroup `
    --query id -o tsv

$appInsights = az monitor app-insights component show `
    --app <your-app-insights> `
    --resource-group $resourceGroup `
    --query connectionString -o tsv

$openAiEndpoint = "https://<your-openai>.openai.azure.com/"
```

### 2. Deploy Everything

```powershell
cd infrastructure

./deploy.ps1 `
    -ResourceGroup $resourceGroup `
    -AcrName $acrName `
    -Location $location `
    -ContainerAppsEnvironmentId $envId `
    -AppInsightsConnectionString $appInsights `
    -OpenAiEndpoint $openAiEndpoint `
    -OpenAiDeployment "gpt-4o"
```

The script will:
- ✅ Build backend Docker image
- ✅ Build frontend Docker image  
- ✅ Push images to ACR
- ✅ Deploy Cosmos DB (serverless)
- ✅ Deploy Storage Account
- ✅ Deploy Backend Container App
- ✅ Deploy Frontend Container App
- ✅ Configure RBAC for managed identity

### 3. Assign OpenAI Access

```powershell
# Get backend identity from deployment
$backendPrincipalId = az deployment group show `
    --resource-group $resourceGroup `
    --name <deployment-name> `
    --query properties.outputs.backendPrincipalId.value -o tsv

# Grant OpenAI access
az role assignment create `
    --assignee $backendPrincipalId `
    --role "Cognitive Services OpenAI User" `
    --scope /subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<openai-name>
```

### 4. Access Your App

```powershell
# Get URLs from deployment
$frontendUrl = az deployment group show `
    --resource-group $resourceGroup `
    --name <deployment-name> `
    --query properties.outputs.frontendUrl.value -o tsv

echo "Frontend: $frontendUrl"
```

## Using the App

1. **Select Location**: Click on the map or use geolocation
2. **Enter Preferences**: Describe what you want to do (e.g., "outdoor activities and good coffee")
3. **Set Radius**: Choose search radius (1-20 km)
4. **Generate**: Click "Generate Itinerary"
5. **View Results**: See your AI-planned day with:
   - Weather-appropriate activities
   - Day-specific hours and closures
   - Local events happening today
   - Travel times between activities
   - Restaurant recommendations

## API Testing

### Generate Itinerary
```bash
curl -X POST http://localhost:3000/api/itinerary/generate \
  -H "Content-Type: application/json" \
  -d '{
    "location": {"lat": 60.1699, "lon": 24.9384},
    "userInput": "outdoor activities and local food",
    "radius": 5,
    "date": "2024-01-15T10:00:00Z"
  }'
```

### Get Weather
```bash
curl "http://localhost:3000/api/weather?lat=60.1699&lon=24.9384"
```

### Search Events
```bash
curl "http://localhost:3000/api/events/search?lat=60.1699&lon=24.9384&radius=10"
```

## Troubleshooting

### Port Already in Use
```bash
# Kill processes on ports 3000 or 5173
npx kill-port 3000
npx kill-port 5173
```

### Docker Issues
```bash
# Reset Docker
docker-compose down
docker system prune -a
docker-compose up --build
```

### Azure Authentication
```bash
# Login to Azure
az login

# Set subscription
az account set --subscription <subscription-id>

# Login to ACR
az acr login --name <acr-name>
```

### Managed Identity Not Working
- Verify RBAC assignments are complete
- Check Container App logs: `az containerapp logs show`
- Ensure environment variables are set correctly

## Next Steps

- 📖 Read full [README.md](./README.md) for architecture details
- 📋 Check [REQUIREMENTS.md](./REQUIREMENTS.md) for feature specifications
- 🎪 Review [EVENT_INTEGRATION.md](./EVENT_INTEGRATION.md) for event sourcing logic
- 🔧 Explore backend code in `backend/src/services/`
- 🎨 Customize frontend in `frontend/src/components/`

## Support

**Logs:**
```bash
# Backend logs
az containerapp logs show --name ca-dayplanner-backend-<suffix> --resource-group rg-ailz-lab

# Frontend logs  
az containerapp logs show --name ca-dayplanner-frontend-<suffix> --resource-group rg-ailz-lab
```

**Health Checks:**
```bash
curl https://<backend-url>/health
```

**Monitor:**
- Application Insights in Azure Portal
- Container App metrics and logs

---

**Questions?** Check the [README.md](./README.md) or review Azure Container Apps documentation.
