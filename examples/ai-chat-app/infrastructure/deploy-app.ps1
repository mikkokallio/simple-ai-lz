#!/usr/bin/env pwsh
# Deploy AI Chat Application with proper configuration
# This script demonstrates the repeatable deployment process

param(
    [string]$ResourceGroup = "rg-ailz-lab",
    [string]$Location = "swedencentral",
    [string]$UniqueSuffix = "ezle7syi",
    [string]$BackendImage = "acrezle7syiailz.azurecr.io/ai-chat-backend:v24",
    [string]$FrontendImage = "acrezle7syiailz.azurecr.io/ai-chat-frontend:v14",
    [string]$EntraClientId = "f959bb64-3fa2-46ac-a324-ad25a7499fb2",
    [string]$EntraTenantId = "822e1525-06a0-418c-9fab-ffc6a51aaac5"
)

Write-Host "🚀 Deploying AI Chat Application" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# Get existing infrastructure details
Write-Host "`n📋 Getting infrastructure details..." -ForegroundColor Yellow

$caeId = az resource show `
    --resource-group $ResourceGroup `
    --resource-type Microsoft.App/managedEnvironments `
    --name "cae-ailz-$UniqueSuffix" `
    --query id -o tsv

$storageAccount = az storage account show `
    --resource-group $ResourceGroup `
    --name "stailz$UniqueSuffix" `
    --query '{name:name, id:id}' -o json | ConvertFrom-Json

$appInsights = az monitor app-insights component show `
    --resource-group $ResourceGroup `
    --app "appi-ailz-$UniqueSuffix" `
    --query connectionString -o tsv

$acrPassword = az acr credential show `
    --name acrezle7syiailz `
    --query "passwords[0].value" -o tsv

$aiFoundryKey = "<your-ai-foundry-key>"  # Note: Get from Key Vault or secure parameter

Write-Host "✅ Infrastructure details retrieved" -ForegroundColor Green

# Deploy via Bicep
Write-Host "`n🏗️  Deploying Container Apps..." -ForegroundColor Yellow

az deployment group create `
    --resource-group $ResourceGroup `
    --template-file app.bicep `
    --parameters `
        containerAppsEnvironmentId="$caeId" `
        appInsightsConnectionString="$appInsights" `
        location="$Location" `
        uniqueSuffix="$UniqueSuffix" `
        acrPassword="$acrPassword" `
        storageAccountName="$($storageAccount.name)" `
        storageAccountResourceId="$($storageAccount.id)" `
        aiFoundryEndpoint="https://foundry-mikkolabs.cognitiveservices.azure.com/" `
        aiFoundryDeployment="gpt-5-mini" `
        aiFoundryKey="$aiFoundryKey" `
        keyVaultName="kv-ailz-$UniqueSuffix" `
        frontendImage="$FrontendImage" `
        backendImage="$BackendImage" `
        entraClientId="$EntraClientId" `
        entraTenantId="$EntraTenantId" `
        corsAllowedOrigins=""  # Empty = auto-configure from frontend URL

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Deployment completed successfully!" -ForegroundColor Green
    
    # Get the URLs
    $frontendUrl = az containerapp show `
        --name "aca-ai-chat-frontend-$UniqueSuffix" `
        --resource-group $ResourceGroup `
        --query "properties.configuration.ingress.fqdn" -o tsv
    
    $backendUrl = az containerapp show `
        --name "aca-ai-chat-backend-$UniqueSuffix" `
        --resource-group $ResourceGroup `
        --query "properties.configuration.ingress.fqdn" -o tsv
    
    Write-Host "`n🌐 Application URLs:" -ForegroundColor Cyan
    Write-Host "   Frontend: https://$frontendUrl" -ForegroundColor White
    Write-Host "   Backend:  https://$backendUrl" -ForegroundColor White
    
    # Open in browser
    Write-Host "`n🌐 Opening frontend in browser..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    Start-Process "https://$frontendUrl"
} else {
    Write-Host "`n❌ Deployment failed!" -ForegroundColor Red
    exit 1
}
