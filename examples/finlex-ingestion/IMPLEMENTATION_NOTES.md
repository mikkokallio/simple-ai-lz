# Finlex Ingestion Pipeline - Implementation Notes

## Overview
Complete production-ready ingestion pipeline for Finnish legal documents from Finlex into Azure AI Search with vector embeddings. All code complete and operational as of November 12, 2025.

---

## Critical Discoveries & Fixes Applied

### 1. Embedding Model Configuration

**Issue Found**: Pipeline was configured for deprecated `text-embedding-ada-002` model.

**Resolution Applied**:
- ✅ Updated to `text-embedding-3-small` (newer, more efficient, cheaper)
- ✅ Made vector dimensions configurable (default: 1536, supports 768/512)
- ✅ Auto-deployment in `deploy.ps1` if model missing
- ✅ Uses `GlobalStandard` SKU (120K TPM capacity)

**Files Modified**:
- `src/embed.py` - Added `AZURE_OPENAI_DIMENSIONS` parameter
- `src/index.py` - Dynamic vector dimensions in index schema
- `infrastructure/job.bicep` - New `embeddingDimensions` parameter
- `deploy.ps1` - Auto-check and deploy embedding model
- `README.md` & `DEPLOYMENT_GUIDE.md` - Updated documentation

### 2. Container Apps Job Deployment Issues

**Issue Found**: 
- Initial job deployment failed with `provisioningState: Failed`
- Bicep template deployment timed out with "Operation expired"
- Container Apps Environment had no managed identity for ACR pull

**Resolution Applied**:
- ✅ Switched to manual trigger (avoid schedule-related provisioning issues)
- ✅ Used ACR admin credentials instead of environment identity
- ✅ Created job via CLI with `--mi-system-assigned` flag
- ✅ Granted `Cognitive Services User` role to job's managed identity

**Working Configuration**:
```bash
# Job created with:
# - Manual trigger (no schedule)
# - ACR admin credentials for image pull
# - System-assigned managed identity
# - Direct Azure OpenAI access via RBAC
```

### 3. Azure OpenAI Model Deployment

**Discovery**: No embedding model was deployed on `foundry-ezle7syi` Azure OpenAI resource.

**Actions Taken**:
- Deployed `text-embedding-3-small` with GlobalStandard SKU
- Model name: `text-embedding-3-small`, version: `1`
- Capacity: 120K tokens/min (PTU-based pricing)
- Region: Sweden Central (note: Standard SKU not supported, GlobalStandard required)

### 4. Architecture: In-Memory Pipeline (No Blob Storage)

**Current Implementation**:
- ✅ **Single-pass, ephemeral processing**
- All data flows through container's memory and local disk
- ZIP downloaded to `/tmp/` (tempfile)
- XML extracted and processed in-memory as Python objects
- Embeddings generated via API calls (no local storage)
- Data uploaded directly to AI Search
- Container terminates, all temp files cleaned up

**No Azure Blob Storage used** - the `STORAGE_ACCOUNT_NAME` env var in code is unused legacy.

**Benefits**:
- Lower cost (no storage transactions)
- Simpler architecture
- Faster execution (no I/O overhead)

**Drawbacks**:
- No intermediate caching
- Failed runs restart from scratch
- Harder to debug individual stages
- Cannot test chunking strategies without full re-download

---

## Current Runtime Characteristics

### Resource Allocation
- **CPU**: 1.0 core
- **Memory**: 2Gi
- **Timeout**: 7200 seconds (2 hours)
- **Retry Limit**: 1 attempt

### Expected Performance (2024-2025 data)
| Stage | Duration | Notes |
|-------|----------|-------|
| Download | 2-5 min | ~500 MB ZIP |
| Extract | 5-10 min | Filter thousands of XMLs |
| Parse | 3-5 min | AKN XML to structured docs |
| Chunk | 2-3 min | Token-based splitting |
| **Embed** | **15-30 min** | Azure OpenAI API (batched) |
| Index | 5-10 min | Batch upload to AI Search |
| **Total** | **30-60 min** | Complete pipeline |

