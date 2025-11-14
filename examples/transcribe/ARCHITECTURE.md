# Healthcare Triage Application - Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User (Healthcare Provider)                  │
│                         Finnish Language Interface                   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │ HTTPS
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Azure Container Apps (Frontend)                   │
│                    aca-triage-frontend-ezle7syi                     │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Next.js 14 React Application                                 │  │
│  │  ├─ RealTimeDictation Component                              │  │
│  │  │  └─ Azure Speech SDK (Browser)                           │  │
│  │  ├─ PostFactoUpload Component                               │  │
│  │  └─ DocumentViewer Component                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  Managed Identity: System-Assigned                                   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │ REST API (HTTPS)
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Azure Functions (Backend API)                     │
│                      func-triage-ezle7syi                           │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Node.js 20 Functions (v4)                                    │  │
│  │                                                                │  │
│  │  1. processTranscript (HTTP POST)                            │  │
│  │     - Receives Finnish transcript                            │  │
│  │     - Calls Azure OpenAI                                     │  │
│  │     - Generates FHIR-like JSON                              │  │
│  │     - Saves to Cosmos DB                                     │  │
│  │                                                                │  │
│  │  2. processBlobUpload (Blob Trigger)                         │  │
│  │     - Processes uploaded audio files                         │  │
│  │     - Initiates batch transcription                          │  │
│  │                                                                │  │
│  │  3. finalizeDocument (HTTP POST)                             │  │
│  │     - Updates document status to 'final'                     │  │
│  │                                                                │  │
│  │  4. getDocument (HTTP GET)                                   │  │
│  │     - Retrieves document by ID                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  Managed Identity: System-Assigned                                   │
│  Auth: Managed Identity for all Azure services                       │
└───┬──────────────┬──────────────┬──────────────┬────────────────────┘
    │              │              │              │
    │              │              │              │
    ▼              ▼              ▼              ▼
┌───────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────────┐
│  Azure    │ │ Azure    │ │  Azure    │ │  Azure Blob     │
│  OpenAI   │ │ Cosmos   │ │  Speech   │ │  Storage        │
│           │ │    DB    │ │  Service  │ │                 │
│  foundry- │ │ cosmos-  │ │  speech-  │ │  stailzezle7syi │
│  ezle7syi │ │ ailz-    │ │  ailz-    │ │                 │
│           │ │ ezle7syi │ │  ezle7syi │ │  Container:     │
│  GPT-4o   │ │          │ │           │ │  audio-uploads  │
│  Finnish  │ │ Database:│ │  Finnish  │ │                 │
│  Prompts  │ │ health-  │ │  (fi-FI)  │ │  Audio files    │
│           │ │ care-    │ │           │ │                 │
│  JSON     │ │ triage   │ │  Speech-  │ │  MP3/WAV        │
│  Mode     │ │          │ │  to-Text  │ │                 │
│           │ │ Container│ │           │ │                 │
│  Struc-   │ │ draft-   │ │  Batch    │ │                 │
│  tured    │ │ records  │ │  API      │ │                 │
│  Output   │ │          │ │           │ │                 │
└───────────┘ └──────────┘ └───────────┘ └─────────────────┘
     │             │             │              │
     │             │             │              │
     └─────────────┴─────────────┴──────────────┘
                   │
                   │ Managed Identity Auth (Zero Trust)
                   │ RBAC: Cognitive Services User
                   │       Cosmos DB Data Contributor
                   │       Storage Blob Data Contributor
                   ▼
        ┌─────────────────────────┐
        │  Azure Key Vault        │
        │  kv-ailz-ezle7syi       │
        │  (Optional - Future)    │
        └─────────────────────────┘
```

## Data Flow

### Real-Time Dictation Workflow

```
1. User clicks "Aloita nauhoitus" (Start Recording)
   │
   ├─▶ Frontend initializes Azure Speech SDK
   │   └─▶ Continuous recognition mode (fi-FI)
   │
