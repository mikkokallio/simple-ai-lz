# Adventure Creator Deployment Script
# Deploys Container Apps with proper configuration and role assignments

param(
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroup = "rg-ailz-demo-v11"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Adventure Creator Deployment ===" -ForegroundColor Cyan
Write-Host "Resource Group: $ResourceGroup" -ForegroundColor Yellow
Write-Host ""

# Deploy Container Apps
Write-Host "Deploying Container Apps..." -ForegroundColor Green
az deployment group create `
    --resource-group $ResourceGroup `
    --template-file app.bicep `
    --parameters app.bicepparam `
    --name "adventure-apps-$(Get-Date -Format 'yyyyMMddHHmmss')"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Deployment successful!" -ForegroundColor Green
Write-Host ""

# Get app URLs
$backendUrl = az containerapp show --name ca-adventure-backend-demo11 --resource-group $ResourceGroup --query "properties.configuration.ingress.fqdn" -o tsv
$frontendUrl = az containerapp show --name ca-adventure-frontend-demo11 --resource-group $ResourceGroup --query "properties.configuration.ingress.fqdn" -o tsv

Write-Host "=== Deployment Complete ===" -ForegroundColor Cyan
Write-Host "Backend:  https://$backendUrl" -ForegroundColor White
Write-Host "Frontend: https://$frontendUrl" -ForegroundColor White
Write-Host ""
Write-Host "Note: RBAC propagation may take up to 5 minutes." -ForegroundColor Yellow
Write-Host "If image pull fails, wait and the app will auto-retry." -ForegroundColor Yellow
