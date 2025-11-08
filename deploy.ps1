# ============================================================================
# Azure AI Landing Zone - MVP Deployment Script
# ============================================================================
# This script deploys the MVP infrastructure to Azure
# 
# Prerequisites:
# - Azure CLI installed and authenticated (az login)
# - PowerShell 5.1 or later
# - Appropriate Azure permissions (Contributor or Owner)
#
# Usage:
#   .\deploy.ps1
#
# ============================================================================

# Error handling
$ErrorActionPreference = "Stop"

# ============================================================================
# CONFIGURATION
# ============================================================================

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "Azure AI Landing Zone - MVP Deployment" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# Check if Azure CLI is installed
try {
    $azVersion = az version --output json | ConvertFrom-Json
    Write-Host "[OK] Azure CLI version: $($azVersion.'azure-cli')" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Azure CLI is not installed or not in PATH" -ForegroundColor Red
    Write-Host "  Please install Azure CLI: https://docs.microsoft.com/cli/azure/install-azure-cli" -ForegroundColor Yellow
    exit 1
}

# Check if logged in to Azure
Write-Host ""
Write-Host "Checking Azure login status..." -ForegroundColor Yellow
try {
    $account = az account show --output json | ConvertFrom-Json
    Write-Host "[OK] Logged in as: $($account.user.name)" -ForegroundColor Green
    Write-Host "[OK] Subscription: $($account.name) ($($account.id))" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Not logged in to Azure" -ForegroundColor Red
    Write-Host "  Running 'az login'..." -ForegroundColor Yellow
    az login
    $account = az account show --output json | ConvertFrom-Json
    Write-Host "[OK] Logged in successfully" -ForegroundColor Green
}

# ============================================================================
# PARAMETER COLLECTION
# ============================================================================

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "Deployment Parameters" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan

# Owner email
$ownerEmail = Read-Host "Enter your email address for resource tagging"
if ([string]::IsNullOrWhiteSpace($ownerEmail)) {
    Write-Host "[ERROR] Email address is required" -ForegroundColor Red
    exit 1
}

# Location
Write-Host ""
Write-Host "Recommended location for AI services:" -ForegroundColor Yellow
Write-Host "  - swedencentral (recommended - modern DC with full AI capacity)" -ForegroundColor Gray
Write-Host ""
Write-Host "Note: westeurope and northeurope are NOT recommended (capacity constraints)" -ForegroundColor Yellow
$location = Read-Host "Enter Azure region (default: swedencentral)"
if ([string]::IsNullOrWhiteSpace($location)) {
    $location = "swedencentral"
}

# Confirmation
Write-Host ""
Write-Host "Deployment Configuration:" -ForegroundColor Cyan
Write-Host "  Owner Email: $ownerEmail" -ForegroundColor White
Write-Host "  Location: $location" -ForegroundColor White
Write-Host "  Subscription: $($account.name)" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Proceed with deployment? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Deployment cancelled" -ForegroundColor Yellow
    exit 0
}

# ============================================================================
# DEPLOYMENT
# ============================================================================

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "Starting Deployment" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

$deploymentName = "ailz-mvp-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

Write-Host "Running what-if analysis..." -ForegroundColor Yellow
Write-Host ""

