#!/bin/bash

# AI Chat Application - Development Startup Script

echo "🚀 Starting AI Chat Application..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env with your Azure credentials before continuing."
    exit 1
fi

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI not found. Please install it first."
    exit 1
fi

# Check Azure login status
if ! az account show &> /dev/null; then
    echo "🔐 Not logged in to Azure. Running 'az login'..."
    az login
fi

echo "✅ Azure authentication OK"

# Start with Docker Compose
echo "🐳 Starting services with Docker Compose..."
docker-compose up --build

# Cleanup on exit
trap "docker-compose down" EXIT
