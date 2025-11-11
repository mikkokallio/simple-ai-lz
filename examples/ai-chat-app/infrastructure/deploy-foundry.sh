#!/bin/bash
# Deploy Azure AI Foundry Project with RBAC configuration
# Usage: ./deploy-foundry.sh <resource-group> <backend-name> <foundry-name> [project-name]

set -e

RESOURCE_GROUP=${1:-rg-ailz-lab}
BACKEND_NAME=${2}
FOUNDRY_NAME=${3}
PROJECT_NAME=${4:-agents-project}

if [ -z "$BACKEND_NAME" ] || [ -z "$FOUNDRY_NAME" ]; then
  echo "Usage: $0 <resource-group> <backend-name> <foundry-name> [project-name]"
  echo "Example: $0 rg-ailz-lab aca-ai-chat-backend-ezle7syi foundry-ezle7syi"
  exit 1
fi

echo "🔍 Getting backend Container App principal ID..."
BACKEND_PRINCIPAL_ID=$(az containerapp show \
  --name "$BACKEND_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "identity.principalId" -o tsv)

if [ -z "$BACKEND_PRINCIPAL_ID" ]; then
  echo "❌ Failed to get backend principal ID. Is the backend deployed with managed identity?"
  exit 1
fi

echo "✅ Backend principal ID: $BACKEND_PRINCIPAL_ID"

echo "🚀 Deploying Foundry infrastructure..."
DEPLOYMENT_NAME="foundry-$(date +%Y%m%d-%H%M%S)"
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --template-file "$(dirname "$0")/foundry-project.bicep" \
  --parameters \
    aiFoundryName="$FOUNDRY_NAME" \
    aiProjectName="$PROJECT_NAME" \
    backendPrincipalId="$BACKEND_PRINCIPAL_ID"

echo "✅ Foundry deployed successfully"

echo "🔍 Getting project endpoint..."
PROJECT_ENDPOINT=$(az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --query "properties.outputs.projectEndpoint.value" -o tsv)

if [ -z "$PROJECT_ENDPOINT" ]; then
  echo "❌ Failed to get project endpoint from deployment"
  exit 1
fi

echo "✅ Project endpoint: $PROJECT_ENDPOINT"

echo "🔧 Updating backend Container App..."
az containerapp update \
  --name "$BACKEND_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --set-env-vars "AI_FOUNDRY_PROJECT_ENDPOINT=$PROJECT_ENDPOINT"

echo "✅ Backend updated with project endpoint"

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📋 Summary:"
echo "  - Foundry Resource: $FOUNDRY_NAME"
echo "  - Project: $PROJECT_NAME"
echo "  - Endpoint: $PROJECT_ENDPOINT"
echo "  - RBAC: Azure AI User role assigned to $BACKEND_NAME"
echo ""
echo "⏰ Note: RBAC propagation can take 2-10 minutes."
echo "   Agent operations may return 401 errors until propagation completes."
echo ""
echo "🔗 Next steps:"
echo "  1. Create agents in Azure AI Foundry portal: https://ai.azure.com"
echo "  2. Wait 5 minutes for RBAC to propagate"
echo "  3. Test agent discovery: POST https://<backend-url>/api/agents/discover"
