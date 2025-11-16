#!/usr/bin/env pwsh
# ============================================================================
# Funday Day Planner - Deployment Script
# ============================================================================
# Builds Docker images, pushes to ACR, and deploys Bicep infrastructure
# ============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroup = "rg-ailz-lab",
    
    [Parameter(Mandatory=$false)]
    [string]$Location = "swedencentral",
    
    [Parameter(Mandatory=$true)]
    [string]$AcrName,
    
    [Parameter(Mandatory=$true)]
    [string]$ContainerAppsEnvironmentId,
    
    [Parameter(Mandatory=$true)]
    [string]$AppInsightsConnectionString,
    
    [Parameter(Mandatory=$true)]
    [string]$OpenAiEndpoint,
    
    [Parameter(Mandatory=$false)]
    [string]$OpenAiDeployment = "gpt-4o",
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Funday Day Planner - Deployment" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# Validate Azure CLI
# ============================================================================

Write-Host "Checking Azure CLI..." -ForegroundColor Yellow
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI not found. Please install: https://aka.ms/azure-cli"
    exit 1
}

# Check Azure login
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Not logged in to Azure. Logging in..." -ForegroundColor Yellow
    az login
    $account = az account show | ConvertFrom-Json
}

Write-Host "Using subscription: $($account.name)" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Set variables
# ============================================================================

$uniqueSuffix = -join ((97..122) | Get-Random -Count 6 | ForEach-Object {[char]$_})
$storageAccountName = "stdayplanner$uniqueSuffix"
$backendImage = "$AcrName.azurecr.io/dayplanner-backend:latest"
$frontendImage = "$AcrName.azurecr.io/dayplanner-frontend:latest"

Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Resource Group: $ResourceGroup"
Write-Host "  Location: $Location"
Write-Host "  ACR: $AcrName"
Write-Host "  Storage Account: $storageAccountName"
Write-Host "  Backend Image: $backendImage"
Write-Host "  Frontend Image: $frontendImage"
Write-Host ""

# Get the project root directory (parent of infrastructure)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

# ============================================================================
# Build and push Docker images using ACR Build
# ============================================================================

if (-not $SkipBuild) {
    Write-Host "Building images in ACR..." -ForegroundColor Yellow
    
    # Build backend using ACR
    Write-Host "Building backend image in ACR..." -ForegroundColor Yellow
    az acr build `
        --registry $AcrName `
        --image "dayplanner-backend:latest" `
        --file "$projectRoot/backend/Dockerfile" `
        "$projectRoot/backend/"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backend build failed"
        exit 1
    }
    
    # Build frontend using ACR
    Write-Host "Building frontend image in ACR..." -ForegroundColor Yellow
    az acr build `
        --registry $AcrName `
        --image "dayplanner-frontend:latest" `
        --file "$projectRoot/frontend/Dockerfile" `
        "$projectRoot/frontend/"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Frontend build failed"
        exit 1
    }
    
    Write-Host "Images built successfully in ACR" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "Skipping build (using existing images)" -ForegroundColor Yellow
    Write-Host ""
}

# ============================================================================
# Get ACR credentials
# ============================================================================

Write-Host "Getting ACR credentials..." -ForegroundColor Yellow
$acrPassword = az acr credential show --name $AcrName --query "passwords[0].value" -o tsv

# ============================================================================
# Deploy Bicep template
# ============================================================================

Write-Host "Deploying infrastructure..." -ForegroundColor Yellow

$deploymentName = "dayplanner-$(Get-Date -Format 'yyyyMMddHHmmss')"

az deployment group create `
    --resource-group $ResourceGroup `
    --template-file "$scriptDir/main.bicep" `
    --name $deploymentName `
    --parameters `
        location=$Location `
        containerAppsEnvironmentId=$ContainerAppsEnvironmentId `
        appInsightsConnectionString=$AppInsightsConnectionString `
        acrLoginServer="$AcrName.azurecr.io" `
        acrPassword=$acrPassword `
        frontendImage=$frontendImage `
        backendImage=$backendImage `
        openAiEndpoint=$OpenAiEndpoint `
        openAiDeployment=$OpenAiDeployment `
        storageAccountName=$storageAccountName

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
    | ConvertFrom-Json

$backendUrl = $outputs.backendUrl.value
$frontendUrl = $outputs.frontendUrl.value
$backendPrincipalId = $outputs.backendPrincipalId.value

# ============================================================================
# Assign OpenAI RBAC (requires manual OpenAI resource name)
# ============================================================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Manual Step Required: OpenAI RBAC" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Run this command to grant backend access to OpenAI:"
Write-Host ""
Write-Host "az role assignment create \\" -ForegroundColor Green
Write-Host "  --assignee $backendPrincipalId \\" -ForegroundColor Green
Write-Host "  --role 'Cognitive Services OpenAI User' \\" -ForegroundColor Green
Write-Host "  --scope /subscriptions/<subscription-id>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<openai-name>" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Summary
# ============================================================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend URL:  $backendUrl" -ForegroundColor Cyan
Write-Host "Frontend URL: $frontendUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test backend health: curl $backendUrl/health" -ForegroundColor Yellow
Write-Host "Open frontend: $frontendUrl" -ForegroundColor Yellow
Write-Host ""
