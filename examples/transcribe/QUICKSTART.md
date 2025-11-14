# Quick Start Guide

## Current Status

✅ **Completed**:
- Project structure created
- Azure AI Speech Service deployed
- Blob Storage container created
- Cosmos DB database and container created
- Backend Functions code implemented
- Frontend React/Next.js app built
- Deployment automation script ready

⏳ **Pending Manual Step**:
- Function App creation (requires manual intervention due to storage restrictions)

## Next Steps to Deploy

### Option 1: Run Deployment Script (Recommended)

The automated script will guide you through the process:

```powershell
cd c:\Users\mikkokallio\dev\simple-ai-lz\examples\transcribe
.\deploy.ps1
```

The script will:
1. Prompt you to create Function App (manual or attempt auto)
2. Configure application settings
3. Deploy Function code
4. Set up RBAC permissions
5. Build and deploy frontend container
6. Provide final application URL

### Option 2: Manual Step-by-Step

#### 1. Create Function App via Azure Portal

Go to Azure Portal → Create Function App:
- **Name**: `func-triage-ezle7syi`
- **Publish**: Code
- **Runtime**: Node.js 20
- **Region**: Sweden Central
- **Plan**: Consumption (or Flex Consumption)
- **Storage**: `stfunctriage5678` (already created)
- **Enable**: System-assigned managed identity

#### 2. Deploy Backend

```powershell
cd backend
npm install

# Configure app settings
az functionapp config appsettings set `
    --name func-triage-ezle7syi `
    --resource-group rg-ailz-lab `
    --settings `
        "AZURE_OPENAI_ENDPOINT=https://foundry-ezle7syi.openai.azure.com/" `
        "AZURE_OPENAI_DEPLOYMENT=gpt-4o" `
        "COSMOS_DB_ENDPOINT=https://cosmos-ailz-ezle7syi.documents.azure.com:443/" `
        "COSMOS_DB_DATABASE=healthcare-triage" `
        "COSMOS_DB_CONTAINER=draft-records" `
        "STORAGE_ACCOUNT_NAME=stailzezle7syi" `
        "SPEECH_SERVICE_REGION=swedencentral"

# Deploy functions
func azure functionapp publish func-triage-ezle7syi
```

#### 3. Configure RBAC

```powershell
# Get Function App identity
$funcId = az functionapp identity show --name func-triage-ezle7syi --resource-group rg-ailz-lab --query principalId -o tsv

# Grant Cosmos DB access
az cosmosdb sql role assignment create `
    --account-name cosmos-ailz-ezle7syi `
    --resource-group rg-ailz-lab `
    --role-definition-name "Cosmos DB Built-in Data Contributor" `
    --principal-id $funcId `
    --scope "/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-lab/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-ailz-ezle7syi"

# Grant Storage access
az role assignment create `
    --assignee $funcId `
    --role "Storage Blob Data Contributor" `
    --scope "/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-lab/providers/Microsoft.Storage/storageAccounts/stailzezle7syi"

# Grant OpenAI access
az role assignment create `
    --assignee $funcId `
    --role "Cognitive Services User" `
    --scope "/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-lab/providers/Microsoft.CognitiveServices/accounts/foundry-ezle7syi"

# Grant Speech access
az role assignment create `
    --assignee $funcId `
    --role "Cognitive Services User" `
    --scope "/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-lab/providers/Microsoft.CognitiveServices/accounts/speech-ailz-ezle7syi"
```

#### 4. Deploy Frontend

```powershell
cd ..\frontend

# Login to ACR
az acr login --name acrezle7syiailz

# Build and push
docker build -t acrezle7syiailz.azurecr.io/healthcare-triage-frontend:v1 .
docker push acrezle7syiailz.azurecr.io/healthcare-triage-frontend:v1

# Deploy to Container Apps
az containerapp create `
    --name aca-triage-frontend-ezle7syi `
    --resource-group rg-ailz-lab `
    --environment cae-ailz-ezle7syi `
    --image acrezle7syiailz.azurecr.io/healthcare-triage-frontend:v1 `
    --target-port 3000 `
    --ingress external `
    --registry-server acrezle7syiailz.azurecr.io `
    --registry-identity system `
    --cpu 0.5 `
    --memory 1.0Gi `
    --min-replicas 1 `
    --max-replicas 3 `
    --env-vars `
        "NEXT_PUBLIC_FUNCTION_APP_URL=https://func-triage-ezle7syi.azurewebsites.net" `
        "NEXT_PUBLIC_SPEECH_REGION=swedencentral" `
    --system-assigned

# Get app URL
az containerapp show --name aca-triage-frontend-ezle7syi --resource-group rg-ailz-lab --query properties.configuration.ingress.fqdn -o tsv
```

## Testing the Application

1. **Open the Container App URL** (from deployment output)

2. **Test Real-Time Dictation**:
   - Click "Reaaliaikainen sanelu"
   - Click "Aloita nauhoitus"
   - Speak in Finnish: *"Potilas valittaa kuumetta ja kurkkukipua. Lämpö on 38.5 astetta."*
   - Click "Pysäytä nauhoitus"
   - Click "Luo dokumentti"
   - Review the generated structured note
   - Click "Hyväksy ja viimeistele"

3. **Verify in Cosmos DB**:
   - Check the `draft-records` container
   - Should see documents with status "final"

## Troubleshooting

### Function App Won't Deploy
- Check storage account network restrictions
- Ensure shared key access is enabled on storage
- Try creating Function App manually via Portal

### Frontend Can't Call Backend
- Verify Function App URL in environment variables
- Check CORS settings on Function App
- Ensure functions are deployed and running

### Speech Recognition Not Working
- Check browser microphone permissions
- Verify Speech Service region matches config
- Ensure Speech SDK token endpoint is implemented (MVP: may need workaround)

### OpenAI Call Fails
- Verify managed identity has "Cognitive Services User" role
- Check OpenAI endpoint and deployment name
- Review Function App logs in Application Insights

## Important Notes for Finnish Healthcare

- **Language**: All UI and prompts are in Finnish
- **Privacy**: Data stays in EU (Sweden Central region)
- **FHIR-Like**: Uses simplified FHIR structure for demo
- **MVP Scope**: Real-time dictation fully functional; file upload is UI-only

## Resources Created

| Type | Name | Status |
|------|------|--------|
| Speech Service | speech-ailz-ezle7syi | ✅ Deployed |
| Storage Container | audio-uploads | ✅ Created |
| Cosmos DB | healthcare-triage | ✅ Created |
| Storage Account | stfunctriage5678 | ✅ Created |
| Function App | func-triage-ezle7syi | ⏳ Pending |
| Container App | aca-triage-frontend-ezle7syi | ⏳ Pending |

## Documentation

- **Full Documentation**: See `README.md`
- **Implementation Details**: See `IMPLEMENTATION_SUMMARY.md`
- **Deployment Script**: `deploy.ps1`

## Need Help?

Review the comprehensive documentation files or check Azure Portal for resource status and logs.
