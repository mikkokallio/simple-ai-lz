#!/usr/bin/env pwsh
# ============================================================================
# Build and Deploy OCR & Translation App (using ACR Tasks)
# ============================================================================
# Builds Docker images using ACR Tasks (no local Docker required)
# and deploys to Container Apps
# ============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroup = "rg-ailz-lab",
    
    [Parameter(Mandatory=$true)]
    [string]$UniqueSuffix,
    
    [Parameter(Mandatory=$false)]
    [string]$Location = "swedencentral",
    
    [Parameter(Mandatory=$false)]
    [string]$ImageTag = "latest"
)

Write-Host "[INFO] Build and Deploy OCR & Translation App (using ACR Tasks)" -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan

$ErrorActionPreference = "Stop"

# Navigate to app root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = Split-Path -Parent $scriptDir

try {
    # Get ACR name
    $acrName = "acr$UniqueSuffix"
    
    # Build Frontend using ACR Task
    Write-Host "`n[INFO] Building frontend image in ACR..." -ForegroundColor Yellow
    az acr build `
        --registry $acrName `
        --image "ocr-translation-frontend:$ImageTag" `
        --file "$appRoot/frontend/Dockerfile" `
        "$appRoot/frontend"
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to build frontend image"
    }
    
    Write-Host "[OK] Frontend image built successfully" -ForegroundColor Green
    
    # Build Backend using ACR Task
    Write-Host "`n[INFO] Building backend image in ACR..." -ForegroundColor Yellow
    az acr build `
        --registry $acrName `
        --image "ocr-translation-backend:$ImageTag" `
        --file "$appRoot/backend/Dockerfile" `
        "$appRoot/backend"
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to build backend image"
    }
    
    Write-Host "[OK] Backend image built successfully" -ForegroundColor Green
    
    # Deploy to Container Apps
    Write-Host "`n[INFO] Deploying to Azure Container Apps..." -ForegroundColor Yellow
    
    & "$scriptDir\deploy-app.ps1" `
        -ResourceGroup $ResourceGroup `
        -UniqueSuffix $UniqueSuffix `
        -Location $Location `
        -FrontendImageTag $ImageTag `
        -BackendImageTag $ImageTag
    
    if ($LASTEXITCODE -ne 0) {
        throw "Deployment failed"
    }
    
    Write-Host "`n[SUCCESS] Build and deployment completed successfully!" -ForegroundColor Green
    
} catch {
    Write-Host "`n[ERROR] Build and deployment failed: $_" -ForegroundColor Red
    exit 1
}
