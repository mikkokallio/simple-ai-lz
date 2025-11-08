// Full deployment with ACR and AI services
// Note: AI Foundry is not available in swedencentral yet
using './main.bicep'

param ownerEmail = 'mikkokallio@microsoft.com'
param location = 'swedencentral'
param deployVpnGateway = true   // DEPLOY VPN for accessing internal apps
param deployAiServices = false  // AI Foundry not available in swedencentral
param deployDocumentIntelligence = true
param deployDocumentTranslator = true
