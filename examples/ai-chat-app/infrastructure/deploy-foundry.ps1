# Deploy Azure AI Foundry Project with RBAC configuration
# Usage: .\deploy-foundry.ps1 -ResourceGroup <rg> -BackendName <name> -FoundryName <name> [-ProjectName <name>]

param(
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroup = "rg-ailz-lab",
    
    [Parameter(Mandatory=$true)]
    [string]$BackendName,
    
    [Parameter(Mandatory=$true)]
    [string]$FoundryName,
    
    [Parameter(Mandatory=$false)]
    [string]$ProjectName = "agents-project"
)

$ErrorActionPreference = "Stop"

Write-Host "🔍 Getting backend Container App principal ID..." -ForegroundColor Cyan
$BackendPrincipalId = az containerapp show `
    --name $BackendName `
    --resource-group $ResourceGroup `
    --query "identity.principalId" -o tsv

if ([string]::IsNullOrEmpty($BackendPrincipalId)) {
    Write-Host "❌ Failed to get backend principal ID. Is the backend deployed with managed identity?" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Backend principal ID: $BackendPrincipalId" -ForegroundColor Green

Write-Host "🚀 Deploying Foundry infrastructure..." -ForegroundColor Cyan
$DeploymentName = "foundry-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

az deployment group create `
    --resource-group $ResourceGroup `
    --name $DeploymentName `
    --template-file "$ScriptDir\foundry-project.bicep" `
    --parameters `
        aiFoundryName=$FoundryName `
        aiProjectName=$ProjectName `
        backendPrincipalId=$BackendPrincipalId

Write-Host "✅ Foundry deployed successfully" -ForegroundColor Green

Write-Host "🔍 Getting project endpoint..." -ForegroundColor Cyan
$ProjectEndpoint = az deployment group show `
    --resource-group $ResourceGroup `
    --name $DeploymentName `
    --query "properties.outputs.projectEndpoint.value" -o tsv

if ([string]::IsNullOrEmpty($ProjectEndpoint)) {
    Write-Host "❌ Failed to get project endpoint from deployment" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Project endpoint: $ProjectEndpoint" -ForegroundColor Green

Write-Host "🔧 Updating backend Container App..." -ForegroundColor Cyan
az containerapp update `
    --name $BackendName `
    --resource-group $ResourceGroup `
    --set-env-vars "AI_FOUNDRY_PROJECT_ENDPOINT=$ProjectEndpoint"

Write-Host "✅ Backend updated with project endpoint" -ForegroundColor Green

Write-Host ""
Write-Host "🎉 Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Summary:" -ForegroundColor Yellow
Write-Host "  - Foundry Resource: $FoundryName"
Write-Host "  - Project: $ProjectName"
Write-Host "  - Endpoint: $ProjectEndpoint"
Write-Host "  - RBAC: Azure AI User role assigned to $BackendName"
Write-Host ""
Write-Host "⏰ Note: RBAC propagation can take 2-10 minutes." -ForegroundColor Yellow
Write-Host "   Agent operations may return 401 errors until propagation completes."
Write-Host ""
Write-Host "🔗 Next steps:" -ForegroundColor Cyan
Write-Host "  1. Create agents in Azure AI Foundry portal: https://ai.azure.com"
Write-Host "  2. Wait 5 minutes for RBAC to propagate"
Write-Host "  3. Test agent discovery: POST https://<backend-url>/api/agents/discover"