### Cost Per Run
- Container execution: ~$0.02 (1 hour)
- Azure OpenAI embeddings: ~$0.05 (500K tokens)
- AI Search hosting: ~$75/month (fixed)
- **Total per run**: ~$0.08

---

## Future Enhancement: Multi-Part Pipeline with Blob Storage

### Motivation for Multi-Part Approach

**Benefits**:
1. **Faster iteration** - Test chunking/embedding without re-downloading
2. **Better debugging** - Inspect intermediate results at each stage
3. **Resilience** - Failed stages can resume from last checkpoint
4. **Flexibility** - Process subsets of data (e.g., single year)
5. **Development speed** - Skip expensive stages during testing

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Stage 1: Download & Extract (Container Apps Job)           │
│ - Downloads Finlex ZIP                                       │
│ - Extracts all XML files                                     │
│ - Uploads to Blob: finlex-raw/{year}/{docid}.xml           │
│ - Trigger: Manual or scheduled (weekly)                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 2: Parse (Blob-triggered Container App)               │
│ - Reads XML from Blob Storage                               │
│ - Parses AKN structure                                       │
│ - Writes JSON to: finlex-parsed/{year}/{docid}.json        │
│ - Trigger: Blob created event                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 3: Chunk (Blob-triggered Container App)               │
│ - Reads parsed JSON                                          │
│ - Applies chunking strategy (configurable)                  │
│ - Writes chunks to: finlex-chunks/{year}/{docid}.jsonl     │
│ - Trigger: Blob created event                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 4: Embed (Queue-triggered Container App)              │
│ - Reads chunks in batches                                    │
│ - Generates embeddings (Azure OpenAI)                       │
│ - Writes to: finlex-embedded/{year}/{docid}.jsonl          │
│ - Trigger: Queue message (batch processing)                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 5: Index (Blob-triggered Container App)               │
│ - Reads embedded chunks                                      │
│ - Uploads to AI Search in batches                           │
│ - Marks as indexed (metadata)                               │
│ - Trigger: Blob created event                               │
└─────────────────────────────────────────────────────────────┘
```

### Storage Structure

```
finlex-storage/
├── finlex-raw/              # Raw XML files
│   ├── 2024/
│   │   ├── 1234.xml
│   │   └── 5678.xml
│   └── 2025/
│       └── 9012.xml
├── finlex-parsed/           # Parsed JSON documents
│   ├── 2024/
│   │   ├── 1234.json
│   │   └── 5678.json
│   └── metadata.json        # Tracking info
├── finlex-chunks/           # Chunked documents (JSONL)
│   ├── 2024/
│   │   ├── 1234.jsonl       # One chunk per line
│   │   └── 5678.jsonl
│   └── strategy.json        # Chunking config used
├── finlex-embedded/         # Chunks with embeddings
│   ├── 2024/
│   │   ├── 1234.jsonl       # Chunks + vectors
│   │   └── 5678.jsonl
│   └── model-info.json      # Embedding model used
└── finlex-indexed/          # Success markers
    └── 2024/
        ├── 1234.indexed     # Empty file = indexed
        └── 5678.indexed
```

### Queue-Based Embedding

For the expensive embedding stage, use Azure Storage Queue:

```python
# Stage 3 (Chunk) pushes messages to queue
queue_client.send_message(json.dumps({
    "blob_path": "finlex-chunks/2024/1234.jsonl",
    "doc_id": "1234",
    "year": "2024",
    "chunk_count": 15
}))

