#!/usr/bin/env pwsh
# ============================================================================
# Build and Deploy OCR & Translation App
# ============================================================================
# Builds Docker images, pushes to ACR, and deploys to Container Apps
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

Write-Host "[INFO] Build and Deploy OCR & Translation App" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$ErrorActionPreference = "Stop"

# Navigate to app root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = Split-Path -Parent $scriptDir
Push-Location $appRoot

try {
    # Get ACR name
    $acrName = "acr$UniqueSuffix"
    
    Write-Host "`n[INFO] Logging in to Azure Container Registry..." -ForegroundColor Yellow
    az acr login --name $acrName
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to login to ACR"
    }
    
    # Build Frontend
    Write-Host "`n[INFO] Building frontend Docker image..." -ForegroundColor Yellow
    docker build -t "$acrName.azurecr.io/ocr-translation-frontend:$ImageTag" ./frontend
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to build frontend image"
    }
    
    Write-Host "[OK] Frontend image built successfully" -ForegroundColor Green
    
    # Build Backend
    Write-Host "`n[INFO] Building backend Docker image..." -ForegroundColor Yellow
    docker build -t "$acrName.azurecr.io/ocr-translation-backend:$ImageTag" ./backend
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to build backend image"
    }
    
    Write-Host "[OK] Backend image built successfully" -ForegroundColor Green
    
    # Push Frontend
    Write-Host "`n[INFO] Pushing frontend image to ACR..." -ForegroundColor Yellow
    docker push "$acrName.azurecr.io/ocr-translation-frontend:$ImageTag"
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to push frontend image"
    }
    
    Write-Host "[OK] Frontend image pushed successfully" -ForegroundColor Green
    
    # Push Backend
    Write-Host "`n[INFO] Pushing backend image to ACR..." -ForegroundColor Yellow
    docker push "$acrName.azurecr.io/ocr-translation-backend:$ImageTag"
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to push backend image"
    }
    
    Write-Host "[OK] Backend image pushed successfully" -ForegroundColor Green
    
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
} finally {
    Pop-Location
}
