// Main orchestrator for multi-stage pipeline infrastructure
targetScope = 'resourceGroup'

param location string = resourceGroup().location
param environmentName string
param containerRegistryName string
param storageAccountName string
param searchEndpoint string
param searchIndexName string = 'finlex-multi-index'
param openAiEndpoint string
param openAiDeployment string = 'text-embedding-3-small'
param embeddingDimensions int = 1536
param targetYears string = '2024,2025'
param skipExisting string = 'true'

// Deploy storage containers
module storage 'storage.bicep' = {
  name: 'storage-containers'
  params: {
    storageAccountName: storageAccountName
    location: location
  }
}

// Stage 1: Download & Extract
module stage1 'job.bicep' = {
  name: 'stage1-download'
  params: {
    environmentName: environmentName
    location: location
    containerRegistryName: containerRegistryName
    stageName: 'stage1-download'
    stageScript: 'stage1_download.py'
    targetYears: targetYears
    skipExisting: skipExisting
    storageAccountName: storageAccountName
    searchEndpoint: searchEndpoint
    searchIndexName: searchIndexName
    openAiEndpoint: openAiEndpoint
    openAiDeployment: openAiDeployment
    embeddingDimensions: embeddingDimensions
  }
  dependsOn: [
    storage
  ]
}

// Stage 2: Parse
module stage2 'job.bicep' = {
  name: 'stage2-parse'
  params: {
    environmentName: environmentName
    location: location
    containerRegistryName: containerRegistryName
    stageName: 'stage2-parse'
    stageScript: 'stage2_parse.py'
    targetYears: targetYears
    skipExisting: skipExisting
    storageAccountName: storageAccountName
    searchEndpoint: searchEndpoint
    searchIndexName: searchIndexName
    openAiEndpoint: openAiEndpoint
    openAiDeployment: openAiDeployment
    embeddingDimensions: embeddingDimensions
  }
  dependsOn: [
    storage
  ]
}

// Stage 3: Chunk
module stage3 'job.bicep' = {
  name: 'stage3-chunk'
  params: {
    environmentName: environmentName
    location: location
    containerRegistryName: containerRegistryName
    stageName: 'stage3-chunk'
    stageScript: 'stage3_chunk.py'
    targetYears: targetYears
    skipExisting: skipExisting
    storageAccountName: storageAccountName
    searchEndpoint: searchEndpoint
    searchIndexName: searchIndexName
    openAiEndpoint: openAiEndpoint
    openAiDeployment: openAiDeployment
    embeddingDimensions: embeddingDimensions
  }
  dependsOn: [
    storage
  ]
}

// Stage 4: Embed
module stage4 'job.bicep' = {
  name: 'stage4-embed'
  params: {
    environmentName: environmentName
    location: location
    containerRegistryName: containerRegistryName
    stageName: 'stage4-embed'
    stageScript: 'stage4_embed.py'
    targetYears: targetYears
    skipExisting: skipExisting
    storageAccountName: storageAccountName
    searchEndpoint: searchEndpoint
    searchIndexName: searchIndexName
    openAiEndpoint: openAiEndpoint
    openAiDeployment: openAiDeployment
    embeddingDimensions: embeddingDimensions
  }
  dependsOn: [
    storage
  ]
}

// Stage 5: Index
module stage5 'job.bicep' = {
  name: 'stage5-index'
  params: {
    environmentName: environmentName
    location: location
    containerRegistryName: containerRegistryName
    stageName: 'stage5-index'
    stageScript: 'stage5_index.py'
    targetYears: targetYears
    skipExisting: skipExisting
    storageAccountName: storageAccountName
    searchEndpoint: searchEndpoint
    searchIndexName: searchIndexName
    openAiEndpoint: openAiEndpoint
    openAiDeployment: openAiDeployment
    embeddingDimensions: embeddingDimensions
  }
  dependsOn: [
    storage
  ]
}

output stage1JobName string = stage1.outputs.jobName
output stage1PrincipalId string = stage1.outputs.principalId
output stage2JobName string = stage2.outputs.jobName
output stage2PrincipalId string = stage2.outputs.principalId
output stage3JobName string = stage3.outputs.jobName
output stage3PrincipalId string = stage3.outputs.principalId
output stage4JobName string = stage4.outputs.jobName
output stage4PrincipalId string = stage4.outputs.principalId
output stage5JobName string = stage5.outputs.jobName
output stage5PrincipalId string = stage5.outputs.principalId
output containerNames array = storage.outputs.containerNames