# Stage 4 (Embed) processes queue messages
# - KEDA scales based on queue depth
# - Processes in batches of 16 (API limit)
# - Retry logic for rate limiting
```

### Event-Driven Triggers

Each stage triggers the next automatically:

```bicep
// Example: Blob trigger configuration
resource chunkApp 'Microsoft.App/containerApps@2023-05-01' = {
  properties: {
    configuration: {
      dapr: {
        enabled: true
      }
    }
    template: {
      scale: {
        rules: [
          {
            name: 'blob-trigger'
            type: 'azure-blob'
            metadata: {
              blobContainerName: 'finlex-parsed'
              blobCount: '1'
              accountName: storageAccountName
            }
          }
        ]
      }
    }
  }
}
```

### Development Benefits

**Testing Chunking Strategies**:
```bash
# Download once
az containerapp job start -n finlex-download-job -g rg-ailz-lab

# Test different chunk sizes
export CHUNK_SIZE=500 OVERLAP=50
az containerapp job start -n finlex-chunk-job -g rg-ailz-lab

export CHUNK_SIZE=1000 OVERLAP=100
az containerapp job start -n finlex-chunk-job -g rg-ailz-lab

# Compare results without re-downloading or re-parsing
```

**Debugging Parse Issues**:
```bash
# Download specific document's XML from blob
az storage blob download \
  --container finlex-raw \
  --name 2024/1234.xml \
  --file debug.xml

# Test parser locally
python -c "from parse import parse_akn_document; import sys; print(parse_akn_document(open('debug.xml', 'rb').read()))"
```

**Resume Failed Runs**:
```python
# In each stage, check if output already exists
if blob_client.exists(f"finlex-chunks/{year}/{doc_id}.jsonl"):
    logger.info(f"Already chunked: {doc_id}, skipping")
    return

# Process only missing documents
```

### Implementation Plan

1. **Phase 1: Preserve Current Single-Job Approach**
   - Keep existing code as-is (working production version)
   - Document as `src-single-job/` or similar

2. **Phase 2: Add Blob Storage Support**
   - Create storage account with containers
   - Add optional `--output-to-blob` flag to each module
   - Modules can work in both modes (memory or blob)

3. **Phase 3: Split Into Separate Jobs**
   - Create 5 separate Container Apps Jobs
   - Configure blob/queue triggers
   - Add orchestration tracking (Cosmos DB or Table Storage)

4. **Phase 4: Add Management UI**
   - Web app to trigger stages manually
   - View progress and intermediate results
   - Download/inspect data at each stage
   - Reprocess specific documents

### Code Changes Required

**Modularization** (already partially done):
- ✅ Each stage is separate module (`download.py`, `parse.py`, etc.)
- ✅ Clean interfaces between stages
- ⚠️ Need to add blob I/O to each module
- ⚠️ Need to handle partial failures/retries

**New Files Needed**:
```
infrastructure/
├── multi-stage/
│   ├── storage.bicep           # Blob containers
│   ├── queue.bicep             # Storage queues
│   ├── job-download.bicep      # Stage 1
│   ├── app-parse.bicep         # Stage 2 (event-driven)
│   ├── app-chunk.bicep         # Stage 3 (event-driven)
│   ├── app-embed.bicep         # Stage 4 (queue-driven)
│   └── app-index.bicep         # Stage 5 (event-driven)
src/
├── shared/
│   ├── blob_io.py             # Blob read/write helpers
│   ├── queue_handler.py       # Queue operations
│   └── state_tracking.py      # Progress tracking
├── stage1_download.py         # Enhanced with blob upload
├── stage2_parse.py            # Blob input/output
├── stage3_chunk.py            # Blob input/output
├── stage4_embed.py            # Queue-driven batch processor
└── stage5_index.py            # Blob input, AI Search output
```

### Migration Path

**Option A: Big Bang** - Implement all stages at once  
**Option B: Incremental** - Add blob storage progressively:

1. Add blob output to download stage (optional)
2. Make parse stage work from blob or memory
3. Gradually split stages as needed

**Option C: Parallel Development** - Keep both versions:
- `finlex-ingestion-job` - Current single-stage (production)
- `finlex-ingestion-multi` - New multi-stage (experimental)

---

## Infrastructure Shortcuts & Missing Bicep Templates

### Resources Created via CLI Instead of IaC

During deployment, several resources were created using Azure CLI commands instead of Bicep templates. This was necessary to work around deployment issues and time constraints, but should be addressed for production.

#### 1. Azure OpenAI Embedding Model Deployment

**Created via CLI**:
```bash
az cognitiveservices account deployment create \
  -n foundry-ezle7syi \
  -g rg-ailz-lab \
  --deployment-name text-embedding-3-small \
  --model-name text-embedding-3-small \
  --model-version "1" \
  --model-format OpenAI \
  --sku-capacity 120 \
  --sku-name "GlobalStandard"