2. User speaks in Finnish
   │
   ├─▶ Browser captures audio
   │   └─▶ Speech SDK streams to Azure Speech Service
   │       └─▶ Returns real-time transcript
   │           └─▶ Frontend displays interim results
   │
3. User clicks "Pysäytä nauhoitus" (Stop Recording)
   │
   ├─▶ Recognition stops
   │   └─▶ Final transcript collected
   │
4. User clicks "Luo dokumentti" (Create Document)
   │
   ├─▶ POST /api/processTranscript
   │   │
   │   ├─▶ Azure Function receives transcript
   │   │
   │   ├─▶ Calls Azure OpenAI (GPT-4o)
   │   │   └─▶ Finnish healthcare prompt
   │   │   └─▶ JSON mode enforced
   │   │   └─▶ Returns structured JSON
   │   │
   │   ├─▶ Creates FHIR-like DocumentReference
   │   │   └─▶ status: "draft"
   │   │   └─▶ timestamp: now()
   │   │   └─▶ id: generated
   │   │
   │   └─▶ Saves to Cosmos DB
   │       └─▶ Returns document to frontend
   │
5. Frontend displays DocumentViewer
   │
   ├─▶ Side-by-side view:
   │   ├─▶ Left: Raw transcript
   │   └─▶ Right: Structured note
   │
6. User reviews and clicks "Hyväksy ja viimeistele"
   │
   ├─▶ POST /api/finalizeDocument
   │   │
   │   └─▶ Updates document.status = "final"
   │       └─▶ Updates document.updatedAt = now()
   │           └─▶ Saves to Cosmos DB
   │
7. Document marked as final ✓
```

### Post-Facto Upload Workflow (Planned)

```
1. User uploads audio file (MP3/WAV)
   │
   ├─▶ Frontend uploads to Blob Storage
   │   └─▶ Container: audio-uploads
   │       └─▶ Event Grid triggers function
   │
2. Blob Trigger: processBlobUpload
   │
   ├─▶ Submits to Azure Speech Batch API
   │   └─▶ Poll for completion
   │       └─▶ Retrieve full transcript
   │
3. [Same as step 4-7 above]
```

## Security Architecture (Zero Trust)

```
┌─────────────────────────────────────────────────────────┐
│                     Security Layers                      │
└─────────────────────────────────────────────────────────┘

Layer 1: Network Security
├─▶ Private Endpoints (existing infrastructure)
├─▶ VNet Integration
├─▶ NSG Rules
└─▶ HTTPS Only

Layer 2: Identity & Access Management
├─▶ Entra ID Authentication (user access)
├─▶ Managed Identities (service-to-service)
│   ├─▶ Function App → System-Assigned MI
│   └─▶ Container App → System-Assigned MI
└─▶ No API Keys or Connection Strings in Code

Layer 3: Authorization (RBAC)
├─▶ Cosmos DB Data Contributor
├─▶ Storage Blob Data Contributor
├─▶ Cognitive Services User (OpenAI)
└─▶ Cognitive Services User (Speech)

