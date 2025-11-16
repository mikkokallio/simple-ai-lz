# ============================================================================
# Funday Day Planner - Simplified Deployment Script
# ============================================================================
# Uses existing infrastructure, only deploys Container Apps
# ============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroup,
    
    [Parameter(Mandatory=$true)]
    [string]$Location,
    
    [Parameter(Mandatory=$true)]
    [string]$AcrName,
    
    [Parameter(Mandatory=$true)]
    [string]$ContainerAppsEnvironmentId,
    
    [Parameter(Mandatory=$true)]
    [string]$AppInsightsConnectionString,
    
    [Parameter(Mandatory=$true)]
    [string]$OpenAiEndpoint,
    
    [Parameter(Mandatory=$true)]
    [string]$OpenAiDeployment,
    
    [Parameter(Mandatory=$true)]
    [string]$OpenAiResourceId,
    
    [string]$CosmosAccountName = "cosmos-ailz-ezle7syi",
    
    [string]$StorageAccountName = "stailzezle7syi",
    
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# Calculate script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Funday Day Planner - Simplified Deployment" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# Check Azure CLI
# ============================================================================

Write-Host "Checking Azure CLI..." -ForegroundColor Yellow
$azVersion = az version --query '\"azure-cli\"' -o tsv
if ($LASTEXITCODE -ne 0) {
    Write-Error "Azure CLI not found. Please install it first."
    exit 1
}

$subscription = az account show --query "name" -o tsv
Write-Host "Using subscription: $subscription" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Configuration
# ============================================================================

$frontendImage = "$AcrName.azurecr.io/dayplanner-frontend:latest"
$backendImage = "$AcrName.azurecr.io/dayplanner-backend:latest"

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Resource Group: $ResourceGroup" -ForegroundColor Gray
Write-Host "  Location: $Location" -ForegroundColor Gray
Write-Host "  ACR: $AcrName" -ForegroundColor Gray
Write-Host "  Cosmos Account: $CosmosAccountName" -ForegroundColor Gray
Write-Host "  Storage Account: $StorageAccountName" -ForegroundColor Gray
Write-Host "  Backend Image: $backendImage" -ForegroundColor Gray
Write-Host "  Frontend Image: $frontendImage" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# Build and push images (optional)
# ============================================================================

if (-not $SkipBuild) {
    Write-Host "Building and pushing images to ACR..." -ForegroundColor Yellow
    
    Write-Host "Building backend image..." -ForegroundColor Gray
    az acr build `
        --registry $AcrName `
        --image "dayplanner-backend:latest" `
        --file "$projectRoot/backend/Dockerfile" `
        "$projectRoot/backend/"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backend build failed"
        exit 1
    }
    
    Write-Host "Building frontend image..." -ForegroundColor Gray
    az acr build `
        --registry $AcrName `
        --image "dayplanner-frontend:latest" `
        --file "$projectRoot/frontend/Dockerfile" `
        "$projectRoot/frontend/"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Frontend build failed"
        exit 1
    }
    
    Write-Host "Images built successfully" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "Skipping build (using existing images)" -ForegroundColor Gray
    Write-Host ""
}

# ============================================================================
# Get ACR credentials
# ============================================================================

Write-Host "Getting ACR credentials..." -ForegroundColor Yellow
$acrPassword = az acr credential show --name $AcrName --query "passwords[0].value" -o tsv

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to get ACR credentials"
    exit 1
}

# ============================================================================
# Deploy infrastructure
# ============================================================================

Write-Host "Deploying Container Apps..." -ForegroundColor Yellow

$deploymentName = "dayplanner-$(Get-Date -Format 'yyyyMMddHHmmss')"

az deployment group create `
    --resource-group $ResourceGroup `
    --template-file "$scriptDir/app-only.bicep" `
    --name $deploymentName `
    --parameters `
        location=$Location `
        containerAppsEnvironmentId=$ContainerAppsEnvironmentId `
        appInsightsConnectionString=$AppInsightsConnectionString `
        acrName=$AcrName `
        acrLoginServer="$AcrName.azurecr.io" `
        acrPassword=$acrPassword `
        frontendImage=$frontendImage `
        backendImage=$backendImage `
        openAiEndpoint=$OpenAiEndpoint `
        openAiDeployment=$OpenAiDeployment `
        openAiResourceId=$OpenAiResourceId `
        cosmosAccountName=$CosmosAccountName `
        storageAccountName=$StorageAccountName

if ($LASTEXITCODE -ne 0) {
    Write-Error "Deployment failed"
    exit 1
}

# ============================================================================
# Get deployment outputs
# ============================================================================

Write-Host ""
Write-Host "Getting deployment outputs..." -ForegroundColor Yellow

$outputs = az deployment group show `
    --resource-group $ResourceGroup `
    --name $deploymentName `
    --query properties.outputs `
    -o json | ConvertFrom-Json

$backendUrl = $outputs.backendUrl.value
$frontendUrl = $outputs.frontendUrl.value
$backendPrincipalId = $outputs.backendPrincipalId.value

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "Deployment Successful!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend URL: $frontendUrl" -ForegroundColor Cyan
Write-Host "Backend URL:  $backendUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Assign OpenAI role to backend managed identity:" -ForegroundColor Gray
Write-Host "   az role assignment create \" -ForegroundColor Gray
Write-Host "     --assignee $backendPrincipalId \" -ForegroundColor Gray
Write-Host "     --role 'Cognitive Services OpenAI User' \" -ForegroundColor Gray
Write-Host "     --scope <your-openai-resource-id>" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Wait 1-2 minutes for RBAC propagation" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Test the app at: $frontendUrl" -ForegroundColor Gray
Write-Host ""
