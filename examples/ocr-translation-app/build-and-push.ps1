#!/usr/bin/env pwsh
# ============================================================================
# OCR Translation App - Build and Push Container Images
# ============================================================================
# Builds frontend and backend Docker images and pushes to demo ACR
# Requires: VPN connection (ACR is private-only)
# ============================================================================

param(
    [string]$AcrName = "acrdemo08ailz",
    [string]$ResourceGroup = "rg-ailz-demo-v8",
    [string]$ImageTag = "v1",
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "OCR Translation App - Build Container Images" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "ACR:         $AcrName" -ForegroundColor Yellow
Write-Host "Tag:         $ImageTag" -ForegroundColor Yellow
Write-Host ""

# Verify ACR exists
Write-Host "[1/4] Verifying ACR access..." -ForegroundColor Cyan
$acrCheck = az acr show --name $AcrName --resource-group $ResourceGroup 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Cannot access ACR '$AcrName'" -ForegroundColor Red
    Write-Host "Make sure you have permissions and VPN is connected" -ForegroundColor Red
    exit 1
}
Write-Host "ACR access verified" -ForegroundColor Green

# Get script directory and app root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = $scriptDir  # Script is in ocr-translation-app folder

# Build backend
if (-not $FrontendOnly) {
    Write-Host ""
    Write-Host "[2/4] Building backend image..." -ForegroundColor Cyan
    $backendPath = Join-Path $appRoot "backend"
    $backendImage = "$AcrName.azurecr.io/ocr-translation-backend:$ImageTag"
    
    Write-Host "Path:  $backendPath" -ForegroundColor Gray
    Write-Host "Image: $backendImage" -ForegroundColor Gray
    Write-Host ""
    
    az acr build `
        --registry $AcrName `
        --resource-group $ResourceGroup `
        --image "ocr-translation-backend:$ImageTag" `
        --file "$backendPath/Dockerfile" `
        $backendPath
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Backend build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "Backend image built and pushed" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[2/4] Skipping backend (--FrontendOnly)" -ForegroundColor Gray
}

# Build frontend
if (-not $BackendOnly) {
    Write-Host ""
    Write-Host "[3/4] Building frontend image..." -ForegroundColor Cyan
    $frontendPath = Join-Path $appRoot "frontend"
    $frontendImage = "$AcrName.azurecr.io/ocr-translation-frontend:$ImageTag"
    
    Write-Host "Path:  $frontendPath" -ForegroundColor Gray
    Write-Host "Image: $frontendImage" -ForegroundColor Gray
    Write-Host ""
    
    az acr build `
        --registry $AcrName `
        --resource-group $ResourceGroup `
        --image "ocr-translation-frontend:$ImageTag" `
        --file "$frontendPath/Dockerfile" `
        $frontendPath
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Frontend build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "Frontend image built and pushed" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[3/4] Skipping frontend (--BackendOnly)" -ForegroundColor Gray
}

# List images
Write-Host ""
Write-Host "[4/4] Verifying images in ACR..." -ForegroundColor Cyan
az acr repository list --name $AcrName --output table

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Green
Write-Host "BUILD COMPLETE" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Images built:" -ForegroundColor White

if (-not $FrontendOnly) {
    Write-Host "  $AcrName.azurecr.io/ocr-translation-backend:$ImageTag" -ForegroundColor Green
}
if (-not $BackendOnly) {
    Write-Host "  $AcrName.azurecr.io/ocr-translation-frontend:$ImageTag" -ForegroundColor Green
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  cd infrastructure" -ForegroundColor Gray
Write-Host "  .\deploy-to-demo.ps1" -ForegroundColor Gray
Write-Host ""
