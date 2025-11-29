using './app.bicep'

// v11 Infrastructure references
param location = 'swedencentral'
param uniqueSuffix = 'demo11'
param containerAppsEnvironmentId = '/subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-demo-v11/providers/Microsoft.App/managedEnvironments/cae-ailz-demo11'
param containerRegistryName = 'acrdemo11gvfyvq'
param cosmosAccountName = 'cosmos-demo11-gvfyvq'
param azureOpenAIEndpoint = 'https://aif-demo11-gvfyvq.cognitiveservices.azure.com/'

// Cosmos DB configuration
param cosmosDatabaseName = 'adventureCreator'
param cosmosContainerName = 'adventures'

// Azure OpenAI deployments
param azureOpenAIDeploymentGPT4 = 'gpt-4o'
param azureOpenAIDeploymentDALLE = 'dall-e-3'
param azureOpenAIAPIVersion = '2024-07-01'

// Container image tags
param backendImageTag = 'latest'
param frontendImageTag = 'latest'
