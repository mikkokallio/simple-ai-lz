#!/usr/bin/env pwsh
# ============================================================================
# OCR & Translation App Deployment Script
# ============================================================================
# Deploys the OCR & Translation app to Azure Container Apps with proper
# RBAC assignments for all required Azure services
# ============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroup = "rg-ailz-lab",
    
    [Parameter(Mandatory=$true)]
    [string]$UniqueSuffix,
    
    [Parameter(Mandatory=$false)]
    [string]$Location = "swedencentral",
    
    [Parameter(Mandatory=$false)]
    [string]$FrontendImageTag = "latest",
    
    [Parameter(Mandatory=$false)]
    [string]$BackendImageTag = "latest"
)

Write-Host "[INFO] Deploying OCR & Translation App" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# Get existing resource IDs from the landing zone
Write-Host "`n[INFO] Retrieving resource information..." -ForegroundColor Yellow

$containerAppsEnvId = az containerapp env show `
    --name "cae-ailz-$UniqueSuffix" `
    --resource-group $ResourceGroup `
    --query id -o tsv

$appInsightsConnString = az monitor app-insights component show `
    --app "appi-ailz-$UniqueSuffix" `
    --resource-group $ResourceGroup `
    --query connectionString -o tsv

$acrName = "acr$UniqueSuffix"
$acrPassword = az acr credential show `
    --name $acrName `
    --query "passwords[0].value" -o tsv

# AI Services
$documentIntelligenceEndpoint = az cognitiveservices account show `
    --name "di-ailz-$UniqueSuffix" `
    --resource-group $ResourceGroup `
    --query properties.endpoint -o tsv

$documentIntelligenceResourceId = az cognitiveservices account show `
    --name "di-ailz-$UniqueSuffix" `
    --resource-group $ResourceGroup `
    --query id -o tsv

$translatorEndpoint = az cognitiveservices account show `
    --name "dt-ailz-$UniqueSuffix" `
    --resource-group $ResourceGroup `
    --query properties.endpoint -o tsv

$translatorResourceId = az cognitiveservices account show `
    --name "dt-ailz-$UniqueSuffix" `
    --resource-group $ResourceGroup `
    --query id -o tsv

# Storage Account
$storageAccountName = "st" + $UniqueSuffix.Replace("-", "")
$storageAccountResourceId = az storage account show `
    --name $storageAccountName `
    --resource-group $ResourceGroup `
    --query id -o tsv

# AI Foundry (use existing resource from rg-foundry for now)
$aiFoundryEndpoint = ""
$aiFoundryResourceId = ""
$aiFoundryKey = ""
try {
    # For now, use the existing AI Foundry resource in rg-foundry
    # TODO: Deploy AI Foundry resource in the same resource group via Bicep
    $aiFoundryEndpoint = az cognitiveservices account show `
        --name "foundry-mikkolabs" `
        --resource-group "rg-foundry" `
        --query properties.endpoint -o tsv 2>$null
    
    $aiFoundryResourceId = az cognitiveservices account show `
        --name "foundry-mikkolabs" `
        --resource-group "rg-foundry" `
        --query id -o tsv 2>$null
    
    $aiFoundryKey = az cognitiveservices account keys list `
        --name "foundry-mikkolabs" `
        --resource-group "rg-foundry" `
        --query key1 -o tsv 2>$null
} catch {
    Write-Host "[INFO] AI Foundry not found - skipping" -ForegroundColor Gray
}

