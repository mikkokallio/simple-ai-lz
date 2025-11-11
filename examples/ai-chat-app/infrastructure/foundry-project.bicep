// Azure AI Foundry Project Infrastructure
// This template creates an AI Foundry resource with a project for agent development

@description('Name of the AI Foundry resource (must be globally unique)')
param aiFoundryName string

@description('Name of the AI Foundry project')
param aiProjectName string = '${aiFoundryName}-proj'

@description('Azure region for deployment')
param location string = resourceGroup().location

@description('Model deployment name')
param modelDeploymentName string = 'gpt-4o'

@description('Model name to deploy')
param modelName string = 'gpt-4o'

@description('Model deployment capacity')
param modelCapacity int = 1

@description('Principal ID of the backend Container App managed identity')
param backendPrincipalId string = ''

// AI Foundry resource (variant of CognitiveServices/account)
// This is the parent resource that enables project management
resource aiFoundry 'Microsoft.CognitiveServices/accounts@2025-04-01-preview' = {
  name: aiFoundryName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'S0'
  }
  kind: 'AIServices'
  properties: {
    // Required to work in AI Foundry portal and enable project creation
    allowProjectManagement: true
    // Defines developer API endpoint subdomain
    customSubDomainName: aiFoundryName
    // Use managed identity for authentication
    disableLocalAuth: true
  }
  tags: {
    Application: 'ai-chat'
    Component: 'foundry'
  }
}

// AI Foundry Project
// Projects group inputs and outputs for a specific use case
// Advisable to create one project right away for development teams
// Projects have individual RBAC permissions and identities
resource aiProject 'Microsoft.CognitiveServices/accounts/projects@2025-04-01-preview' = {
  name: aiProjectName
  parent: aiFoundry
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {}
  tags: {
    Application: 'ai-chat'
    Component: 'foundry-project'
  }
}

// Deploy a model for use in agents and playground
resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: aiFoundry
  name: modelDeploymentName
  sku: {
    capacity: modelCapacity
    name: 'GlobalStandard'
  }
  properties: {
    model: {
      name: modelName
      format: 'OpenAI'
    }
  }
}

// Role: Azure AI User - Required for agent operations
// This role grants the backend permission to list, create, and manage agents
var azureAIUserRoleId = '53ca6127-db72-4b80-b1b0-d745d6d5456d'

resource backendToProjectRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(backendPrincipalId)) {
  name: guid(aiProject.id, backendPrincipalId, azureAIUserRoleId)
  scope: aiProject
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAIUserRoleId)
    principalId: backendPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Outputs for use in application configuration
@description('The endpoint for the AI Foundry project')
output projectEndpoint string = 'https://${aiFoundry.properties.customSubDomainName}.services.ai.azure.com/api/projects/${aiProject.name}'

@description('The AI Foundry resource name')
output foundryResourceName string = aiFoundry.name

@description('The AI Foundry project name')
output projectName string = aiProject.name

@description('The project principal ID for RBAC assignments')
output projectPrincipalId string = aiProject.identity.principalId

@description('The model deployment name')
output modelDeploymentName string = modelDeployment.name
