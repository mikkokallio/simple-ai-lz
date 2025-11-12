#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy Finlex Azure Functions pipeline
.DESCRIPTION
    Deploys Function App infrastructure and code using Bicep and Azure CLI
.PARAMETER TargetYears
    Comma-separated list of years to process (default: "2024,2025")
#>

param(
    [string]$TargetYears = "2024,2025"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Finlex Functions Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$resourceGroup = "rg-ailz-lab"
$location = "swedencentral"
$storageAccountName = "stailzezle7syi"
$functionAppName = "func-finlex-ingestion"
$openAiEndpoint = "https://foundry-ezle7syi.cognitiveservices.azure.com/"
$searchEndpoint = "https://srch-ailz-ezle7syi.search.windows.net"

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Resource Group: $resourceGroup"
Write-Host "  Storage Account: $storageAccountName"
Write-Host "  Function App: $functionAppName"
Write-Host "  Target Years: $TargetYears"
Write-Host ""

# Step 1: Deploy infrastructure
Write-Host "Step 1: Deploying infrastructure..." -ForegroundColor Green
try {
    $deploymentName = "finlex-functions-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    
    $deployment = az deployment group create `
        --resource-group $resourceGroup `
        --template-file "infrastructure/main.bicep" `
        --parameters `
            storageAccountName=$storageAccountName `
            functionAppName=$functionAppName `
            targetYears=$TargetYears `
            openAiEndpoint=$openAiEndpoint `
            searchEndpoint=$searchEndpoint `
        --name $deploymentName `
        --output json | ConvertFrom-Json
    
    if ($LASTEXITCODE -ne 0) {
        throw "Infrastructure deployment failed"
    }
    
    $principalId = $deployment.properties.outputs.functionAppPrincipalId.value
    Write-Host "  Infrastructure deployed successfully" -ForegroundColor Green
    Write-Host "  Function App Principal ID: $principalId" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Error "Infrastructure deployment failed: $_"
    exit 1
}

# Step 2: Assign RBAC permissions
Write-Host "Step 2: Configuring RBAC permissions..." -ForegroundColor Green

# Storage Blob Data Contributor (read/write blobs)
Write-Host "  Granting Storage Blob Data Contributor..."
$storageId = "/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/$resourceGroup/providers/Microsoft.Storage/storageAccounts/$storageAccountName"
az role assignment create `
    --assignee $principalId `
    --role "Storage Blob Data Contributor" `
    --scope $storageId `
    --output none

# Cognitive Services User (OpenAI embeddings)
Write-Host "  Granting Cognitive Services User..."
$openAiId = "/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/$resourceGroup/providers/Microsoft.CognitiveServices/accounts/foundry-ezle7syi"
az role assignment create `
    --assignee $principalId `
    --role "Cognitive Services User" `
    --scope $openAiId `
    --output none

# Search Index Data Contributor (AI Search indexing)
Write-Host "  Granting Search Index Data Contributor..."
$searchId = "/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/$resourceGroup/providers/Microsoft.Search/searchServices/srch-ailz-ezle7syi"
az role assignment create `
    --assignee $principalId `
    --role "Search Index Data Contributor" `
    --scope $searchId `
    --output none

Write-Host "  RBAC permissions configured" -ForegroundColor Green
Write-Host ""

# Step 3: Deploy function code
Write-Host "Step 3: Deploying function code..." -ForegroundColor Green
try {
    # Create deployment package
    Write-Host "  Creating deployment package..."
    $tempDir = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
    
    Copy-Item "function_app.py" $tempDir
    Copy-Item "host.json" $tempDir
    Copy-Item "requirements.txt" $tempDir
    
    $zipPath = "$tempDir.zip"
    Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -Force
    
    Write-Host "  Package created: $zipPath"
    
    # Deploy to Function App
    Write-Host "  Deploying to $functionAppName..."
    az functionapp deployment source config-zip `
        --resource-group $resourceGroup `
        --name $functionAppName `
        --src $zipPath `
        --build-remote true `
        --output none
    
    if ($LASTEXITCODE -ne 0) {
        throw "Function code deployment failed"
    }
    
    # Cleanup
    Remove-Item $tempDir -Recurse -Force
    Remove-Item $zipPath -Force
    
    Write-Host "  Function code deployed successfully" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Error "Function code deployment failed: $_"
    exit 1
}

# Step 4: Verify deployment
Write-Host "Step 4: Verifying deployment..." -ForegroundColor Green
$functionApp = az functionapp show `
    --resource-group $resourceGroup `
    --name $functionAppName `
    --output json | ConvertFrom-Json

$functionUrl = "https://$($functionApp.defaultHostName)"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Function App: $functionAppName" -ForegroundColor Yellow
Write-Host "URL: $functionUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "Functions:" -ForegroundColor Yellow
Write-Host "  1. ingest_function - Timer-triggered (daily 2 AM UTC)" -ForegroundColor Gray
Write-Host "     Manually trigger: az functionapp function invoke -g $resourceGroup -n $functionAppName --function-name ingest_function" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. process_function - Blob-triggered (EventGrid)" -ForegroundColor Gray
Write-Host "     Auto-triggered when blobs are created in finlex-raw container" -ForegroundColor Gray
Write-Host ""
Write-Host "Monitor logs:" -ForegroundColor Yellow
Write-Host "  az monitor app-insights component show --app $(($deployment.properties.outputs.appInsightsName.value)) -g $resourceGroup" -ForegroundColor Gray
Write-Host ""
Write-Host "Test ingest function:" -ForegroundColor Yellow
Write-Host "  az functionapp function invoke -g $resourceGroup -n $functionAppName --function-name ingest_function" -ForegroundColor Gray
Write-Host ""
