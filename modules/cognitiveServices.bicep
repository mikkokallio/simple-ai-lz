// ============================================================================
// Cognitive Services Module - Document Intelligence & Translation
// ============================================================================
// Deploys Azure Cognitive Services for document processing:
// - Document Intelligence (FormRecognizer) for OCR and document analysis
// - Document Translation for translating documents
// ============================================================================

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Unique suffix for resource names')
param uniqueSuffix string

@description('Resource tags')
param tags object = {}

@description('Private endpoint subnet ID')
param privateEndpointSubnetId string

@description('Private DNS zone ID for cognitive services')
param cognitiveServicesPrivateDnsZoneId string

@description('Log Analytics workspace ID for diagnostics')
param logAnalyticsWorkspaceId string

@description('Deploy Document Intelligence service')
param deployDocumentIntelligence bool = true

@description('Deploy Document Translator service')
param deployDocumentTranslator bool = true

// ============================================================================
// VARIABLES
// ============================================================================

var documentIntelligenceName = 'di-ailz-${uniqueSuffix}'
var documentTranslatorName = 'dt-ailz-${uniqueSuffix}'

// ============================================================================
// DOCUMENT INTELLIGENCE (FormRecognizer)
// ============================================================================

resource documentIntelligence 'Microsoft.CognitiveServices/accounts@2024-10-01' = if (deployDocumentIntelligence) {
  name: documentIntelligenceName
  location: location
  tags: tags
  kind: 'FormRecognizer'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: documentIntelligenceName
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      defaultAction: 'Deny'
    }
    disableLocalAuth: true // Enforce managed identity only
  }
}

// Private Endpoint for Document Intelligence
resource documentIntelligencePrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = if (deployDocumentIntelligence) {
  name: 'pe-${documentIntelligenceName}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'pe-${documentIntelligenceName}'
        properties: {
          privateLinkServiceId: documentIntelligence.id
          groupIds: [
            'account'
          ]
        }
      }
    ]
  }
}

resource documentIntelligencePrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = if (deployDocumentIntelligence) {
  parent: documentIntelligencePrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'cognitiveservices'
        properties: {
          privateDnsZoneId: cognitiveServicesPrivateDnsZoneId
        }
      }
    ]
  }
}

// Diagnostic Settings for Document Intelligence
resource documentIntelligenceDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (deployDocumentIntelligence) {
  name: 'diag-${documentIntelligenceName}'
  scope: documentIntelligence
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'Audit'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
      {
        category: 'RequestResponse'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]
  }
}

// ============================================================================
// DOCUMENT TRANSLATOR
// ============================================================================

resource documentTranslator 'Microsoft.CognitiveServices/accounts@2024-10-01' = if (deployDocumentTranslator) {
  name: documentTranslatorName
  location: location
  tags: tags
  kind: 'TextTranslation'
  sku: {
    name: 'S1'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: documentTranslatorName
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      defaultAction: 'Deny'
    }
    disableLocalAuth: true // Enforce managed identity only
  }
}

// Private Endpoint for Document Translator
resource documentTranslatorPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = if (deployDocumentTranslator) {
  name: 'pe-${documentTranslatorName}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'pe-${documentTranslatorName}'
        properties: {
          privateLinkServiceId: documentTranslator.id
          groupIds: [
            'account'
          ]
        }
      }
    ]
  }
}

resource documentTranslatorPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = if (deployDocumentTranslator) {
  parent: documentTranslatorPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'cognitiveservices'
        properties: {
          privateDnsZoneId: cognitiveServicesPrivateDnsZoneId
        }
      }
    ]
  }
}

// Diagnostic Settings for Document Translator
resource documentTranslatorDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (deployDocumentTranslator) {
  name: 'diag-${documentTranslatorName}'
  scope: documentTranslator
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'Audit'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
      {
        category: 'RequestResponse'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

output documentIntelligenceId string = deployDocumentIntelligence ? documentIntelligence.id : ''
output documentIntelligenceName string = deployDocumentIntelligence ? documentIntelligence.name : ''
output documentIntelligenceEndpoint string = deployDocumentIntelligence ? documentIntelligence.properties.endpoint : ''
output documentIntelligencePrincipalId string = deployDocumentIntelligence ? documentIntelligence.identity.principalId : ''

output documentTranslatorId string = deployDocumentTranslator ? documentTranslator.id : ''
output documentTranslatorName string = deployDocumentTranslator ? documentTranslator.name : ''
output documentTranslatorEndpoint string = deployDocumentTranslator ? documentTranslator.properties.endpoint : ''
output documentTranslatorPrincipalId string = deployDocumentTranslator ? documentTranslator.identity.principalId : ''
