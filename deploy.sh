#!/bin/bash
# ============================================================================
# Azure AI Landing Zone - Simple Deployment Script
# ============================================================================
# This script deploys the MVP infrastructure using Azure CLI
#
# Prerequisites:
# - Azure CLI installed and authenticated (az login)
# - Bash shell (Git Bash on Windows, native on Linux/Mac)
#
# Usage:
#   ./deploy.sh
# ============================================================================

set -e  # Exit on error

echo "============================================================================"
echo "Azure AI Landing Zone - MVP Deployment"
echo "============================================================================"
echo ""

# Check if logged in
echo "Checking Azure login status..."
if ! az account show &>/dev/null; then
    echo "Not logged in. Running 'az login'..."
    az login
fi

ACCOUNT=$(az account show --output json)
echo "Logged in as: $(echo $ACCOUNT | jq -r '.user.name')"
echo "Subscription: $(echo $ACCOUNT | jq -r '.name')"
echo ""

# Deploy
echo "Starting deployment..."
echo "This will take approximately 15-20 minutes."
echo ""

DEPLOYMENT_NAME="ailz-mvp-$(date +%Y%m%d-%H%M%S)"

az deployment sub create \
  --name "$DEPLOYMENT_NAME" \
  --location swedencentral \
  --template-file main.bicep \
  --parameters main.bicepparam \
  --output table

echo ""
echo "============================================================================"
echo "Deployment Complete!"
echo "============================================================================"
echo ""

# Show outputs
echo "Deployment Outputs:"
az deployment sub show \
  --name "$DEPLOYMENT_NAME" \
  --query properties.outputs \
  --output json

echo ""
echo "To view resources:"
echo "  az resource list --resource-group rg-ailz-lab --output table"
echo ""
