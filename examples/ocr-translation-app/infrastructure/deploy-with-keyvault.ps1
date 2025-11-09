# ============================================================================
# Deploy OCR Translation App with Key Vault Integration
# ============================================================================
# This script deploys the OCR Translation app with all secrets stored in
# Key Vault and referenced by Container Apps using managed identities
# ============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroupName,
    
    [Parameter(Mandatory=$true)]
    [string]$KeyVaultName,
    
    [Parameter(Mandatory=$false)]
    [string]$Location = "swedencentral",
    
    [Parameter(Mandatory=$false)]
    [string]$UniqueSuffix = (Get-Random -Maximum 99999999).ToString().PadLeft(8, '0').Substring(0, 8)
)

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "OCR Translation App Deployment with Key Vault" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# Step 1: Get Key Vault Resource ID
# ============================================================================

Write-Host "Getting Key Vault information..." -ForegroundColor Yellow
$keyVault = az keyvault show --name $KeyVaultName --resource-group $ResourceGroupName | ConvertFrom-Json
$keyVaultResourceId = $keyVault.id

Write-Host "✓ Key Vault: $KeyVaultName" -ForegroundColor Green
Write-Host "✓ Resource ID: $keyVaultResourceId" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Step 2: Get AI Service Endpoints and Keys
# ============================================================================

Write-Host "Retrieving AI service endpoints and keys..." -ForegroundColor Yellow

# Document Intelligence
$docIntelligence = az cognitiveservices account show --name "di-ailz-$UniqueSuffix" --resource-group $ResourceGroupName 2>$null | ConvertFrom-Json
if ($docIntelligence) {
    $documentIntelligenceEndpoint = $docIntelligence.properties.endpoint
    $documentIntelligenceResourceId = $docIntelligence.id
    Write-Host "✓ Document Intelligence: $documentIntelligenceEndpoint" -ForegroundColor Green
}

# Document Translator
$translator = az cognitiveservices account show --name "dt-ailz-$UniqueSuffix" --resource-group $ResourceGroupName 2>$null | ConvertFrom-Json
if ($translator) {
    $translatorEndpoint = $translator.properties.endpoint
    $translatorResourceId = $translator.id
    $translatorKey = (az cognitiveservices account keys list --name "dt-ailz-$UniqueSuffix" --resource-group $ResourceGroupName --query "key1" -o tsv)
    Write-Host "✓ Document Translator: $translatorEndpoint" -ForegroundColor Green
}

# AI Foundry (if exists)
$aiFoundryEndpoint = ""
$aiFoundryResourceId = ""
$aiFoundryKey = ""
# Add your AI Foundry lookup logic here if needed

# Azure OpenAI (if exists)
$azureOpenAIEndpoint = ""
$azureOpenAIKey = ""
$azureOpenAIDeployment = "gpt-4o"
# Add your OpenAI lookup logic here if needed

# Storage Account
$storage = az storage account show --name "stailz$UniqueSuffix" --resource-group $ResourceGroupName 2>$null | ConvertFrom-Json
if ($storage) {
    $storageAccountName = $storage.name
    $storageAccountResourceId = $storage.id
    Write-Host "✓ Storage Account: $storageAccountName" -ForegroundColor Green
}

# Container Apps Environment
$cae = az containerapp env show --name "cae-ailz-$UniqueSuffix" --resource-group $ResourceGroupName 2>$null | ConvertFrom-Json
if ($cae) {
    $containerAppsEnvironmentId = $cae.id
    Write-Host "✓ Container Apps Environment: $($cae.name)" -ForegroundColor Green
}

# Application Insights
$appInsights = az monitor app-insights component show --app "appi-ailz-$UniqueSuffix" --resource-group $ResourceGroupName 2>$null | ConvertFrom-Json
if ($appInsights) {
    $appInsightsConnectionString = $appInsights.connectionString
    Write-Host "✓ Application Insights: $($appInsights.name)" -ForegroundColor Green
}

# Azure Container Registry
$acrPassword = (az acr credential show --name "acrezle7syiailz" --query "passwords[0].value" -o tsv)
Write-Host "✓ Container Registry credentials retrieved" -ForegroundColor Green

Write-Host ""

# ============================================================================
# Step 3: Deploy Bicep Template
# ============================================================================

Write-Host "Deploying app infrastructure with Key Vault integration..." -ForegroundColor Yellow

$deploymentName = "ocr-translation-app-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

az deployment group create `
    --name $deploymentName `
    --resource-group $ResourceGroupName `
    --template-file "app-with-keyvault.bicep" `
    --parameters `
        containerAppsEnvironmentId="$containerAppsEnvironmentId" `
        appInsightsConnectionString="$appInsightsConnectionString" `
        location="$Location" `
        uniqueSuffix="$UniqueSuffix" `
        keyVaultResourceId="$keyVaultResourceId" `
        keyVaultName="$KeyVaultName" `
        acrPassword="$acrPassword" `
        aiFoundryEndpoint="$aiFoundryEndpoint" `
        documentIntelligenceEndpoint="$documentIntelligenceEndpoint" `
        documentTranslatorEndpoint="$translatorEndpoint" `
        storageAccountName="$storageAccountName" `
        aiFoundryKey="$aiFoundryKey" `
        translatorKey="$translatorKey" `
        azureOpenAIEndpoint="$azureOpenAIEndpoint" `
        azureOpenAIKey="$azureOpenAIKey" `
        azureOpenAIDeployment="$azureOpenAIDeployment" `
        aiFoundryResourceId="$aiFoundryResourceId" `
        documentIntelligenceResourceId="$documentIntelligenceResourceId" `
        documentTranslatorResourceId="$translatorResourceId" `
        storageAccountResourceId="$storageAccountResourceId" `
        frontendImage="acrezle7syiailz.azurecr.io/ocr-translation-frontend:latest" `
        backendImage="acrezle7syiailz.azurecr.io/ocr-translation-backend:latest"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "============================================================================" -ForegroundColor Green
    Write-Host "Deployment completed successfully!" -ForegroundColor Green
    Write-Host "============================================================================" -ForegroundColor Green
    Write-Host ""
    
    # Get outputs
    $outputs = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs" | ConvertFrom-Json
    
    Write-Host "Frontend URL: $($outputs.frontendUrl.value)" -ForegroundColor Cyan
    Write-Host "Backend URL: $($outputs.backendUrl.value)" -ForegroundColor Cyan
    Write-Host "Key Vault: $KeyVaultName" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Secrets stored in Key Vault:" -ForegroundColor Yellow
    foreach ($secret in $outputs.secretsStored.value) {
        Write-Host "  - $secret" -ForegroundColor White
    }
} else {
    Write-Host ""
    Write-Host "Deployment failed. Check the error messages above." -ForegroundColor Red
    exit 1
}
