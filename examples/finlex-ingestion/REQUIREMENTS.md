# Finlex Ingestion Pipeline - Requirements Specification

## 1. Functional Requirements

### FR1: Data Acquisition
- **FR1.1**: System shall download legal text archives from Finlex public URL
- **FR1.2**: System shall support ZIP archive format
- **FR1.3**: System shall store downloaded archives in Azure Blob Storage
- **FR1.4**: System shall handle download failures with retry logic (3 attempts)
- **FR1.5**: System shall verify archive integrity (checksum validation)

### FR2: Data Extraction
- **FR2.1**: System shall extract files from ZIP archives
- **FR2.2**: System shall support XML and PDF file formats
- **FR2.3**: System shall preserve file metadata (name, size, modified date)
- **FR2.4**: System shall handle corrupted archives gracefully
- **FR2.5**: System shall store extracted files in separate container

### FR3: Document Processing
- **FR3.1**: System shall parse XML documents to extract structured legal text
- **FR3.2**: System shall parse PDF documents using Azure Document Intelligence (optional)
- **FR3.3**: System shall identify document type (statute, decree, case law)
- **FR3.4**: System shall extract document metadata:
  - Document ID (Finlex identifier)
  - Title
  - Publication date
  - Effective date
  - Hierarchical structure (law → chapter → section → paragraph)
- **FR3.5**: System shall preserve cross-references between documents

### FR4: Text Chunking
- **FR4.1**: System shall split documents into chunks of 800-1000 tokens
- **FR4.2**: System shall maintain 100-token overlap between consecutive chunks
- **FR4.3**: System shall respect natural boundaries (paragraphs, sections)
- **FR4.4**: System shall include parent context in chunk metadata
- **FR4.5**: System shall generate unique chunk IDs (document-chunk-index)

### FR5: Vector Embeddings
- **FR5.1**: System shall generate embeddings using Azure OpenAI (text-embedding-ada-002)
- **FR5.2**: System shall batch embedding requests (max 16 texts per request)
- **FR5.3**: System shall handle rate limiting with exponential backoff
- **FR5.4**: System shall validate embedding dimensions (1536)
- **FR5.5**: System shall cache embeddings to avoid regeneration

### FR6: Indexing
- **FR6.1**: System shall create AI Search index with vector search enabled
- **FR6.2**: System shall upload chunks to AI Search in batches (max 1000 per batch)
- **FR6.3**: System shall support incremental updates (only new/modified documents)
- **FR6.4**: System shall provide idempotency (skip already-indexed chunks)
- **FR6.5**: System shall handle indexing failures with retry logic

### FR7: Scheduling
- **FR7.1**: System shall support timer-based triggers (daily at 2 AM)
- **FR7.2**: System shall support manual HTTP-triggered execution
- **FR7.3**: System shall prevent concurrent executions (singleton pattern)
- **FR7.4**: System shall provide progress tracking

### FR8: Monitoring
- **FR8.1**: System shall log all operations to Application Insights
- **FR8.2**: System shall track metrics:
  - Documents downloaded
  - Documents processed
  - Chunks created
  - Chunks indexed
  - Processing time
  - Error rates
- **FR8.3**: System shall alert on processing failures
- **FR8.4**: System shall provide execution history

## 2. Non-Functional Requirements

### NFR1: Performance
- **NFR1.1**: System shall process 1000 documents per hour minimum
- **NFR1.2**: System shall complete full ingestion within 6 hours
- **NFR1.3**: System shall generate embeddings at 50 chunks/second minimum
- **NFR1.4**: System shall index at 100 chunks/second minimum

### NFR2: Scalability
- **NFR2.1**: System shall scale horizontally based on queue depth
- **NFR2.2**: System shall support processing archives up to 10 GB
- **NFR2.3**: System shall handle 100,000+ legal documents

### NFR3: Reliability
- **NFR3.1**: System shall achieve 99.5% uptime
- **NFR3.2**: System shall implement automatic retries for transient failures
- **NFR3.3**: System shall maintain data consistency (all-or-nothing indexing)
- **NFR3.4**: System shall recover from crashes without data loss