try {
    az deployment sub what-if `
        --name $deploymentName `
        --location $location `
        --template-file "main.bicep" `
        --parameters "main.bicepparam" `
        --parameters "ownerEmail=$ownerEmail" "location=$location"
    
    Write-Host ""
    Write-Host "What-if analysis complete" -ForegroundColor Green
    Write-Host ""
    
    $confirmDeploy = Read-Host "Continue with actual deployment? (yes/no)"
    if ($confirmDeploy -ne "yes") {
        Write-Host "Deployment cancelled" -ForegroundColor Yellow
        exit 0
    }
} catch {
    Write-Host "✗ What-if analysis failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Starting deployment (this may take 15-20 minutes)..." -ForegroundColor Yellow
Write-Host ""

try {
    $startTime = Get-Date
    
    az deployment sub create `
        --name $deploymentName `
        --location $location `
        --template-file "main.bicep" `
        --parameters "main.bicepparam" `
        --parameters "ownerEmail=$ownerEmail" "location=$location" `
        --output json | Out-Null
    
    $endTime = Get-Date
    $duration = $endTime - $startTime
    
    Write-Host ""
    Write-Host "============================================================================" -ForegroundColor Green
    Write-Host "Deployment Successful!" -ForegroundColor Green
    Write-Host "============================================================================" -ForegroundColor Green
    Write-Host "Duration: $($duration.Minutes) minutes $($duration.Seconds) seconds" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "============================================================================" -ForegroundColor Red
    Write-Host "Deployment Failed" -ForegroundColor Red
    Write-Host "============================================================================" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# ============================================================================
# RETRIEVE OUTPUTS
# ============================================================================

Write-Host "Retrieving deployment outputs..." -ForegroundColor Yellow
Write-Host ""

try {
    $outputs = az deployment sub show `
        --name $deploymentName `
        --query properties.outputs `
        --output json | ConvertFrom-Json
    
    Write-Host "============================================================================" -ForegroundColor Cyan
    Write-Host "Deployment Outputs" -ForegroundColor Cyan
    Write-Host "============================================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Resource Group:" -ForegroundColor Yellow
    Write-Host "  Name: $($outputs.resourceGroupName.value)" -ForegroundColor White
    Write-Host ""
    Write-Host "Container Apps Environment:" -ForegroundColor Yellow
    Write-Host "  Default Domain: $($outputs.containerAppsDefaultDomain.value)" -ForegroundColor White
    Write-Host "  Static IP: $($outputs.containerAppsStaticIp.value)" -ForegroundColor White
    Write-Host ""
    Write-Host "Storage Account:" -ForegroundColor Yellow
    Write-Host "  Name: $($outputs.storageAccountName.value)" -ForegroundColor White
    Write-Host ""
    Write-Host "Key Vault:" -ForegroundColor Yellow
    Write-Host "  Name: $($outputs.keyVaultName.value)" -ForegroundColor White
    Write-Host "  URI: $($outputs.keyVaultUri.value)" -ForegroundColor White
    Write-Host ""
    Write-Host "Monitoring:" -ForegroundColor Yellow
    Write-Host "  Application Insights: Configured" -ForegroundColor White
    Write-Host ""
    Write-Host "Network:" -ForegroundColor Yellow
    Write-Host "  VNet: $($outputs.vnetName.value)" -ForegroundColor White
    Write-Host ""
    
    # Save outputs to file
    $outputsFile = "deployment-outputs.json"
    $outputs | ConvertTo-Json -Depth 10 | Out-File $outputsFile
    Write-Host "Outputs saved to: $outputsFile" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "Warning: Could not retrieve deployment outputs" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Yellow
}

# ============================================================================
# NEXT STEPS
# ============================================================================

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "Next Steps" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your AI Landing Zone MVP is now deployed!" -ForegroundColor Green
Write-Host ""
Write-Host "To verify the deployment:" -ForegroundColor Yellow
Write-Host "  1. Open Azure Portal: https://portal.azure.com" -ForegroundColor White
Write-Host "  2. Navigate to Resource Group: $($outputs.resourceGroupName.value)" -ForegroundColor White
Write-Host "  3. Review the deployed resources" -ForegroundColor White
Write-Host ""
Write-Host "To deploy a test container app:" -ForegroundColor Yellow
Write-Host "  See: examples\hello-world-app.bicep" -ForegroundColor White
Write-Host ""
Write-Host "To configure application authentication:" -ForegroundColor Yellow
Write-Host "  See: app_authentication_guide.md" -ForegroundColor White
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
