# Two-Phase Container App Deployment
# Phase 1: Deploy stub apps with dummy images to create MIs and assign roles
# Phase 2: Wait for RBAC propagation, then update with real images

param(
    [string]$ResourceGroup = "rg-ailz-demo-v11",
    [int]$WaitSeconds = 120
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Two-Phase Container App Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if apps already exist
Write-Host "Checking for existing Container Apps..." -ForegroundColor Yellow
$ErrorActionPreference = "SilentlyContinue"
$backendExists = az containerapp show --name ca-adventure-backend-demo11 --resource-group $ResourceGroup --query "name" -o tsv 2>$null
$frontendExists = az containerapp show --name ca-adventure-frontend-demo11 --resource-group $ResourceGroup --query "name" -o tsv 2>$null
$ErrorActionPreference = "Stop"

if ($backendExists -or $frontendExists) {
    Write-Host "Container Apps already exist. Deleting them first..." -ForegroundColor Yellow
    
    if ($backendExists) {
        Write-Host "  Deleting ca-adventure-backend-demo11..." -ForegroundColor Yellow
        az containerapp delete --name ca-adventure-backend-demo11 --resource-group $ResourceGroup --yes
    }
    
    if ($frontendExists) {
        Write-Host "  Deleting ca-adventure-frontend-demo11..." -ForegroundColor Yellow
        az containerapp delete --name ca-adventure-frontend-demo11 --resource-group $ResourceGroup --yes
    }
    
    Write-Host "  Waiting 30 seconds for deletion to complete..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
}

# Phase 1: Deploy stub apps
Write-Host ""
Write-Host "PHASE 1: Deploying stub apps with dummy images..." -ForegroundColor Green
Write-Host "This creates Managed Identities and assigns ACR Pull + Cosmos DB roles" -ForegroundColor Gray
Write-Host ""

az deployment group create `
    --resource-group $ResourceGroup `
    --template-file app-stub.bicep `
    --parameters app-stub.bicepparam `
    --name adventure-apps-stub

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Phase 1 deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✓ Phase 1 complete: Apps created with dummy images" -ForegroundColor Green

# Get principal IDs
Write-Host ""
Write-Host "Getting backend MI principal ID..." -ForegroundColor Yellow
$backendPrincipalId = az deployment group show `
    --resource-group $ResourceGroup `
    --name adventure-apps-stub `
    --query "properties.outputs.backendPrincipalId.value" `
    -o tsv

if (-not $backendPrincipalId) {
    Write-Host "ERROR: Failed to get backend principal ID!" -ForegroundColor Red
    exit 1
}

Write-Host "Backend MI Principal ID: $backendPrincipalId" -ForegroundColor Cyan

# Assign Azure OpenAI role (can't be done in Bicep easily)
Write-Host ""
Write-Host "Assigning 'Cognitive Services OpenAI User' role to backend..." -ForegroundColor Yellow

$roleResult = az role assignment create `
    --assignee $backendPrincipalId `
    --role "Cognitive Services OpenAI User" `
    --scope /subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-demo-v11/providers/Microsoft.CognitiveServices/accounts/aif-demo11-gvfyvq `
    2>&1

if ($LASTEXITCODE -eq 0 -or $roleResult -match "already exists") {
    Write-Host "✓ Azure OpenAI role assigned" -ForegroundColor Green
} else {
    Write-Host "WARNING: Role assignment may have failed, but continuing..." -ForegroundColor Yellow
}

# Phase 2: Wait for RBAC propagation
Write-Host ""
Write-Host "PHASE 2: Waiting $WaitSeconds seconds for RBAC propagation..." -ForegroundColor Green
Write-Host "Azure RBAC changes can take 1-2 minutes to propagate globally" -ForegroundColor Gray

for ($i = $WaitSeconds; $i -gt 0; $i--) {
    Write-Host "`r  Remaining: $i seconds   " -NoNewline -ForegroundColor Yellow
    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host ""
Write-Host "✓ RBAC propagation wait complete" -ForegroundColor Green

# Phase 3: Deploy real apps
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PHASE 3: Deploying real apps with production images..." -ForegroundColor Green
Write-Host "Now that roles are assigned and propagated, ACR pull should work" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$deployResult = az deployment group create `
    --resource-group $ResourceGroup `
    --template-file app.bicep `
    --parameters app.bicepparam `
    --name adventure-apps-real

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERROR: Phase 3 deployment failed!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "The stub apps remain deployed. You can manually troubleshoot and retry." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Get app URLs
$backendUrl = az containerapp show `
    --name ca-adventure-backend-demo11 `
    --resource-group $ResourceGroup `
    --query "properties.configuration.ingress.fqdn" `
    -o tsv

$frontendUrl = az containerapp show `
    --name ca-adventure-frontend-demo11 `
    --resource-group $ResourceGroup `
    --query "properties.configuration.ingress.fqdn" `
    -o tsv

Write-Host "Backend URL:  https://$backendUrl" -ForegroundColor Cyan
Write-Host "Frontend URL: https://$frontendUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test backend health: https://$backendUrl/health" -ForegroundColor Gray
Write-Host ""
Write-Host "Note: Apps are in private VNet. Access via VPN required." -ForegroundColor Yellow
