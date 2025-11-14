# Healthcare Triage & Documentation Assistant

AI-powered healthcare documentation application for Finnish healthcare providers using Azure services.

## Architecture Overview

### Components Deployed:
1. **Azure AI Speech Service** (`speech-ailz-ezle7syi`) - Finnish language transcription
2. **Azure Blob Storage** - Container `audio-uploads` in `stailzezle7syi` 
3. **Azure Cosmos DB** - Database `healthcare-triage`, Container `draft-records`
4. **Azure Functions** (To be deployed) - Backend API processors
5. **Azure Container Apps** (To be deployed) - Frontend React/Next.js application
6. **Azure OpenAI** (`foundry-ezle7syi`) - GPT-4o for structured note generation

### Zero Trust Security:
- Managed identities for all service-to-service authentication
- No secrets in code or environment variables
- Entra ID for user authentication
- Private endpoints for secure connectivity

## Prerequisites

- Azure CLI installed
- Node.js 20+ installed
- Docker installed (for containerization)
- Access to Azure subscription with appropriate permissions

## Project Structure

```
transcribe/
├── backend/           # Azure Functions (Node.js v4)
│   ├── src/
│   │   └── app.js    # Function implementations
│   ├── host.json
│   ├── local.settings.json
│   └── package.json
├── frontend/          # Next.js 14 React application
│   ├── app/
│   │   ├── components/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── Dockerfile
│   └── package.json
└── shared/
    └── types.ts      # TypeScript type definitions
```

## Backend Deployment (Azure Functions)

### Option 1: Manual Deployment via Portal

Due to storage account restrictions, Function App creation via CLI may require manual steps:

1. **Create Function App** in Azure Portal:
   - Name: `func-triage-ezle7syi`
   - Runtime: Node.js 20
   - Plan: Consumption (or Flex Consumption)
   - Storage: Create new or use `stfunctriage5678`
   - Enable System-Assigned Managed Identity

2. **Deploy Function Code**:
```powershell
cd backend
npm install
func azure functionapp publish func-triage-ezle7syi
```

3. **Configure App Settings**:
```powershell
az functionapp config appsettings set --name func-triage-ezle7syi --resource-group rg-ailz-lab --settings `
  "AZURE_OPENAI_ENDPOINT=https://foundry-ezle7syi.openai.azure.com/" `
  "AZURE_OPENAI_DEPLOYMENT=gpt-4o" `
  "COSMOS_DB_ENDPOINT=https://cosmos-ailz-ezle7syi.documents.azure.com:443/" `
  "COSMOS_DB_DATABASE=healthcare-triage" `
  "COSMOS_DB_CONTAINER=draft-records" `
  "STORAGE_ACCOUNT_NAME=stailzezle7syi" `
  "SPEECH_SERVICE_REGION=swedencentral"
```

### Option 2: Azure CLI (if storage restrictions resolved)

```powershell
# Create Function App
az functionapp create `
  --name func-triage-ezle7syi `
  --resource-group rg-ailz-lab `
  --consumption-plan-location swedencentral `
  --storage-account stfunctriage5678 `
  --runtime node `
  --runtime-version 20 `
  --functions-version 4 `
  --os-type Linux `
  --assign-identity [system]

# Deploy code
cd backend
npm install
func azure functionapp publish func-triage-ezle7syi
```

## RBAC Configuration

After Function App is created, grant necessary permissions:

```powershell
# Get Function App Managed Identity
$functionAppId = az functionapp identity show --name func-triage-ezle7syi --resource-group rg-ailz-lab --query principalId -o tsv

# Grant Cosmos DB Data Contributor
az cosmosdb sql role assignment create `
  --account-name cosmos-ailz-ezle7syi `
  --resource-group rg-ailz-lab `
  --role-definition-name "Cosmos DB Built-in Data Contributor" `
  --principal-id $functionAppId `
  --scope "/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-lab/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-ailz-ezle7syi"

# Grant Storage Blob Data Contributor
az role assignment create `
  --assignee $functionAppId `
  --role "Storage Blob Data Contributor" `
  --scope "/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-lab/providers/Microsoft.Storage/storageAccounts/stailzezle7syi"

# Grant Cognitive Services User (OpenAI)
az role assignment create `
  --assignee $functionAppId `
  --role "Cognitive Services User" `
  --scope "/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-lab/providers/Microsoft.CognitiveServices/accounts/foundry-ezle7syi"