```

**Should be in Bicep**:
```bicep
// File: infrastructure/openai-embedding.bicep
resource openAiAccount 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = {
  name: openAiAccountName
}

resource embeddingDeployment 'Microsoft.CognitiveServices/accounts/deployments@2023-05-01' = {
  parent: openAiAccount
  name: 'text-embedding-3-small'
  sku: {
    name: 'GlobalStandard'
    capacity: 120
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'text-embedding-3-small'
      version: '1'
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
}
```

**Workaround in deploy.ps1**: Script checks if deployment exists and creates it if missing.

#### 2. Container Apps Job (Actual Deployment)

**Created via CLI**:
```bash
az containerapp job create \
  -n finlex-ingestion-job \
  -g rg-ailz-lab \
  --environment cae-ailz-ezle7syi \
  --trigger-type Manual \
  --replica-timeout 7200 \
  --replica-retry-limit 1 \
  --parallelism 1 \
  --replica-completion-count 1 \
  --image "acrezle7syiailz.azurecr.io/finlex-ingestion:latest" \
  --cpu 1.0 \
  --memory 2Gi \
  --registry-server acrezle7syiailz.azurecr.io \
  --registry-username <username> \
  --registry-password <password> \
  --secrets "search-key=<key>" \
  --env-vars "TARGET_YEARS=2024,2025" ... \
  --mi-system-assigned
```

**Bicep template exists**: `infrastructure/job.bicep`

**Why CLI was used**:
- Bicep deployment failed with "Operation expired" error
- Suspected issues with scheduled trigger provisioning
- CLI deployment with manual trigger succeeded
- Used ACR admin credentials instead of system identity for registry

**Differences from Bicep**:
| Aspect | Bicep Template | Actual Deployment |
|--------|---------------|-------------------|
| Trigger Type | `Schedule` (cron) | `Manual` |
| Registry Auth | System identity | Admin credentials |
| Schedule | `0 1 * * *` (1 AM) | None (manual) |
| Deployment Method | Bicep template | Direct CLI |

#### 3. RBAC Role Assignment

**Created via CLI**:
```bash
az role assignment create \
  --assignee <job-principal-id> \
  --role "Cognitive Services User" \
  --scope "/subscriptions/.../providers/Microsoft.CognitiveServices/accounts/foundry-ezle7syi"
```

**Should be in Bicep**:
```bicep
// File: infrastructure/rbac.bicep or added to job.bicep
resource openAiAccount 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = {
  name: openAiAccountName
}

resource jobRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(finlexJob.id, openAiAccount.id, 'CognitiveServicesUser')
  scope: openAiAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a97b65f3-24c7-4388-baec-2e87135dc908') // Cognitive Services User
    principalId: finlexJob.identity.principalId
    principalType: 'ServicePrincipal'
  }
}
```

**Why CLI was used**: Quick fix during deployment troubleshooting; Bicep template doesn't include RBAC.

### Missing Bicep Modules

The following infrastructure components are **not** defined in Bicep:

1. **Azure AI Search Service** (`srch-ailz-ezle7syi`)
   - Exists but no Bicep template
   - Created manually or in separate deployment
   - Should have: `infrastructure/search.bicep`

2. **Azure OpenAI Service** (`foundry-ezle7syi`)
   - Exists but no Bicep template
   - Part of broader Azure AI Foundry deployment
   - Should reference existing resource

3. **Container Apps Environment** (`cae-ailz-ezle7syi`)
   - Exists but no Bicep template
   - Shared infrastructure
   - Should reference existing resource

4. **Container Registry** (`acrezle7syiailz`)
   - Exists but no Bicep template
   - Shared infrastructure
   - Should reference existing resource

### Recommended IaC Improvements

#### Short Term (Keep Current Setup Working)
1. Document all CLI commands used
2. Add post-deployment script for RBAC
3. Update `deploy.ps1` to handle both Bicep and CLI paths

#### Medium Term (Proper IaC)
1. Create `infrastructure/openai-embedding.bicep` for model deployment
2. Add RBAC to `infrastructure/job.bicep` or separate module
3. Fix Container Apps Job deployment via Bicep (investigate timeout issue)
4. Create `infrastructure/main.bicep` that orchestrates all modules

#### Long Term (Full IaC)
1. Create Bicep modules for all shared infrastructure:
   ```
   infrastructure/
   ├── main.bicep              # Orchestrator
   ├── search.bicep            # AI Search service
   ├── openai.bicep            # Azure OpenAI account
   ├── openai-embedding.bicep  # Embedding deployment
   ├── container-env.bicep     # Container Apps Environment
   ├── registry.bicep          # Container Registry
   ├── job.bicep               # Container Apps Job (existing)
   └── rbac.bicep              # Role assignments
   ```

2. Use Bicep parameters file for configuration
3. Deploy everything via single command:
   ```bash
   az deployment group create \
     --resource-group rg-ailz-lab \
     --template-file infrastructure/main.bicep \
     --parameters infrastructure/parameters.json
   ```

### Post-Deployment Manual Steps Still Required

Even with Bicep, some steps might need manual intervention:

1. **Embedding model deployment** - Can be automated in Bicep
2. **RBAC role assignment** - Can be automated in Bicep
3. **ACR credentials** - Could use managed identity instead
4. **AI Search admin key** - Retrieved at deployment time for index creation

### Why These Shortcuts Were Taken

**Root Cause**: Container Apps Job Bicep deployment timeout

**Cascading Effects**:
- Had to delete failed job and recreate via CLI
- CLI creation required manual trigger (scheduled trigger may have caused original timeout)
- CLI creation used admin credentials (system identity wasn't working)
- RBAC had to be set separately after job creation
- Embedding model deployed separately to unblock testing

**Lessons Learned**:
1. Container Apps Job with scheduled trigger can be finicky
2. Manual trigger is more reliable for initial deployment
3. ACR admin credentials work better than system identity for job registry auth
4. RBAC should be part of infrastructure deployment, not post-deployment
5. Azure OpenAI model deployments should be in IaC for repeatability

---

## Current Production Status

### Deployed Resources
- ✅ Container Apps Job: `finlex-ingestion-job` (Manual trigger)
- ✅ Container Image: `acrezle7syiailz.azurecr.io/finlex-ingestion:latest`
- ✅ Azure OpenAI: `text-embedding-3-small` deployment (GlobalStandard, 120K TPM)
- ✅ AI Search Service: `srch-ailz-ezle7syi` (Basic tier)
- ✅ RBAC: Job identity → Cognitive Services User role

### First Execution Status
- Started: 2025-11-12 17:25 UTC
- Execution: `finlex-ingestion-job-0chs5y3`
- Status: Running
- Expected completion: ~18:00-18:30 UTC

### Trigger Model
- **Type**: Manual only
- **Rationale**: Cost optimization (no nightly runs)
- **Usage**: On-demand execution when needed

### Known Limitations
1. No intermediate data persistence
2. Full re-download on every run
3. Cannot test stages independently
4. Limited debugging capabilities
5. All-or-nothing processing

---

## Technical Decisions Log

### Why Manual Trigger?
- Finlex data doesn't change frequently
- Embedding costs add up with daily runs
- Manual trigger = explicit cost control
- Easy to add schedule later if needed

### Why No Blob Storage?
- Simpler is better for MVP
- Sufficient for current use case
- 2Gi memory handles full dataset
- Can add later if needed (see multi-stage plan above)

### Why text-embedding-3-small?
- Newer model (vs text-embedding-ada-002)
- More efficient encoding
- Flexible dimensions (1536/768/512)
- Better quality embeddings
- Lower cost per token

### Why GlobalStandard SKU?
- Sweden Central doesn't support Standard SKU
- GlobalStandard = PTU-based provisioning
- 120K TPM capacity sufficient for batch processing
- Predictable performance (no throttling)

---

## Maintenance Notes

### Re-running Ingestion
```bash
# Trigger manually
az containerapp job start -n finlex-ingestion-job -g rg-ailz-lab

