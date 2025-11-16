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

app.use(express.json({ limit: '50mb' }));

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
app.get('/api/getSpeechToken', async (req, res) => {
  const startTime = Date.now();
  console.log('[getSpeechToken] Request received');
  
  try {
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = 'swedencentral';
    
    if (!speechKey) {
      console.error('[getSpeechToken] Speech service not configured');
      return res.status(500).json({ error: 'Speech service not configured' });
    }

    // Exchange API key for a time-limited token (10 minutes)
    const tokenResponse = await fetch(
      `https://${speechRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': speechKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
    }

    const token = await tokenResponse.text(); // Token is returned as plain text

    const duration = Date.now() - startTime;
    console.log(`[getSpeechToken] Token issued, duration: ${duration}ms`);
    
    res.json({
      token: token, // Time-limited token, not the API key
      region: speechRegion
    });
  } catch (error) {
    console.error('[getSpeechToken] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process transcript with OpenAI
app.post('/api/processTranscript', async (req, res) => {
  const startTime = Date.now();
  console.log('[processTranscript] Request received');
  
  try {
    const { transcript, language } = req.body;

    if (!transcript) {
      console.error('[processTranscript] No transcript provided');
      return res.status(400).json({ error: 'Transcript required' });
    }

    if (!openAIClient) {
      console.error('[processTranscript] OpenAI not configured');
      return res.status(500).json({ error: 'OpenAI not configured' });
    }

    console.log(`[processTranscript] Processing transcript of length: ${transcript.length}`);

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

    const openAIStart = Date.now();
    const response = await openAIClient.chat.completions.create({
      model: openAIDeployment,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcript }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });
    console.log(`[processTranscript] OpenAI response received, duration: ${Date.now() - openAIStart}ms`);

    // Extract JSON from response, handling markdown code fences
    let responseContent = response.choices[0].message.content.trim();
    
    // Remove markdown code fences if present
    if (responseContent.startsWith('```json')) {
      responseContent = responseContent.replace(/^```json\s*\n/, '').replace(/\n```\s*$/, '');
    } else if (responseContent.startsWith('```')) {
      responseContent = responseContent.replace(/^```\s*\n/, '').replace(/\n```\s*$/, '');
    }
    
    console.log(`[processTranscript] Cleaned response content: ${responseContent.substring(0, 100)}...`);
    
    const structuredNote = JSON.parse(responseContent);
    const documentId = `draft-${Date.now()}`;
    
    // Save to Cosmos DB if available
    if (container) {
      const cosmosStart = Date.now();
      console.log('[processTranscript] Saving to Cosmos DB...');
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
      console.log(`[processTranscript] Saved to Cosmos DB, duration: ${Date.now() - cosmosStart}ms`);
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[processTranscript] Total duration: ${totalDuration}ms`);

    // Return response in format expected by frontend DocumentViewer
    res.json({
      documentReference: {
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
            display: structuredNote.encounter_display || `Käynti`
          }
        },
        custodian: {
          display: structuredNote.custodian_display || 'Terveyskeskus'
        },
        summary: structuredNote.summary || '',
        clinical_findings: structuredNote.clinical_findings || []
      },
      rawTranscript: transcript
    });
  } catch (error) {
    console.error('[processTranscript] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Enhance transcript - clean up spoken language artifacts
app.post('/api/enhanceTranscript', async (req, res) => {
  try {
    const { transcript, language } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'Transcript required' });
    }

    console.log('[enhanceTranscript] Starting enhancement, language:', language || 'fi-FI');
    const startTime = performance.now();

    // Language-specific enhancement prompts
    const prompts = {
      'fi-FI': `Paranna seuraava puheteksti poistamalla toistot, täytesanat (kuten "niinku", "tota", "öö"), epäröinnit ja virheelliset aloitukset. Säilytä alkuperäinen rakenne ja merkitys. Pidä lääketieteellinen termistö koskemattomana. Palauta vain parannettu teksti ilman selityksiä.

Alkuperäinen teksti:
${transcript}`,
      'sv-SE': `Förbättra följande taltext genom att ta bort upprepningar, fyllnadsord (som "typ", "liksom", "öh"), tveksamheter och felaktiga starter. Bevara den ursprungliga strukturen och betydelsen. Håll medicinsk terminologi intakt. Returnera endast den förbättrade texten utan förklaringar.

Originaltext:
${transcript}`,
      'en-US': `Enhance the following spoken text by removing repetitions, filler words (like "um", "uh", "like", "you know"), hesitations, and false starts. Preserve the original structure and meaning. Keep medical terminology intact. Return only the enhanced text without explanations.

Original text:
${transcript}`
    };

    const prompt = prompts[language] || prompts['fi-FI'];

    const completion = await openAIClient.chat.completions.create({
      model: openAIDeployment,
      messages: [
        { role: 'system', content: 'You are a helpful assistant that cleans up spoken language transcripts while preserving their meaning and structure.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const enhancedTranscript = completion.choices[0].message.content.trim();
    const duration = Math.round(performance.now() - startTime);

    console.log('[enhanceTranscript] Completed in', duration, 'ms');

    res.json({ enhancedTranscript });
  } catch (error) {
    console.error('[enhanceTranscript] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload audio file and create batch transcription
app.post('/api/transcribeAudioFile', async (req, res) => {
  const startTime = Date.now();
  console.log('[transcribeAudioFile] Request received');

  try {
    const { fileName, fileData, language } = req.body;

    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'File name and data required' });
    }

    if (!blobServiceClient) {
      return res.status(500).json({ error: 'Blob Storage not configured' });
    }

    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = 'swedencentral';
    if (!speechKey) {
      return res.status(500).json({ error: 'Speech service not configured' });
    }

    // Upload to Blob Storage
    const containerName = 'audio-uploads';
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Ensure container exists
    await containerClient.createIfNotExists();

    // Generate unique blob name
    const timestamp = Date.now();
    const blobName = `${timestamp}-${fileName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload file (fileData is base64)
    const buffer = Buffer.from(fileData, 'base64');
    await blockBlobClient.upload(buffer, buffer.length);
    const blobUrl = blockBlobClient.url;
    
    console.log('[transcribeAudioFile] Uploaded to blob:', blobUrl);

    // Create batch transcription using Azure Speech REST API
    const transcriptionUrl = `https://${speechRegion}.api.cognitive.microsoft.com/speechtotext/v3.2/transcriptions`;
    
    const transcriptionRequest = {
      contentUrls: [blobUrl],
      locale: language || 'fi-FI',
      displayName: `Transcription-${timestamp}`,
      properties: {
        wordLevelTimestampsEnabled: false,
        punctuationMode: 'DictatedAndAutomatic',
        profanityFilterMode: 'None'
      }
    };

    console.log('[transcribeAudioFile] Creating batch transcription job');
    const createResponse = await fetch(transcriptionUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(transcriptionRequest)
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('[transcribeAudioFile] Failed to create transcription:', errorText);
      throw new Error(`Failed to create transcription: ${errorText}`);
    }

    const transcriptionJob = await createResponse.json();
    const transcriptionId = transcriptionJob.self.split('/').pop();
    console.log('[transcribeAudioFile] Transcription job created:', transcriptionId);

    // Poll for completion (max 60 seconds)
    const maxAttempts = 30;
    const pollInterval = 2000; // 2 seconds
    let transcript = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const statusResponse = await fetch(transcriptionJob.self, {
        headers: {
          'Ocp-Apim-Subscription-Key': speechKey
        }
      });

      if (!statusResponse.ok) {
        console.error('[transcribeAudioFile] Failed to get status');
        continue;
      }

      const status = await statusResponse.json();
      console.log(`[transcribeAudioFile] Status (attempt ${attempt + 1}):`, status.status);

      if (status.status === 'Succeeded') {
        // Get transcription files
        const filesResponse = await fetch(`${transcriptionJob.self}/files`, {
          headers: {
            'Ocp-Apim-Subscription-Key': speechKey
          }
        });

        if (!filesResponse.ok) {
          throw new Error('Failed to get transcription files');
        }

        const files = await filesResponse.json();
        const contentFile = files.values.find(f => f.kind === 'Transcription');

        if (contentFile) {
          const contentResponse = await fetch(contentFile.links.contentUrl);
          const result = await contentResponse.json();
          
          // Extract transcript from result
          if (result.combinedRecognizedPhrases && result.combinedRecognizedPhrases.length > 0) {
            transcript = result.combinedRecognizedPhrases[0].display;
          }
        }

        // Clean up: delete transcription job
        await fetch(transcriptionJob.self, {
          method: 'DELETE',
          headers: {
            'Ocp-Apim-Subscription-Key': speechKey
          }
        });

        break;
      } else if (status.status === 'Failed') {
        const errorDetails = JSON.stringify(status.properties?.error || status.properties || 'Unknown error');
        console.error('[transcribeAudioFile] Transcription failed with details:', errorDetails);
        throw new Error(`Transcription failed: ${errorDetails}`);
      }
    }

    if (!transcript) {
      throw new Error('Transcription timed out or produced no results');
    }

    const duration = Date.now() - startTime;
    console.log('[transcribeAudioFile] Completed in', duration, 'ms');

    res.json({ transcript });
  } catch (error) {
    console.error('[transcribeAudioFile] Error:', error);
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