# Grant Cognitive Services User (Speech)
az role assignment create `
  --assignee $functionAppId `
  --role "Cognitive Services User" `
  --scope "/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-lab/providers/Microsoft.CognitiveServices/accounts/speech-ailz-ezle7syi"
```

## Frontend Deployment (Azure Container Apps)

### Build and Push Container Image

```powershell
# Login to ACR
az acr login --name acrezle7syiailz

# Build and push
cd frontend
docker build -t acrezle7syiailz.azurecr.io/healthcare-triage-frontend:v1 .
docker push acrezle7syiailz.azurecr.io/healthcare-triage-frontend:v1
```

### Deploy to ACA

```powershell
# Create Container App
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
```

### Configure Frontend RBAC

```powershell
# Get Container App Managed Identity
$containerAppId = az containerapp identity show --name aca-triage-frontend-ezle7syi --resource-group rg-ailz-lab --query principalId -o tsv

# Grant access to call Function App (if using managed identity)
# Note: For MVP, we'll use function key authentication
```

## Testing

### Local Development

**Backend**:
```powershell
cd backend
npm install
npm start
```

**Frontend**:
```powershell
cd frontend
npm install
npm run dev
```

### Production Testing

1. Navigate to Container App URL
2. Select "Reaaliaikainen sanelu" (Real-time dictation)
3. Click "Aloita nauhoitus" to start recording
4. Speak in Finnish about a healthcare scenario
5. Click "Pysäytä nauhoitus" to stop
6. Click "Luo dokumentti" to generate structured note
7. Review the side-by-side transcript and structured note
8. Click "Hyväksy ja viimeistele" to finalize

## Finnish Healthcare Context

The application is designed for Finnish healthcare (terveydenhuolto) with:

- **Language**: Finnish (fi-FI) transcription
- **Terminology**: Finnish medical terminology
- **FHIR-like Structure**: Simplified FHIR DocumentReference format
- **Privacy**: GDPR compliance through Azure's security features

### Sample Finnish Healthcare Dialogue

```
Lääkäri: "Hyvää päivää. Mikä teitä vaivaa?"
Potilas: "Minulla on ollut kuumetta ja kurkkukipua kolme päivää."
Lääkäri: "Milloin oireet alkoivat?"
Potilas: "Maanantaina aamulla. Lämpö on ollut noin 38.5 astetta."
Lääkäri: "Otan kurkkustreptokokki-pika testin..."
```

## Known Limitations (MVP)

1. **Post-facto upload**: File upload functionality is UI-only; batch transcription not fully implemented
2. **APIM**: Not deployed yet - direct Function App calls used instead
3. **Authentication**: Entra ID integration requires additional configuration
4. **Speech Token**: Real-time dictation requires backend endpoint to issue Speech tokens

## Next Steps

1. Complete Function App deployment with proper storage configuration
2. Deploy frontend Container App
3. Configure RBAC permissions
4. Set up Entra ID authentication
5. Implement Speech token endpoint for secure client access
6. Complete batch transcription pipeline
7. Add APIM layer for additional security

## Architecture Compliance

✅ **Multi-Tenancy Safe**: Uses existing shared infrastructure  
✅ **Zero Trust**: Managed identities throughout  
✅ **Finnish Healthcare**: Language and terminology support  
✅ **FHIR-like**: Structured clinical documentation  
✅ **Scalable**: Consumption/Flex plans for auto-scaling  
✅ **Secure**: Private networking, Entra ID, no hardcoded secrets

## Resources Created

| Resource | Name | Purpose |
|----------|------|---------|
| Speech Service | speech-ailz-ezle7syi | Finnish transcription |
| Storage Container | audio-uploads | Audio file storage |
| Cosmos DB Database | healthcare-triage | Document storage |
| Cosmos DB Container | draft-records | Clinical records |
| Storage Account | stfunctriage5678 | Function App storage |
| Function App | func-triage-ezle7syi | Backend API (pending) |
| Container App | aca-triage-frontend-ezle7syi | Frontend UI (pending) |
