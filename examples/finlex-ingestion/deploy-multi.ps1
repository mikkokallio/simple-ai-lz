# Deploy multi-stage Finlex ingestion pipeline
param(
    [string]$ResourceGroup = "rg-ailz-lab",
    [string]$Location = "swedencentral",
    [string]$TargetYears = "2024,2025"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Multi-Stage Finlex Ingestion Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Resource Group: $ResourceGroup"
Write-Host "Location: $Location"
Write-Host "Target Years: $TargetYears"
Write-Host ""

# Get existing resources
Write-Host "Finding existing resources..." -ForegroundColor Yellow

$acr = az acr list -g $ResourceGroup --query "[0].name" -o tsv
if (-not $acr) {
    Write-Error "No ACR found in resource group"
    exit 1
}
Write-Host "  ACR: $acr" -ForegroundColor Green

$storage = az storage account list -g $ResourceGroup --query "[0].name" -o tsv
if (-not $storage) {
    Write-Error "No storage account found in resource group"
    exit 1
}
Write-Host "  Storage: $storage" -ForegroundColor Green

$environment = az containerapp env list -g $ResourceGroup --query "[0].name" -o tsv
if (-not $environment) {
    Write-Error "No Container Apps Environment found in resource group"
    exit 1
}
Write-Host "  Environment: $environment" -ForegroundColor Green

$searchService = az search service list -g $ResourceGroup --query "[0].name" -o tsv
if (-not $searchService) {
    Write-Error "No Search service found in resource group"
    exit 1
}
$searchEndpoint = "https://$searchService.search.windows.net"
Write-Host "  Search: $searchService" -ForegroundColor Green

# Use known OpenAI account name (avoid network issues with list query)
$openAiAccount = "foundry-ezle7syi"
$openAiEndpoint = "https://$openAiAccount.openai.azure.com/"
Write-Host "  OpenAI: $openAiAccount" -ForegroundColor Green

# Build and push container images for each stage
Write-Host ""
Write-Host "Building multi-stage container images..." -ForegroundColor Yellow

$stages = @("stage1-download", "stage2-parse", "stage3-chunk", "stage4-embed", "stage5-index")

foreach ($stage in $stages) {
    Write-Host "  Building finlex-$stage..." -ForegroundColor Cyan
    az acr build --registry $acr --image "finlex-${stage}:latest" --file Dockerfile.multi --platform linux/amd64 .
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to build $stage image"
        exit 1
    }
    Write-Host "    Built finlex-$stage" -ForegroundColor Green
}

# Deploy infrastructure
Write-Host ""
Write-Host "Deploying infrastructure..." -ForegroundColor Yellow

$deploymentName = "finlex-multi-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

$deployment = az deployment group create --resource-group $ResourceGroup --template-file infrastructure-multi/main.bicep --parameters location=$Location environmentName=$environment containerRegistryName=$acr storageAccountName=$storage searchEndpoint=$searchEndpoint searchIndexName="finlex-multi-index" openAiEndpoint=$openAiEndpoint openAiDeployment="text-embedding-3-small" embeddingDimensions=1536 targetYears=$TargetYears skipExisting="true" --name $deploymentName --output json | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) {
    Write-Error "Infrastructure deployment failed"
    exit 1
}

Write-Host "  Infrastructure deployed" -ForegroundColor Green

# Extract outputs
$outputs = $deployment.properties.outputs

$stage1Job = $outputs.stage1JobName.value
$stage1Principal = $outputs.stage1PrincipalId.value
$stage2Job = $outputs.stage2JobName.value
$stage2Principal = $outputs.stage2PrincipalId.value
$stage3Job = $outputs.stage3JobName.value
$stage3Principal = $outputs.stage3PrincipalId.value
$stage4Job = $outputs.stage4JobName.value
$stage4Principal = $outputs.stage4PrincipalId.value
$stage5Job = $outputs.stage5JobName.value
$stage5Principal = $outputs.stage5PrincipalId.value

Write-Host ""
Write-Host "Jobs created:" -ForegroundColor Yellow
Write-Host "  Stage 1: $stage1Job" -ForegroundColor Green
Write-Host "  Stage 2: $stage2Job" -ForegroundColor Green
Write-Host "  Stage 3: $stage3Job" -ForegroundColor Green
Write-Host "  Stage 4: $stage4Job" -ForegroundColor Green
Write-Host "  Stage 5: $stage5Job" -ForegroundColor Green

# Grant RBAC permissions
Write-Host ""
Write-Host "Configuring RBAC permissions..." -ForegroundColor Yellow

# Storage Blob Data Contributor for all stages
$subscriptionId = az account show --query id -o tsv
$storageScope = "/subscriptions/$subscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.Storage/storageAccounts/$storage"

foreach ($principal in @($stage1Principal, $stage2Principal, $stage3Principal, $stage4Principal, $stage5Principal)) {
    az role assignment create --assignee $principal --role "Storage Blob Data Contributor" --scope $storageScope | Out-Null
}
Write-Host "  Storage permissions granted" -ForegroundColor Green

# Cognitive Services User for Stage 4 (embeddings)
$openAiScope = "/subscriptions/$subscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.CognitiveServices/accounts/$openAiAccount"

az role assignment create --assignee $stage4Principal --role "Cognitive Services User" --scope $openAiScope | Out-Null
Write-Host "  OpenAI permissions granted (Stage 4)" -ForegroundColor Green

# Search Index Data Contributor for Stage 5 (indexing)
$searchScope = "/subscriptions/$subscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.Search/searchServices/$searchService"

az role assignment create --assignee $stage5Principal --role "Search Index Data Contributor" --scope $searchScope | Out-Null
Write-Host "  Search permissions granted (Stage 5)" -ForegroundColor Green

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT COMPLETED SUCCESSFULLY" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To run the pipeline, execute stages in order:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Stage 1: az containerapp job start -n $stage1Job -g $ResourceGroup" -ForegroundColor Cyan
Write-Host "Stage 2: az containerapp job start -n $stage2Job -g $ResourceGroup" -ForegroundColor Cyan
Write-Host "Stage 3: az containerapp job start -n $stage3Job -g $ResourceGroup" -ForegroundColor Cyan
Write-Host "Stage 4: az containerapp job start -n $stage4Job -g $ResourceGroup" -ForegroundColor Cyan
Write-Host "Stage 5: az containerapp job start -n $stage5Job -g $ResourceGroup" -ForegroundColor Cyan
Write-Host ""
