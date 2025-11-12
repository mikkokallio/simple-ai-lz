# Finlex Legal Text Ingestion Pipeline

## Overview

Automated pipeline for ingesting Finnish legal texts from Finlex into Azure AI Search, enabling RAG capabilities for other applications.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│   Timer     │────▶│   Download   │────▶│   Process   │────▶│  AI Search   │
│  Trigger    │     │   Function   │     │   Function  │     │    Index     │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
                           │                     │
                           ▼                     ▼
                    ┌─────────────┐      ┌─────────────┐
                    │   Blob      │      │  Document   │
                    │  Storage    │      │ Intelligence│
                    └─────────────┘      └─────────────┘
```

## Components

### Azure Functions (Container Apps Environment)
- **Download Function**: HTTP/Timer triggered - fetches ZIP from Finlex URL
- **Process Function**: Blob triggered - unpacks, chunks, enriches, and indexes documents

### Storage
- **Blob Storage**: Temporary storage for downloaded ZIPs and extracted files
- **Container**: `finlex-raw` for downloaded archives
- **Container**: `finlex-processed` for extracted/processed documents

### AI Services
- **Azure AI Search**: Target index for searchable legal text
- **Azure OpenAI**: Embeddings for vector search (text-embedding-3-small, 1536 dimensions)
- **Document Intelligence** (optional): Enhanced text extraction from PDFs

## Data Flow

1. **Trigger**: Timer (daily) or manual HTTP trigger
2. **Download**: Fetch ZIP from Finlex public API/URL
3. **Upload**: Store ZIP in Blob Storage (`finlex-raw`)
4. **Extract**: Unpack ZIP, identify document types (XML, PDF, etc.)
5. **Parse**: Extract structured text from legal documents
6. **Chunk**: Split documents into searchable chunks (overlap for context)
7. **Enrich**: Add metadata (document type, date, hierarchy)
8. **Embed**: Generate vectors using Azure OpenAI embeddings
9. **Index**: Push to AI Search with vectors and metadata

## Finlex Data Structure

Finlex provides:
- **Statute texts** (XML format)
- **Case law** (PDF/XML)
- **Legislative history** (metadata)
- **Document hierarchies** (sections, chapters, paragraphs)

### Metadata to Preserve
- Document ID (Finlex identifier)
- Document type (statute, decree, case law)
- Publication date
- Effective date
- Amendment history
- Hierarchical structure (law → chapter → section → paragraph)

## AI Search Index Schema

```json
{
  "name": "finlex-legal-texts",
  "fields": [
    { "name": "id", "type": "Edm.String", "key": true },
    { "name": "documentId", "type": "Edm.String", "filterable": true },
    { "name": "documentType", "type": "Edm.String", "filterable": true },
    { "name": "title", "type": "Edm.String", "searchable": true },
    { "name": "content", "type": "Edm.String", "searchable": true },
    { "name": "contentVector", "type": "Collection(Edm.Single)", "dimensions": 1536, "vectorSearchProfile": "default" },
    { "name": "publicationDate", "type": "Edm.DateTimeOffset", "filterable": true, "sortable": true },
    { "name": "effectiveDate", "type": "Edm.DateTimeOffset", "filterable": true },
    { "name": "hierarchy", "type": "Edm.String", "filterable": true },
    { "name": "section", "type": "Edm.String", "filterable": true },
    { "name": "url", "type": "Edm.String" },
    { "name": "lastModified", "type": "Edm.DateTimeOffset" }
  ],
  "vectorSearch": {
    "algorithms": [
      { "name": "hnsw", "kind": "hnsw", "hnswParameters": { "m": 4, "efConstruction": 400, "metric": "cosine" } }
    ],
    "profiles": [
      { "name": "default", "algorithm": "hnsw" }
    ]
  }
}
```

## Chunking Strategy

- **Chunk size**: 800-1000 tokens (~3000-4000 characters)
- **Overlap**: 100 tokens (~400 characters) for context preservation
- **Respect boundaries**: Split at paragraph/section breaks when possible
- **Maintain hierarchy**: Include parent section context in metadata

## Infrastructure Requirements

### New Resources
1. **Azure AI Search Service**: Shared resource, can be used by multiple apps
   - SKU: Basic (S1 for production)
   - Region: Same as other resources (Sweden Central)
   - Features: Semantic search, vector search enabled

2. **Storage Account Container**: `finlex-raw` and `finlex-processed`
   - Already exists, just need new containers

3. **Azure Functions**: Deploy to existing Container Apps Environment
   - Type: Container-based Azure Functions
   - Runtime: Node.js 20 or Python 3.11
   - Scaling: Consumption (KEDA-based in Container Apps)

### Existing Resources (Reuse)
- **Container Apps Environment**: Host Functions as container apps
- **Storage Account**: Add new containers for Finlex data
- **Azure OpenAI**: Use existing deployment for embeddings
- **Application Insights**: Shared monitoring
- **Key Vault**: Store API keys and connection strings

## Environment Variables

```bash
# Storage
AZURE_STORAGE_ACCOUNT_NAME=<storage-account>
AZURE_STORAGE_CONNECTION_STRING=<connection-string>
FINLEX_RAW_CONTAINER=finlex-raw
FINLEX_PROCESSED_CONTAINER=finlex-processed

# AI Search
AZURE_SEARCH_ENDPOINT=<search-endpoint>
AZURE_SEARCH_ADMIN_KEY=<admin-key>
AZURE_SEARCH_INDEX_NAME=finlex-legal-texts

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=<openai-endpoint>
AZURE_OPENAI_KEY=<openai-key>
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
AZURE_OPENAI_DIMENSIONS=1536
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Finlex API
FINLEX_BASE_URL=https://www.finlex.fi/data
FINLEX_DOWNLOAD_URL=<specific-zip-url>

# Document Intelligence (optional)
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=<endpoint>
AZURE_DOCUMENT_INTELLIGENCE_KEY=<key>

# Function Settings
FUNCTIONS_WORKER_RUNTIME=node
AzureWebJobsStorage=<storage-connection-string>
CRON_SCHEDULE=0 0 2 * * *  # Daily at 2 AM
```

## Implementation Phases

### Phase 1: Infrastructure Setup
- [ ] Deploy Azure AI Search service
- [ ] Create storage containers
- [ ] Set up Function App scaffolding
- [ ] Configure identity and RBAC

### Phase 2: Download Function
- [ ] Implement HTTP/Timer trigger
- [ ] Download ZIP from Finlex
- [ ] Upload to Blob Storage
- [ ] Trigger processing via blob event

### Phase 3: Processing Function
- [ ] Extract ZIP contents
- [ ] Parse XML/PDF documents
- [ ] Chunk text with overlap
- [ ] Generate metadata

### Phase 4: Enrichment & Indexing
- [ ] Generate embeddings via Azure OpenAI
- [ ] Create AI Search index schema
- [ ] Batch upload to AI Search
- [ ] Handle errors and retries

### Phase 5: Monitoring & Operations
- [ ] Application Insights integration
- [ ] Error handling and dead-letter queue
- [ ] Idempotency (skip already-processed documents)
- [ ] Manual re-processing capability

## Alternative: Container Apps Job

Instead of Functions, could use **Container Apps Job**:
- Better for long-running batch processes
- More control over execution environment
- Easier to run locally and debug
- CRON-based scheduling built-in
- Still in same Container Apps Environment

## Next Steps

1. Review requirements and architecture
2. Choose implementation: Functions vs Container Apps Job
3. Create infrastructure Bicep modules
4. Implement download and processing logic
5. Set up CI/CD pipeline
6. Deploy and test with sample Finlex data
