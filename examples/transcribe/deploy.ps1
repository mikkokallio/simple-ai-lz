# Healthcare Triage App - Deployment Script
# This script completes the deployment of the healthcare transcription application

param(
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroup = "rg-ailz-lab",
    
    [Parameter(Mandatory=$false)]
    [string]$Location = "swedencentral",
    
    [Parameter(Mandatory=$false)]
    [string]$SubscriptionId = "f6f84135-2f56-47ac-b4bf-4202248dd5ee"
)

Write-Host "Healthcare Triage Application Deployment" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Set subscription context
Write-Host "`nSetting subscription context..." -ForegroundColor Yellow
az account set --subscription $SubscriptionId

# Variables
$functionAppName = "func-triage-ezle7syi"
$containerAppName = "aca-triage-frontend-ezle7syi"
$acrName = "acrezle7syiailz"
$caEnvironment = "cae-ailz-ezle7syi"

Write-Host "`n=== Step 1: Deploy Function App ===" -ForegroundColor Green
Write-Host "Note: If automatic deployment fails due to storage restrictions," -ForegroundColor Yellow
Write-Host "please create the Function App manually in the Azure Portal with these settings:" -ForegroundColor Yellow
Write-Host "  - Name: $functionAppName" -ForegroundColor White
Write-Host "  - Runtime: Node.js 20" -ForegroundColor White
Write-Host "  - Plan: Consumption (swedencentral)" -ForegroundColor White
Write-Host "  - Storage: stfunctriage5678 (or create new)" -ForegroundColor White
Write-Host "  - Enable System-Assigned Managed Identity" -ForegroundColor White
Write-Host ""

