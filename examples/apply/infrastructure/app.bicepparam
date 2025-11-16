// ============================================================================
// AppLy - Job Application Assistant Parameters
// ============================================================================
// INSTRUCTIONS: Update these parameters with values from your landing zone
// deployment before deploying. You can get these values from:
// 1. Azure Portal (navigate to resource groups and resources)
// 2. Previous deployment outputs (deployment-outputs.json)
// 3. Azure CLI: az resource show --ids <resource-id>
// ============================================================================

using './app.bicep'

// ============================================================================
// Required Parameters - UPDATE THESE
// ============================================================================

// Get from: az containerapp env list -o table
param containerAppsEnvironmentId = '/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-lab/providers/Microsoft.App/managedEnvironments/cae-ailz-ezle7syi'

// Get from: az monitor app-insights component show --app <name> --resource-group <rg-name> --query connectionString -o tsv
param appInsightsConnectionString = 'InstrumentationKey=8bd8efbc-f4c6-4472-993f-9e5b20e46c98;IngestionEndpoint=https://swedencentral-0.in.applicationinsights.azure.com/;LiveEndpoint=https://swedencentral.livediagnostics.monitor.azure.com/;ApplicationId=3a216fe1-ee4c-4f61-9e7d-713f239b75f7'

// Get from: uniqueSuffix used in main landing zone deployment
param uniqueSuffix = 'ezle7syi'

// SECURITY: DO NOT commit actual secrets! Get these values at deployment time:
// az acr credential show --name <acr-name> --query passwords[0].value -o tsv
param acrPassword = '<GET_FROM_KEYVAULT_OR_CLI>'

// Get from: az cognitiveservices account show --name <ai-foundry-name> --resource-group <rg-name> --query properties.endpoint -o tsv
param aiFoundryEndpoint = 'https://foundry-ezle7syi.cognitiveservices.azure.com/'

// SECURITY: DO NOT commit actual secrets! Get these values at deployment time:
// az cognitiveservices account keys list --name <ai-foundry-name> --resource-group <rg-name> --query key1 -o tsv
param aiFoundryKey = '<GET_FROM_KEYVAULT_OR_CLI>'

// Get from: az cognitiveservices account show --name <doc-intel-name> --resource-group <rg-name> --query properties.endpoint -o tsv
param documentIntelligenceEndpoint = 'https://di-ailz-ezle7syi.cognitiveservices.azure.com/'

// Get from: az storage account list -o table (look for storage account created in landing zone)
param storageAccountName = 'stailzezle7syi'

// Get from: az storage account show --name <storage-name> --resource-group <rg-name> --query id -o tsv
param storageAccountResourceId = '/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-lab/providers/Microsoft.Storage/storageAccounts/stailzezle7syi'

// Get from: az cosmosdb list -o table (look for Cosmos DB account created in landing zone)
param cosmosDbAccountName = 'cosmos-ailz-ezle7syi'

// ============================================================================
// Optional Parameters - UPDATE IF AVAILABLE
// ============================================================================

// Get from: az cognitiveservices account show --name <ai-foundry-name> --resource-group <rg-name> --query id -o tsv
param aiFoundryResourceId = '/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-lab/providers/Microsoft.CognitiveServices/accounts/foundry-ezle7syi'

// Get from: az cognitiveservices account show --name <doc-intel-name> --resource-group <rg-name> --query id -o tsv
param documentIntelligenceResourceId = '/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-lab/providers/Microsoft.CognitiveServices/accounts/di-ailz-ezle7syi'

// ============================================================================
// EXAMPLE: How to get values from an existing OCR-translation deployment
// ============================================================================
// If you already have the OCR-translation app deployed, you can copy many
// values from its deployment by looking at the container app environment
// variables:
//
// az containerapp show --name aca-ocr-trans-backend-<uniquesuffix> --resource-group <rg-name> --query properties.template.containers[0].env -o table
//
// This will show you:
// - AI_FOUNDRY_ENDPOINT
// - DOCUMENT_INTELLIGENCE_ENDPOINT
// - STORAGE_ACCOUNT_NAME
// - APPLICATIONINSIGHTS_CONNECTION_STRING (partial - get full from App Insights)
// ============================================================================