### NFR4: Security
- **NFR4.1**: System shall use managed identities for Azure service authentication
- **NFR4.2**: System shall store secrets in Azure Key Vault
- **NFR4.3**: System shall encrypt data at rest (Storage, AI Search)
- **NFR4.4**: System shall encrypt data in transit (HTTPS only)
- **NFR4.5**: System shall implement RBAC for resource access

### NFR5: Maintainability
- **NFR5.1**: System shall use TypeScript/Python for type safety
- **NFR5.2**: System shall include comprehensive logging
- **NFR5.3**: System shall follow single responsibility principle
- **NFR5.4**: System shall include unit tests (80% coverage minimum)
- **NFR5.5**: System shall document all configuration options

### NFR6: Cost Efficiency
- **NFR6.1**: System shall use consumption-based compute (pay-per-execution)
- **NFR6.2**: System shall optimize embedding calls (batch processing)
- **NFR6.3**: System shall use lifecycle policies for blob storage
- **NFR6.4**: System shall minimize AI Search index size (efficient chunking)

## 3. Technical Constraints

### TC1: Azure Services
- Must use existing Azure subscription and resource group
- Must deploy to Sweden Central region
- Must use existing Container Apps Environment
- Must reuse existing Azure OpenAI deployment

### TC2: Development Stack
- Node.js 20+ or Python 3.11+
- TypeScript 5+ (if using Node.js)
- Docker containers for deployment
- Bicep for infrastructure as code

### TC3: Compliance
- Must comply with GDPR (Finnish legal texts are public data)
- Must maintain audit trail of all operations
- Must support data deletion (right to be forgotten - not applicable for public data)

## 4. Integration Points

### External APIs
- **Finlex API**: Source of legal text data (public)
- **Azure OpenAI API**: Embedding generation
- **Azure AI Search API**: Document indexing
- **Azure Blob Storage API**: File storage

### Internal Services
- **Application Insights**: Telemetry and monitoring
- **Key Vault**: Secret management
- **Container Apps Environment**: Hosting platform

## 5. Data Model

### Blob Storage Structure
```
finlex-raw/
  └── YYYY-MM-DD/
      └── finlex-export-{timestamp}.zip

finlex-processed/
  └── YYYY-MM-DD/
      ├── {document-id}.xml
      ├── {document-id}.pdf
      └── metadata.json
```

### AI Search Document Structure
```json
{
  "id": "sd-123-456-001",
  "documentId": "sd-123-456",
  "documentType": "statute",
  "title": "Criminal Code, Chapter 1, Section 1",
  "content": "Full text of the section...",
  "contentVector": [0.123, 0.456, ...],
  "publicationDate": "2023-01-01T00:00:00Z",
  "effectiveDate": "2023-06-01T00:00:00Z",
  "hierarchy": "Criminal Code > Chapter 1 > Section 1",
  "section": "1",
  "chapter": "1",
  "url": "https://finlex.fi/...",
  "chunkIndex": 1,
  "totalChunks": 5,
  "lastModified": "2024-11-12T13:30:00Z"
}
```

## 6. Success Criteria

- [ ] Successfully downloads Finlex archive
- [ ] Extracts all documents from archive
- [ ] Parses and chunks all legal texts
- [ ] Generates embeddings for all chunks
- [ ] Indexes all chunks in AI Search
- [ ] Enables vector search on legal texts
- [ ] Processes full dataset in < 6 hours
- [ ] Achieves 99%+ indexing success rate
- [ ] Provides comprehensive monitoring dashboards
- [ ] Supports incremental updates

## 7. Out of Scope

- Real-time data ingestion (batch processing only)
- Custom NER/entity extraction (can be added later)
- Translation to other languages
- User-facing search interface (handled by other apps)
- Data export functionality
- Advanced legal document analysis (case law clustering, etc.)

## 8. Open Questions

1. **Finlex Data Format**: What's the exact structure of Finlex exports? (Need sample)
2. **Update Frequency**: How often does Finlex publish updates? (Daily, weekly?)
3. **Document Volume**: How many documents are in a typical export? (Sizing)
4. **Incremental Updates**: Does Finlex provide delta/incremental exports?
5. **Language**: Are documents in Finnish only or multilingual?
6. **Document Intelligence**: Is PDF extraction needed or is XML sufficient?
7. **Semantic Search**: Should we enable semantic ranker in AI Search?
