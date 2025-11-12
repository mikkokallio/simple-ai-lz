// Azure AI Search service for Finlex document indexing with vector search
param searchServiceName string
param location string = resourceGroup().location
param tags object = {}

@description('SKU for the search service')
@allowed([
  'free'
  'basic'
  'standard'
  'standard2'
  'standard3'
  'storage_optimized_l1'
  'storage_optimized_l2'
])
param sku string = 'basic'

@description('Replica count')
@minValue(1)
@maxValue(12)
param replicaCount int = 1

@description('Partition count')
@minValue(1)
@maxValue(12)
param partitionCount int = 1

@description('Enable semantic search')
param semanticSearch string = 'disabled' // 'free' or 'standard' to enable

resource searchService 'Microsoft.Search/searchServices@2023-11-01' = {
  name: searchServiceName
  location: location
  tags: tags
  sku: {
    name: sku
  }
  properties: {
    replicaCount: replicaCount
    partitionCount: partitionCount
    hostingMode: 'default'
    publicNetworkAccess: 'enabled'
    semanticSearch: semanticSearch
  }
  identity: {
    type: 'SystemAssigned'
  }
}

output searchServiceId string = searchService.id
output searchServiceName string = searchService.name
output searchServiceEndpoint string = 'https://${searchService.name}.search.windows.net'
output searchServicePrincipalId string = searchService.identity.principalId