Layer 4: Data Protection
├─▶ Encryption in Transit (TLS 1.2+)
├─▶ Encryption at Rest (Azure default)
├─▶ GDPR Compliance (Sweden Central)
└─▶ Audit Logging (Application Insights)
```

## FHIR-Like Document Structure

```json
{
  "resourceType": "DocumentReference",
  "id": "doc-1731600000-abc123",
  "status": "draft",
  "type": {
    "coding": [{
      "system": "http://loinc.org",
      "code": "34133-9",
      "display": "Note, procedure"
    }]
  },
  "subject": {
    "display": "Matti Meikäläinen"
  },
  "context": {
    "encounter": {
      "display": "Käynti 14.11.2025 16:00"
    }
  },
  "custodian": {
    "display": "Terveyskeskus"
  },
  "summary": "Potilas hakeutui vastaanotolle kuumeen ja kurkkukivun vuoksi...",
  "clinical_findings": [
    {
      "code": "R50.9",
      "detail": "Kuume (38.5°C)"
    },
    {
      "code": "J02.9",
      "detail": "Kurkkukipu"
    }
  ],
  "createdAt": "2025-11-14T16:00:00.000Z",
  "updatedAt": "2025-11-14T16:00:00.000Z"
}
```

## Deployment Topology

```
Resource Group: rg-ailz-lab (Sweden Central)
│
├─▶ Existing Shared Infrastructure (Multi-Tenant)
│   ├─▶ Container Apps Environment (cae-ailz-ezle7syi)
│   ├─▶ Azure Container Registry (acrezle7syiailz)
│   ├─▶ Storage Account (stailzezle7syi)
│   ├─▶ Cosmos DB Account (cosmos-ailz-ezle7syi)
│   ├─▶ Azure OpenAI (foundry-ezle7syi)
│   ├─▶ Virtual Network (vnet-ailz-lab)
│   ├─▶ Key Vault (kv-ailz-ezle7syi)
│   └─▶ Log Analytics (log-ailz-ezle7syi)
│
└─▶ Healthcare Triage App Resources (New)
    ├─▶ Speech Service (speech-ailz-ezle7syi) ✅
    ├─▶ Storage Container (audio-uploads) ✅
    ├─▶ Cosmos Database (healthcare-triage) ✅
    ├─▶ Cosmos Container (draft-records) ✅
    ├─▶ Storage Account (stfunctriage5678) ✅
    ├─▶ Function App (func-triage-ezle7syi) ⏳
    └─▶ Container App (aca-triage-frontend-ezle7syi) ⏳
```

## Technology Stack

**Frontend**:
- Next.js 14 (React 18)
- TypeScript
- Tailwind CSS
- Azure Speech SDK (Browser)
- Docker containerization

**Backend**:
- Azure Functions v4
- Node.js 20
- OpenAI SDK (stable)
- Azure SDK (@azure/identity, @azure/cosmos, @azure/storage-blob)

**Infrastructure**:
- Azure Container Apps
- Azure Functions (Consumption Plan)
- Azure Cosmos DB (Serverless)
- Azure Blob Storage
- Azure AI Speech
- Azure OpenAI
- Azure Container Registry

**DevOps**:
- Azure CLI
- Docker
- PowerShell deployment scripts
- Git version control

## Monitoring & Observability

```
Application Insights
├─▶ Frontend telemetry
├─▶ Function App logs
├─▶ Performance metrics
├─▶ Error tracking
└─▶ Custom events

Cosmos DB Metrics
├─▶ Request Units usage
├─▶ Query performance
└─▶ Storage size

Container Apps Metrics
├─▶ HTTP traffic
├─▶ CPU/Memory usage
└─▶ Replica scaling
```

## Cost Estimate (MVP)

```
Service               Pricing Tier    Est. Monthly Cost
─────────────────────────────────────────────────────
Speech Service        S0 (Standard)   Pay-per-use (~$5-20)
Cosmos DB            Serverless       Pay-per-RU (~$5-15)
Functions            Consumption      Pay-per-execution (~$0-5)
Container Apps       Consumption      Pay-per-use (~$10-30)
Storage              Standard LRS     Pay-per-GB (~$1-5)
OpenAI (GPT-4o)      Shared           Existing deployment
                                      
Total (estimated):                    $21-75/month

Note: Costs assume light demo usage.
Production usage will vary based on actual traffic.
```

## Compliance & Standards

✅ **GDPR**: Data residency in EU (Sweden)  
✅ **Security**: Zero Trust, Managed Identity  
✅ **Healthcare**: FHIR-inspired structure  
✅ **Language**: Finnish (fi-FI) throughout  
✅ **Accessibility**: Responsive design  
✅ **Scalability**: Serverless auto-scaling  

## Future Enhancements

1. **Entra ID Integration**: User authentication
2. **APIM Gateway**: Centralized API management
3. **Batch Transcription**: Complete file upload workflow
4. **Speech Tokens**: Secure token endpoint
5. **Advanced FHIR**: Full FHIR R4 compliance
6. **Multi-language**: Support additional languages
7. **Mobile App**: Native iOS/Android clients
8. **Analytics Dashboard**: Usage and insights
