const express = require('express');
const cors = require('cors');
const { DefaultAzureCredential } = require('@azure/identity');
const { CosmosClient } = require('@azure/cosmos');
const { BlobServiceClient } = require('@azure/storage-blob');
const { AzureOpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 80;

// CORS configuration
app.use(cors({
  origin: [
    'https://aca-triage-frontend.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io',
    'http://localhost:3000'
  ],
  credentials: true
}));

app.use(express.json());

// Initialize Azure clients using Managed Identity
const credential = new DefaultAzureCredential();

// Cosmos DB client
const cosmosEndpoint = process.env.COSMOS_ENDPOINT;
const cosmosClient = cosmosEndpoint ? new CosmosClient({ 
  endpoint: cosmosEndpoint, 
  aadCredentials: credential 
}) : null;

let database, container;
if (cosmosClient) {
  database = cosmosClient.database('healthcare-triage');
  container = database.container('draft-records');
}

// OpenAI client
const openAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const openAIDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
const openAIClient = openAIEndpoint ? new AzureOpenAI({
  endpoint: openAIEndpoint,
  azureADTokenProvider: async () => {
    const token = await credential.getToken('https://cognitiveservices.azure.com/.default');
    return token.token;
  },
  apiVersion: '2024-08-01-preview',
  deployment: openAIDeployment
}) : null;

// Storage client
const storageAccountName = process.env.STORAGE_ACCOUNT_NAME;
const blobServiceClient = storageAccountName ? 
  new BlobServiceClient(
    `https://${storageAccountName}.blob.core.windows.net`,
    credential
  ) : null;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Get Speech Service token
app.get('/api/getSpeechToken', (req, res) => {
  try {
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = 'swedencentral';
    
    if (!speechKey) {
      return res.status(500).json({ error: 'Speech service not configured' });
    }

    res.json({
      token: speechKey, // In production, exchange for a time-limited token
      region: speechRegion
    });
  } catch (error) {
    console.error('Error getting speech token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process transcript with OpenAI
app.post('/api/processTranscript', async (req, res) => {
  try {
    const { transcript, language } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'Transcript required' });
    }

    if (!openAIClient) {
      return res.status(500).json({ error: 'OpenAI not configured' });
    }

    const systemPrompt = `Olet lääkärin avustaja. Analysoi seuraava suomenkielinen transkriptio lääkärin ja potilaan välisestä keskustelusta.

Luo strukturoitu FHIR-tyyppinen dokumentti, joka sisältää:
1. Yhteenveto (summary)
2. Kliiniset löydökset (clinical_findings) - lista

Vastaa JSON-muodossa:
{
  "summary": "Lyhyt yhteenveto käynnistä",
  "clinical_findings": ["Löydös 1", "Löydös 2", ...],
  "subject_display": "Potilaan nimi jos mainittu, muuten 'Potilas'",
  "encounter_display": "Käynnin tyyppi jos mainittu",
  "custodian_display": "Hoitoyksikkö jos mainittu"
}`;

    const response = await openAIClient.chat.completions.create({
      model: openAIDeployment,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcript }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const structuredNote = JSON.parse(response.choices[0].message.content);
    const documentId = `draft-${Date.now()}`;
    
    // Save to Cosmos DB if available
    if (container) {
      const now = new Date().toISOString();
      const document = {
        id: documentId,
        resourceType: 'DocumentReference',
        status: 'draft',
        type: {
          coding: [{
            system: 'http://loinc.org',
            code: '11488-4',
            display: 'Consultation note'
          }]
        },
        subject: {
          display: structuredNote.subject_display || 'Tuntematon potilas'
        },
        context: {
          encounter: {
            display: structuredNote.encounter_display || `Käynti ${now}`
          }
        },
        custodian: {
          display: structuredNote.custodian_display || 'Terveyskeskus'
        },
        summary: structuredNote.summary || '',
        clinical_findings: structuredNote.clinical_findings || [],
        rawTranscript: transcript,
        createdAt: now,
        updatedAt: now
      };

      await container.items.create(document);
    }

    res.json({
      documentId,
      structuredNote,
      rawTranscript: transcript
    });
  } catch (error) {
    console.error('Error processing transcript:', error);
    res.status(500).json({ error: error.message });
  }
});

// Finalize document
app.post('/api/finalizeDocument', async (req, res) => {
  try {
    const { documentId } = req.body;

    if (!documentId) {
      return res.status(400).json({ error: 'Document ID required' });
    }

    if (!container) {
      return res.status(500).json({ error: 'Cosmos DB not configured' });
    }

    // Update document status
    const { resource: document } = await container.item(documentId, documentId).read();
    document.status = 'final';
    document.updatedAt = new Date().toISOString();

    await container.item(documentId, documentId).replace(document);

    res.json({ success: true, documentId });
  } catch (error) {
    console.error('Error finalizing document:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get document
app.get('/api/getDocument/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!container) {
      return res.status(500).json({ error: 'Cosmos DB not configured' });
    }

    const { resource: document } = await container.item(documentId, documentId).read();
    res.json(document);
  } catch (error) {
    console.error('Error getting document:', error);
    res.status(404).json({ error: 'Document not found' });
  }
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Healthcare Triage API listening on port ${port}`);
  console.log(`OpenAI configured: ${!!openAIClient}`);
  console.log(`Cosmos DB configured: ${!!container}`);
  console.log(`Blob Storage configured: ${!!blobServiceClient}`);
});
