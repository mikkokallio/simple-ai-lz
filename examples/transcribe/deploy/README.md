# Healthcare Transcription App - Bicep Deployment

This directory contains Infrastructure as Code (IaC) for deploying the healthcare transcription application.

## Files

- **main.bicep**: Complete infrastructure definition including Container Apps and RBAC
- **main.parameters.json**: Environment-specific parameters

## What's Deployed

### Container Apps
- **Backend** (`aca-triage-backend`): Azure Functions Node.js v4 backend
  - Image: `healthcare-triage-backend:v4`
  - Resources: 1 CPU, 2Gi memory
  - Port: 80
  
- **Frontend** (`aca-triage-frontend`): Next.js 14 React application
  - Image: `healthcare-triage-frontend:v2`
  - Resources: 0.5 CPU, 1Gi memory
  - Port: 3000

### RBAC Assignments

Backend Container App managed identity gets:
- **Storage Blob Data Owner** - For AzureWebJobsStorage (Functions runtime requirement)
- **Storage Queue Data Contributor** - For Functions host queue operations
- **Storage Table Data Contributor** - For diagnostic events
- **Cosmos DB Data Contributor** - For draft-records container access
- **Cognitive Services User** - For Azure OpenAI API access
- **Cognitive Services Speech User** - For Speech Service access
- **AcrPull** - For pulling container images

Frontend Container App managed identity gets:
- **Cognitive Services Speech User** - For Speech token endpoint
- **AcrPull** - For pulling container images

## Deployment

### Prerequisites
1. Container images built and pushed to ACR:
   ```bash
   cd frontend
   az acr build --registry acrezle7syiailz --image healthcare-triage-frontend:v2 .
   
   cd ../backend
   az acr build --registry acrezle7syiailz --image healthcare-triage-backend:v4 .
   ```

2. Existing infrastructure:
   - Resource Group: `rg-ailz-lab`
   - Azure Container Apps Environment: `cae-ailz-ezle7syi`
   - Azure Container Registry: `acrezle7syiailz`
   - Azure OpenAI: `foundry-ezle7syi`
   - Speech Service: `speech-ailz-ezle7syi`
   - Cosmos DB: `cosmos-ailz-ezle7syi`
   - Storage Account: `stailzezle7syi`

### Deploy
```bash
# Deploy infrastructure
az deployment group create \
  --resource-group rg-ailz-lab \
  --template-file deploy/main.bicep \
  --parameters deploy/main.parameters.json

# Get URLs
az deployment group show \
  --resource-group rg-ailz-lab \
  --name main \
  --query properties.outputs
```

### Update Container Images
To deploy new versions:

```bash
# Build new images
cd frontend
az acr build --registry acrezle7syiailz --image healthcare-triage-frontend:v3 .

# Update Bicep parameter and redeploy
az deployment group create \
  --resource-group rg-ailz-lab \
  --template-file deploy/main.bicep \
  --parameters deploy/main.parameters.json
```

## Environment Variables

### Backend
All configured via Bicep:
- `AZURE_OPENAI_ENDPOINT` - From existing OpenAI resource
- `AZURE_OPENAI_DEPLOYMENT` - Parameter (default: gpt-4o)
- `AZURE_SPEECH_ENDPOINT` - From existing Speech Service
- `AZURE_SPEECH_KEY` - From Speech Service (stored as secret)
- `COSMOS_ENDPOINT` - From existing Cosmos DB
- `STORAGE_ACCOUNT_NAME` - From existing Storage Account
- `BLOB_CONTAINER_NAME` - Hard-coded: audio-uploads
- `AzureWebJobsStorage__accountName` - For Functions runtime (managed identity)
- `FUNCTIONS_WORKER_RUNTIME` - Hard-coded: node
- `AzureWebJobsScriptRoot` - Hard-coded: /app

### Frontend
- `NEXT_PUBLIC_API_URL` - Dynamically set from backend FQDN

## Troubleshooting

### Backend Activation Failures
If the backend shows `ActivationFailed`:
1. Check logs: `az containerapp logs show --name aca-triage-backend --resource-group rg-ailz-lab --tail 100`
2. Verify RBAC propagation (can take 5-10 minutes)
3. Check revision status: `az containerapp revision list --name aca-triage-backend --resource-group rg-ailz-lab`

### RBAC Issues
Role assignments are managed by Bicep. If permissions are missing:
```bash
# Verify backend identity
az containerapp show --name aca-triage-backend --resource-group rg-ailz-lab --query identity

# Check role assignments
az role assignment list --assignee <principalId> --scope <resourceId>
```

## Notes

- **AzureWebJobsStorage**: Azure Functions requires this for runtime operations. We use managed identity connection (`AzureWebJobsStorage__accountName`) instead of connection string for zero-trust security.
- **Image Updates**: Bicep tracks image tags. Update the tag in the template to trigger new revisions.
- **Secrets**: Speech key is the only secret (stored securely in Container App). All other connections use managed identity.
