# Finlex Ingestion Pipeline Deployment Script
param(
    [string]$ResourceGroup = "rg-ailz-lab",
    [string]$RegistryName = "acrezle7syiailz",
    [string]$ImageName = "finlex-ingestion",
    [string]$ImageTag = "latest",
    [string]$TargetYears = "2024,2025",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Finlex Ingestion Pipeline Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get current directory (examples/finlex-ingestion)
$ScriptDir = $PSScriptRoot
Write-Host "Working directory: $ScriptDir" -ForegroundColor Gray

# Build and push container image
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "Step 1: Building container image..." -ForegroundColor Yellow
    Write-Host "Registry: $RegistryName" -ForegroundColor Gray
    Write-Host "Image: ${ImageName}:${ImageTag}" -ForegroundColor Gray
    
    az acr build `
        --registry $RegistryName `
        --image "${ImageName}:${ImageTag}" `
        --file "$ScriptDir/Dockerfile" `
        $ScriptDir
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Container build failed"
        exit 1
    }
    
    Write-Host "Container image built and pushed successfully" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Step 1: Skipping container build (using existing image)" -ForegroundColor Yellow
}

# Get deployment outputs for resource IDs
Write-Host ""
Write-Host "Step 2: Retrieving infrastructure information..." -ForegroundColor Yellow

$containerAppsEnvId = az containerapp env show -n cae-ailz-ezle7syi -g $ResourceGroup --query "id" -o tsv
$azureOpenAiEndpoint = az cognitiveservices account show -n foundry-ezle7syi -g $ResourceGroup --query "properties.endpoint" -o tsv
$searchEndpoint = "https://srch-ailz-ezle7syi.search.windows.net"

Write-Host "Container Apps Environment: $containerAppsEnvId" -ForegroundColor Gray
Write-Host "Azure OpenAI Endpoint: $azureOpenAiEndpoint" -ForegroundColor Gray
Write-Host "AI Search Endpoint: $searchEndpoint" -ForegroundColor Gray

# Check if embedding deployment exists
Write-Host ""
Write-Host "Step 3: Checking embedding model deployment..." -ForegroundColor Yellow

$embeddingDeployment = az cognitiveservices account deployment show `
    -n foundry-ezle7syi `
    -g $ResourceGroup `
    --deployment-name "text-embedding-3-small" `
    --query "name" `
    -o tsv 2>$null

if (-not $embeddingDeployment) {
    Write-Host "WARNING: text-embedding-3-small deployment not found!" -ForegroundColor Red
    Write-Host "Creating embedding model deployment..." -ForegroundColor Yellow
    
    az cognitiveservices account deployment create `
        -n foundry-ezle7syi `
        -g $ResourceGroup `
        --deployment-name text-embedding-3-small `
        --model-name text-embedding-3-small `
        --model-version "1" `
        --model-format OpenAI `
        --sku-capacity 120 `
        --sku-name "GlobalStandard"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Embedding model deployed successfully" -ForegroundColor Green
    } else {
        Write-Warning "Failed to deploy embedding model. Please deploy manually."
    }
} else {
    Write-Host "Embedding deployment found: text-embedding-3-small" -ForegroundColor Green
}

# Get AI Search admin key
Write-Host ""
Write-Host "Step 4: Retrieving AI Search admin key..." -ForegroundColor Yellow

$searchKey = az search admin-key show `
    --resource-group $ResourceGroup `
    --service-name "srch-ailz-ezle7syi" `
    --query "primaryKey" `
    -o tsv

if (-not $searchKey) {
    Write-Error "Failed to retrieve AI Search admin key"
    exit 1
}

Write-Host "AI Search key retrieved" -ForegroundColor Gray

# Deploy Container Apps Job
Write-Host ""
Write-Host "Step 5: Deploying Container Apps Job..." -ForegroundColor Yellow
Write-Host "Target years: $TargetYears" -ForegroundColor Gray

$finlexUrl = "https://data.finlex.fi/download/kaikki"

az deployment group create `
    --resource-group $ResourceGroup `
    --template-file "$ScriptDir/infrastructure/job.bicep" `
    --parameters `
        jobName="finlex-ingestion-job" `
        location="swedencentral" `
        containerAppsEnvironmentId="$containerAppsEnvId" `
        containerRegistryName="$RegistryName" `
        imageName="$ImageName" `
        imageTag="$ImageTag" `
        targetYears="$TargetYears" `
        finlexUrl="$finlexUrl" `
        azureOpenAiEndpoint="$azureOpenAiEndpoint" `
        azureSearchEndpoint="$searchEndpoint" `
        azureSearchKey="$searchKey"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Job deployment failed"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Container Apps Job: finlex-ingestion-job" -ForegroundColor Cyan
Write-Host "Schedule: Daily at 1 AM UTC" -ForegroundColor Cyan
Write-Host "Target Years: $TargetYears" -ForegroundColor Cyan
Write-Host ""
Write-Host "To manually trigger the job:" -ForegroundColor Yellow
Write-Host "  az containerapp job start -n finlex-ingestion-job -g $ResourceGroup" -ForegroundColor Gray
Write-Host ""
Write-Host "To view job execution history:" -ForegroundColor Yellow
Write-Host "  az containerapp job execution list -n finlex-ingestion-job -g $ResourceGroup -o table" -ForegroundColor Gray
Write-Host ""
Write-Host "To view logs from last execution:" -ForegroundColor Yellow
Write-Host "  az containerapp job logs show -n finlex-ingestion-job -g $ResourceGroup" -ForegroundColor Gray
