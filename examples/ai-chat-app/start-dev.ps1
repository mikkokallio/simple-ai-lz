# AI Chat Application - Development Startup Script

Write-Host "🚀 Starting AI Chat Application..." -ForegroundColor Cyan

# Check if .env exists
if (-not (Test-Path .env)) {
    Write-Host "⚠️  .env file not found!" -ForegroundColor Yellow
    Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "⚠️  Please edit .env with your Azure credentials before continuing." -ForegroundColor Yellow
    exit 1
}

# Check if Azure CLI is installed
try {
    $null = az --version
} catch {
    Write-Host "❌ Azure CLI not found. Please install it first." -ForegroundColor Red
    exit 1
}

# Check Azure login status
try {
    $null = az account show 2>$null
    Write-Host "✅ Azure authentication OK" -ForegroundColor Green
} catch {
    Write-Host "🔐 Not logged in to Azure. Running 'az login'..." -ForegroundColor Yellow
    az login
}

# Start with Docker Compose
Write-Host "🐳 Starting services with Docker Compose..." -ForegroundColor Cyan
docker-compose up --build
