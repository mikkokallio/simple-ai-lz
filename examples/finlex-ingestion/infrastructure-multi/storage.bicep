// Storage containers for multi-stage pipeline
param storageAccountName string
param location string = resourceGroup().location

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' existing = {
  parent: storageAccount
  name: 'default'
}

// Container for raw XML files (Stage 1 output)
resource containerRaw 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'finlex-raw'
  properties: {
    publicAccess: 'None'
  }
}

// Container for parsed JSON documents (Stage 2 output)
resource containerParsed 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'finlex-parsed'
  properties: {
    publicAccess: 'None'
  }
}

// Container for chunked documents (Stage 3 output)
resource containerChunks 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'finlex-chunks'
  properties: {
    publicAccess: 'None'
  }
}

// Container for embedded chunks (Stage 4 output)
resource containerEmbedded 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'finlex-embedded'
  properties: {
    publicAccess: 'None'
  }
}

// Container for indexed document metadata (Stage 5 output)
resource containerIndexed 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'finlex-indexed'
  properties: {
    publicAccess: 'None'
  }
}

output containerNames array = [
  containerRaw.name
  containerParsed.name
  containerChunks.name
  containerEmbedded.name
  containerIndexed.name
]
