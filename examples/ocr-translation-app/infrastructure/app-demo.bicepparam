// ============================================================================
// OCR & Translation App - Demo Environment Parameters
// ============================================================================
// DEPLOYMENT TARGET: rg-ailz-demo-ocr-app (separate app RG)
// LZ INFRASTRUCTURE: rg-ailz-demo-v8 (shared services)
//
// Best Practice: Each app gets its own RG for:
//   - Independent lifecycle management
//   - Easy cleanup/redeployment
//   - RBAC isolation
//   - Cost tracking per app
//
// Uses managed identity for all AI services (except AI Foundry - SDK limitation)
// ============================================================================

using './app.bicep'

// Container Apps Environment (from LZ RG)
param containerAppsEnvironmentId = '/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-demo-v8/providers/Microsoft.App/managedEnvironments/cae-ailz-demo08'

// Application Insights
param appInsightsConnectionString = 'InstrumentationKey=b464f37f-4530-4c0d-b34f-e4ad38ae77bc;IngestionEndpoint=https://swedencentral-0.in.applicationinsights.azure.com/;LiveEndpoint=https://swedencentral.livediagnostics.monitor.azure.com/;ApplicationId=78bd62fd-9cd5-4de9-92b9-b8811f4a1ca9'

// Location and naming
param location = 'swedencentral'
param uniqueSuffix = 'demo08'

// Azure Container Registry
param acrLoginServer = 'acrdemo08ailz.azurecr.io'
param acrUsername = 'acrdemo08ailz'
// NOTE: acrPassword must be provided at deployment time via --parameters or Key Vault reference

// AI Foundry (required - SDK limitation, no managed identity support yet)
param aiFoundryEndpoint = 'https://aif-ailz-demo08.cognitiveservices.azure.com/'
param aiFoundryResourceId = '/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-demo-v8/providers/Microsoft.CognitiveServices/accounts/aif-ailz-demo08'
// NOTE: aiFoundryKey must be provided at deployment time via --parameters or Key Vault reference

// Document Intelligence (uses managed identity via RBAC)
param documentIntelligenceEndpoint = 'https://di-ailz-demo08.cognitiveservices.azure.com/'
param documentIntelligenceResourceId = '/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-demo-v8/providers/Microsoft.CognitiveServices/accounts/di-ailz-demo08'

// Document Translator (uses managed identity via RBAC)
param documentTranslatorEndpoint = 'https://dt-ailz-demo08.cognitiveservices.azure.com/'
param documentTranslatorResourceId = '/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-demo-v8/providers/Microsoft.CognitiveServices/accounts/dt-ailz-demo08'

// Storage Account (uses managed identity via RBAC)
param storageAccountName = 'stailzdemo08'
param storageAccountResourceId = '/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-demo-v8/providers/Microsoft.Storage/storageAccounts/stailzdemo08'

// Azure OpenAI (optional - can use AI Foundry instead)
// Not configured in demo environment - using AI Foundry for all AI capabilities
param azureOpenAIEndpoint = ''
param azureOpenAIResourceId = ''

// Container Images (will be built and pushed to demo ACR)
param frontendImage = 'acrdemo08ailz.azurecr.io/ocr-translation-frontend:v1'
param backendImage = 'acrdemo08ailz.azurecr.io/ocr-translation-backend:v1'
