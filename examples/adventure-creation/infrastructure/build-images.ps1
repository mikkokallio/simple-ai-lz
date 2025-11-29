# Build and push container images to ACR
# Usage: .\build-images.ps1 -RegistryName <registry-name> [-Tag <tag>]

param(
    [Parameter(Mandatory=$true)]
    [string]$RegistryName,
    
    [Parameter(Mandatory=$false)]
    [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"

Write-Host "Building Adventure Creator container images..." -ForegroundColor Cyan
Write-Host "Registry: $RegistryName" -ForegroundColor Yellow
Write-Host "Tag: $Tag" -ForegroundColor Yellow
Write-Host ""

# Get the root directory (parent of infrastructure/)
$rootDir = Split-Path -Parent $PSScriptRoot

# Build backend image
Write-Host "Building backend image..." -ForegroundColor Green
az acr build `
    --registry $RegistryName `
    --image "adventure-creator-backend:$Tag" `
    --file "$rootDir/backend/Dockerfile" `
    "$rootDir/backend"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Backend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Backend build successful!" -ForegroundColor Green
Write-Host ""

# Build frontend image
Write-Host "Building frontend image..." -ForegroundColor Green
az acr build `
    --registry $RegistryName `
    --image "adventure-creator-frontend:$Tag" `
    --file "$rootDir/frontend/Dockerfile" `
    "$rootDir/frontend"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Frontend build successful!" -ForegroundColor Green
Write-Host ""
Write-Host "Both images built successfully!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Images:" -ForegroundColor Yellow
Write-Host "  - ${RegistryName}.azurecr.io/adventure-creator-backend:$Tag" -ForegroundColor White
Write-Host "  - ${RegistryName}.azurecr.io/adventure-creator-frontend:$Tag" -ForegroundColor White