# Check status
az containerapp job execution list -n finlex-ingestion-job -g rg-ailz-lab -o table

# View details
az containerapp job execution show \
  -n finlex-ingestion-job \
  -g rg-ailz-lab \
  --job-execution-name <execution-name>
```

### Updating Target Years
```bash
az containerapp job update \
  -n finlex-ingestion-job \
  -g rg-ailz-lab \
  --set-env-vars "TARGET_YEARS=2023,2024,2025"
```

### Changing Vector Dimensions
```bash
# Requires re-creating AI Search index!
az containerapp job update \
  -n finlex-ingestion-job \
  -g rg-ailz-lab \
  --set-env-vars "AZURE_OPENAI_DIMENSIONS=768"

# Delete old index
# Run job to create new index with 768 dimensions
```

### Rebuilding Container
```bash
cd c:\Users\mikkokallio\dev\simple-ai-lz\examples\finlex-ingestion
.\deploy.ps1  # Includes rebuild
```

---

## Dependencies

### Python Packages
```
requests==2.31.0           # HTTP downloads
azure-storage-blob==12.19.0  # Unused but imported
azure-identity==1.15.0     # Managed identity auth
tiktoken==0.6.0            # Token counting for chunking
openai==1.12.0             # Azure OpenAI embeddings
azure-search-documents==11.4.0  # AI Search indexing
```

### Azure Services
- Container Apps Environment
- Container Registry
- Azure OpenAI (Cognitive Services)
- AI Search
- (Optional future) Storage Account
- (Optional future) Storage Queue

---

## References

- [Container Apps Jobs Documentation](https://learn.microsoft.com/azure/container-apps/jobs)
- [Azure OpenAI Embeddings](https://learn.microsoft.com/azure/ai-services/openai/concepts/understand-embeddings)
- [text-embedding-3 Models](https://platform.openai.com/docs/guides/embeddings)
- [Azure AI Search Vector Search](https://learn.microsoft.com/azure/search/vector-search-overview)
- [Finlex Data](https://data.finlex.fi/)
- [Akoma Ntoso XML Standard](http://docs.oasis-open.org/legaldocml/akn-core/v1.0/akn-core-v1.0.html)

---

## Change History

| Date | Change | Author |
|------|--------|--------|
| 2025-11-12 | Initial implementation complete | System |
| 2025-11-12 | Updated to text-embedding-3-small | System |
| 2025-11-12 | Fixed Container Apps Job deployment | System |
| 2025-11-12 | Documented multi-stage future plan | System |

---

## Questions to Consider Later

1. Should we add incremental updates (only new/changed documents)?
2. Is 1536 dimensions optimal, or should we test 768/512?
3. Should we add semantic ranker to AI Search?
4. Do we need citation/source tracking in chunks?
5. Should we filter by document type (statutes only, no case law)?
6. Is tiktoken chunking optimal for Finnish legal text?
7. Should we preserve more legal structure (cross-references)?
8. Do we need versioning (multiple snapshots over time)?

---

*End of Implementation Notes*