# Get Azure OpenAI details
Write-Host "[INFO] Getting Azure OpenAI details..." -ForegroundColor Yellow
try {
    $azureOpenAIAccount = az cognitiveservices account list `
        --query "[?kind=='OpenAI'] | [0]" -o json 2>$null | ConvertFrom-Json
    
    if ($azureOpenAIAccount) {
        $azureOpenAIEndpoint = $azureOpenAIAccount.properties.endpoint
        $azureOpenAIResourceId = $azureOpenAIAccount.id
        $azureOpenAIName = $azureOpenAIAccount.name
        $azureOpenAIRG = $azureOpenAIAccount.resourceGroup
        
        $azureOpenAIKey = az cognitiveservices account keys list `
            --name $azureOpenAIName `
            --resource-group $azureOpenAIRG `
            --query key1 -o tsv 2>$null
        
        # Get deployment name (first GPT deployment)
        $azureOpenAIDeployment = az cognitiveservices account deployment list `
            --name $azureOpenAIName `
            --resource-group $azureOpenAIRG `
            --query "[?properties.model.name contains(@, 'gpt')].name | [0]" -o tsv 2>$null
        
        if (-not $azureOpenAIDeployment) {
            $azureOpenAIDeployment = "gpt-4o"  # Default fallback
        }
        
        Write-Host "[OK] Found Azure OpenAI: $azureOpenAIName (Deployment: $azureOpenAIDeployment)" -ForegroundColor Green
    }
} catch {
    Write-Host "[INFO] Azure OpenAI not found - skipping" -ForegroundColor Gray
}

# Container images
$frontendImage = "$acrName.azurecr.io/ocr-translation-frontend:$FrontendImageTag"
$backendImage = "$acrName.azurecr.io/ocr-translation-backend:$BackendImageTag"

Write-Host "[OK] Resources retrieved successfully" -ForegroundColor Green

# Deploy the app
Write-Host "`n[INFO] Deploying Container Apps..." -ForegroundColor Yellow

$deploymentName = "ocr-translation-app-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

az deployment group create `
    --name $deploymentName `
    --resource-group $ResourceGroup `
    --template-file "app.bicep" `
    --parameters containerAppsEnvironmentId=$containerAppsEnvironmentId `
    --parameters appInsightsConnectionString=$appInsightsConnString `
    --parameters location=$Location `
    --parameters uniqueSuffix=$UniqueSuffix `
    --parameters acrPassword=$acrPassword `
    --parameters aiFoundryEndpoint=$aiFoundryEndpoint `
    --parameters aiFoundryKey=$aiFoundryKey `
    --parameters documentIntelligenceEndpoint=$documentIntelligenceEndpoint `
    --parameters documentTranslatorEndpoint=$translatorEndpoint `
    --parameters aiFoundryResourceId=$aiFoundryResourceId `
    --parameters documentIntelligenceResourceId=$documentIntelligenceResourceId `
    --parameters documentTranslatorResourceId=$translatorResourceId `
    --parameters storageAccountName=$storageAccountName `
    --parameters storageAccountResourceId=$storageAccountResourceId `
    --parameters azureOpenAIEndpoint=$azureOpenAIEndpoint `
    --parameters azureOpenAIKey=$azureOpenAIKey `
    --parameters azureOpenAIDeployment=$azureOpenAIDeployment `
    --parameters azureOpenAIResourceId=$azureOpenAIResourceId `
    --parameters frontendImage=$frontendImage `
    --parameters backendImage=$backendImage

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[SUCCESS] Deployment completed successfully!" -ForegroundColor Green
    
    # Get app URLs
    $frontendUrl = az deployment group show `
        --name $deploymentName `
        --resource-group $ResourceGroup `
        --query properties.outputs.frontendAppUrl.value -o tsv
    
    $backendUrl = az deployment group show `
        --name $deploymentName `
        --resource-group $ResourceGroup `
        --query properties.outputs.backendAppUrl.value -o tsv
    
    Write-Host "`n[INFO] Application URLs:" -ForegroundColor Cyan
    Write-Host "   Frontend: $frontendUrl" -ForegroundColor White
    Write-Host "   Backend:  $backendUrl" -ForegroundColor White
    Write-Host "`n[WARNING] Remember: These apps are INTERNAL - connect via VPN to access" -ForegroundColor Yellow
    
    Write-Host "`n[INFO] RBAC Assignments Created:" -ForegroundColor Cyan
    Write-Host "   [OK] Backend -> Document Intelligence (Cognitive Services User)" -ForegroundColor Green
    Write-Host "   [OK] Backend -> Translator (Cognitive Services User)" -ForegroundColor Green
    Write-Host "   [OK] Backend -> Storage Account (Storage Blob Data Contributor)" -ForegroundColor Green
    if ($aiFoundryResourceId) {
        Write-Host "   [OK] Backend -> AI Foundry (Cognitive Services User)" -ForegroundColor Green
    }
} else {
    Write-Host "`n[ERROR] Deployment failed!" -ForegroundColor Red
    exit 1
}
