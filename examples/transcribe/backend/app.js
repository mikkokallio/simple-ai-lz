const { app } = require('@azure/functions');
const { DefaultAzureCredential } = require('@azure/identity');
const { CosmosClient } = require('@azure/cosmos');
const { BlobServiceClient } = require('@azure/storage-blob');
const { AzureOpenAI } = require('openai');

// Initialize Azure clients using Managed Identity
const credential = new DefaultAzureCredential();

// Cosmos DB client
const cosmosEndpoint = process.env.COSMOS_DB_ENDPOINT;
const cosmosClient = new CosmosClient({ endpoint: cosmosEndpoint, aadCredentials: credential });
const database = cosmosClient.database(process.env.COSMOS_DB_DATABASE);
const container = database.container(process.env.COSMOS_DB_CONTAINER);

// OpenAI client
const openAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const openAIDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
const openAIClient = new AzureOpenAI({
  endpoint: openAIEndpoint,
  azureADTokenProvider: async () => {
    const token = await credential.getToken('https://cognitiveservices.azure.com/.default');
    return token.token;
  },
  apiVersion: '2024-08-01-preview',
  deployment: openAIDeployment
});

// Storage client
const storageAccountName = process.env.STORAGE_ACCOUNT_NAME;
const blobServiceClient = new BlobServiceClient(
  `https://${storageAccountName}.blob.core.windows.net`,
  credential
);

/**
 * Finnish healthcare-specific prompt for structured clinical documentation
 */
const FINNISH_HEALTHCARE_PROMPT = `Olet terveydenhuollon dokumentointiavustaja. Analysoi seuraava suomenkielinen potilaskeskustelu ja luo strukturoitu kliininen muistiinpano.

Vastaa VAIN JSON-muodossa seuraavalla rakenteella:
{
  "subject_display": "[Potilaan nimi tai tunniste]",
  "encounter_display": "[Käynnin päivämäärä ja aika]",
  "custodian_display": "[Terveydenhuollon yksikkö]",
  "summary": "[Lyhyt yhteenveto käynnistä suomeksi]",
  "clinical_findings": [
    {
      "code": "[ICD-10 koodi jos mahdollista, muuten tyhjä]",
      "detail": "[Löydös tai oire suomeksi]"
    }
  ]
}

Keskustelu:
`;

/**
 * HTTP Trigger: Process real-time transcript
 */
app.http('processTranscript', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    context.log('Processing real-time transcript');

    try {
      const body = await request.json();
      const { transcript, language = 'fi-FI' } = body;

      if (!transcript) {
        return {
          status: 400,
          jsonBody: { error: 'Transcript is required' }
        };
      }

      // Call Azure OpenAI to generate structured documentation
      const structuredNote = await generateStructuredNote(transcript, context);

      // Create FHIR-like document
      const documentReference = createDocumentReference(structuredNote);

      // Save to Cosmos DB as draft
      await container.items.create(documentReference);

      context.log(`Created draft document: ${documentReference.id}`);

      return {
        status: 200,
        jsonBody: {
          documentReference,
          rawTranscript: transcript
        }
      };
    } catch (error) {
      context.error('Error processing transcript:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to process transcript', details: error.message }
      };
    }
  }
});

/**
 * Blob Trigger: Process uploaded audio file
 */
app.storageBlob('processBlobUpload', {
  path: 'audio-uploads/{name}',
  connection: 'AzureWebJobsStorage',
  handler: async (blob, context) => {
    context.log(`Processing blob: ${context.triggerMetadata.name}`);

    try {
      const blobName = context.triggerMetadata.name;
      const blobUrl = context.triggerMetadata.uri;

      // For batch transcription, we would normally use Azure Speech Batch API
      // For MVP, we'll simulate this with a placeholder
      // In production, implement actual batch transcription

      context.log(`Blob ${blobName} uploaded. Batch transcription would be initiated here.`);
      
      // TODO: Implement Azure Speech Batch Transcription
      // This requires:
      // 1. Submit audio to Speech batch API
      // 2. Poll for completion
      // 3. Retrieve transcript
      // 4. Call generateStructuredNote
      // 5. Save to Cosmos DB with audioFileUrl reference

    } catch (error) {
      context.error('Error processing blob upload:', error);
      throw error;
    }
  }
});

/**
 * HTTP Trigger: Finalize document (change status from draft to final)
 */
app.http('finalizeDocument', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    context.log('Finalizing document');

    try {
      const body = await request.json();
      const { documentId } = body;

      if (!documentId) {
        return {
          status: 400,
          jsonBody: { error: 'Document ID is required' }
        };
      }

      // Read the document
      const { resource: document } = await container.item(documentId, documentId).read();

      if (!document) {
        return {
          status: 404,
          jsonBody: { error: 'Document not found' }
        };
      }

      // Update status to final
      document.status = 'final';
      document.updatedAt = new Date().toISOString();

      await container.item(documentId, documentId).replace(document);

      context.log(`Finalized document: ${documentId}`);

      return {
        status: 200,
        jsonBody: document
      };
    } catch (error) {
      context.error('Error finalizing document:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to finalize document', details: error.message }
      };
    }
  }
});

/**
 * HTTP Trigger: Get document by ID
 */
app.http('getDocument', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'documents/{id}',
  handler: async (request, context) => {
    const documentId = request.params.id;
    context.log(`Retrieving document: ${documentId}`);

    try {
      const { resource: document } = await container.item(documentId, documentId).read();

      if (!document) {
        return {
          status: 404,
          jsonBody: { error: 'Document not found' }
        };
      }

      return {
        status: 200,
        jsonBody: document
      };
    } catch (error) {
      context.error('Error retrieving document:', error);
      return {
        status: 500,
        jsonBody: { error: 'Failed to retrieve document', details: error.message }
      };
    }
  }
});

/**
 * Generate structured clinical note using Azure OpenAI
 */
async function generateStructuredNote(transcript, context) {
  try {
    const messages = [
      {
        role: 'system',
        content: FINNISH_HEALTHCARE_PROMPT
      },
      {
        role: 'user',
        content: transcript
      }
    ];

    const response = await openAIClient.chat.completions.create({
      model: openAIDeployment,
      messages: messages,
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' } // Enforce JSON mode
    });

    const content = response.choices[0].message.content;
    const structuredNote = JSON.parse(content);

    context.log('Successfully generated structured note');
    return structuredNote;
  } catch (error) {
    context.error('Error generating structured note:', error);
    throw new Error(`Failed to generate structured note: ${error.message}`);
  }
}

/**
 * Create FHIR-like DocumentReference from structured note
 */
function createDocumentReference(structuredNote) {
  const id = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();

  return {
    id,
    resourceType: 'DocumentReference',
    status: 'draft',
    type: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '34133-9',
          display: 'Note, procedure'
        }
      ]
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
    createdAt: now,
    updatedAt: now
  };
}

// HTTP trigger to get Speech Service token for frontend
app.http('getSpeechToken', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const speechKey = process.env.AZURE_SPEECH_KEY;
            const speechRegion = 'swedencentral';
            
            if (!speechKey) {
                return {
                    status: 500,
                    jsonBody: { error: 'Speech service not configured' }
                };
            }

            return {
                status: 200,
                jsonBody: {
                    token: speechKey, // In production, exchange for a time-limited token
                    region: speechRegion
                }
            };
        } catch (error) {
            context.error(`Error getting speech token: ${error.message}`);
            return {
                status: 500,
                jsonBody: { error: error.message }
            };
        }
    }
});