$createFunction = Read-Host "Attempt automatic Function App creation? (y/n)"
if ($createFunction -eq 'y') {
    try {
        Write-Host "Creating Function App..." -ForegroundColor Yellow
        az functionapp create `
            --name $functionAppName `
            --resource-group $ResourceGroup `
            --consumption-plan-location $Location `
            --storage-account stfunctriage5678 `
            --runtime node `
            --runtime-version 20 `
            --functions-version 4 `
            --os-type Linux `
            --assign-identity "[system]"
        
        Write-Host "Function App created successfully!" -ForegroundColor Green
    } catch {
        Write-Host "Automatic creation failed. Please create manually and press Enter to continue..." -ForegroundColor Red
        Read-Host
    }
} else {
    Write-Host "Please create the Function App manually and press Enter to continue..." -ForegroundColor Yellow
    Read-Host
}

Write-Host "`n=== Step 2: Configure Function App Settings ===" -ForegroundColor Green
Write-Host "Setting application configuration..." -ForegroundColor Yellow

az functionapp config appsettings set `
    --name $functionAppName `
    --resource-group $ResourceGroup `
    --settings `
        "AZURE_OPENAI_ENDPOINT=https://foundry-ezle7syi.openai.azure.com/" `
        "AZURE_OPENAI_DEPLOYMENT=gpt-4o" `
        "COSMOS_DB_ENDPOINT=https://cosmos-ailz-ezle7syi.documents.azure.com:443/" `
        "COSMOS_DB_DATABASE=healthcare-triage" `
        "COSMOS_DB_CONTAINER=draft-records" `
        "STORAGE_ACCOUNT_NAME=stailzezle7syi" `
        "SPEECH_SERVICE_REGION=swedencentral"

Write-Host "Configuration applied!" -ForegroundColor Green

Write-Host "`n=== Step 3: Deploy Function Code ===" -ForegroundColor Green
$deployFunctions = Read-Host "Deploy Function code now? (y/n)"
if ($deployFunctions -eq 'y') {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    Push-Location backend
    npm install
    
    Write-Host "Deploying to Azure..." -ForegroundColor Yellow
    func azure functionapp publish $functionAppName
    
    Pop-Location
    Write-Host "Functions deployed!" -ForegroundColor Green
}

Write-Host "`n=== Step 4: Configure RBAC Permissions ===" -ForegroundColor Green
Write-Host "Getting Function App managed identity..." -ForegroundColor Yellow
$functionAppId = az functionapp identity show --name $functionAppName --resource-group $ResourceGroup --query principalId -o tsv

if ($functionAppId) {
    Write-Host "Principal ID: $functionAppId" -ForegroundColor White
    
    Write-Host "Granting Cosmos DB Data Contributor..." -ForegroundColor Yellow
    az cosmosdb sql role assignment create `
        --account-name cosmos-ailz-ezle7syi `
        --resource-group $ResourceGroup `
        --role-definition-name "Cosmos DB Built-in Data Contributor" `
        --principal-id $functionAppId `
        --scope "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-ailz-ezle7syi"
    
    Write-Host "Granting Storage Blob Data Contributor..." -ForegroundColor Yellow
    az role assignment create `
        --assignee $functionAppId `
        --role "Storage Blob Data Contributor" `
        --scope "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.Storage/storageAccounts/stailzezle7syi"
    
    Write-Host "Granting Cognitive Services User (OpenAI)..." -ForegroundColor Yellow
    az role assignment create `
        --assignee $functionAppId `
        --role "Cognitive Services User" `
        --scope "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.CognitiveServices/accounts/foundry-ezle7syi"
    
    Write-Host "Granting Cognitive Services User (Speech)..." -ForegroundColor Yellow
    az role assignment create `
        --assignee $functionAppId `
        --role "Cognitive Services User" `
        --scope "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.CognitiveServices/accounts/speech-ailz-ezle7syi"
    
    Write-Host "RBAC permissions configured!" -ForegroundColor Green
}

Write-Host "`n=== Step 5: Build and Deploy Frontend ===" -ForegroundColor Green
$deployFrontend = Read-Host "Build and deploy frontend Container App? (y/n)"
if ($deployFrontend -eq 'y') {
    Write-Host "Logging into ACR..." -ForegroundColor Yellow
    az acr login --name $acrName
    
    Write-Host "Building Docker image..." -ForegroundColor Yellow
    Push-Location frontend
    docker build -t "${acrName}.azurecr.io/healthcare-triage-frontend:v1" .
    
    Write-Host "Pushing to ACR..." -ForegroundColor Yellow
    docker push "${acrName}.azurecr.io/healthcare-triage-frontend:v1"
    
    Pop-Location
    
    Write-Host "Deploying Container App..." -ForegroundColor Yellow
    $functionAppUrl = "https://$functionAppName.azurewebsites.net"
    
    az containerapp create `
        --name $containerAppName `
        --resource-group $ResourceGroup `
        --environment $caEnvironment `
        --image "${acrName}.azurecr.io/healthcare-triage-frontend:v1" `
        --target-port 3000 `
        --ingress external `
        --registry-server "${acrName}.azurecr.io" `
        --registry-identity system `
        --cpu 0.5 `
        --memory 1.0Gi `
        --min-replicas 1 `
        --max-replicas 3 `
        --env-vars `
            "NEXT_PUBLIC_FUNCTION_APP_URL=$functionAppUrl" `
            "NEXT_PUBLIC_SPEECH_REGION=$Location" `
        --system-assigned
    
    Write-Host "Frontend deployed!" -ForegroundColor Green
    
    # Get the Container App URL
    $appUrl = az containerapp show --name $containerAppName --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv
    Write-Host "`nApplication URL: https://$appUrl" -ForegroundColor Cyan
}

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "1. Test the application at the Container App URL" -ForegroundColor White
Write-Host "2. Configure Entra ID authentication if needed" -ForegroundColor White
Write-Host "3. Set up monitoring and alerts" -ForegroundColor White
Write-Host "4. Implement Speech token endpoint for production use" -ForegroundColor White
Write-Host ""

Write-Host "For detailed instructions, see README.md" -ForegroundColor Cyan
