# Multi-Stage Finlex Ingestion Pipeline

A blob-storage-based multi-stage architecture for ingesting Finnish legal documents into Azure AI Search.

## Architecture Overview

This pipeline splits the ingestion process into 5 independent stages, each with its own Container Apps Job and blob storage for intermediate results.

### Pipeline Stages

```
Stage 1: Download & Extract (2-4 min)
  └─> finlex-raw/

Stage 2: Parse XML (5-10 min)
  └─> finlex-parsed/

Stage 3: Chunk Documents (5-10 min)
  └─> finlex-chunks/

Stage 4: Generate Embeddings (15-30 min)
  └─> finlex-embedded/

Stage 5: Upload to AI Search (5-10 min)
  └─> finlex-multi-index
```

**Total estimated time: 32-64 minutes**

## Key Benefits

### 1. **Faster Iteration**
- Skip stages that don't need re-running
- Test chunking strategies without re-downloading
- Experiment with embeddings without re-parsing
- Modify indexing without regenerating embeddings

### 2. **Better Debugging**
- Inspect intermediate results in blob storage
- Identify exact stage where issues occur
- Resume from any checkpoint after failures
- Compare outputs between runs

### 3. **Independent Testing**
- Run stages locally with same code
- Test individual stages without full pipeline
- Parallel development of different stages
- Easy A/B testing of stage implementations

### 4. **Resource Optimization**
- Only Stage 4 needs OpenAI access (lower costs)
- Only Stage 5 needs Search permissions
- Stages 1-3 run without external API calls
- Configurable CPU/memory per stage

## Blob Storage Structure

```
finlex-raw/
  2024/
    SF_2024_123.xml
    SF_2024_124.xml
    ...
  2025/
    SF_2025_1.xml
    ...

finlex-parsed/
  2024/
    SF_2024_123.json      # Structured document data
    SF_2024_124.json
    ...

finlex-chunks/
  2024/
    SF_2024_123.jsonl     # Array of chunks with metadata
    SF_2024_124.jsonl
    ...

finlex-embedded/
  2024/
    SF_2024_123.jsonl     # Chunks + vectors
    SF_2024_124.jsonl
    ...

finlex-indexed/
  2024/
    SF_2024_123.json      # Indexing metadata
    SF_2024_124.json
    ...
```

## Deployment

### Prerequisites
- Azure CLI installed and authenticated
- Resource group with:
  - Container Registry
  - Container Apps Environment
  - Storage Account
  - AI Search service
  - Azure OpenAI service (with text-embedding-3-small deployment)

### Deploy Pipeline

```powershell
# Deploy all 5 stages
./deploy-multi.ps1 -ResourceGroup "rg-ailz-lab" -TargetYears "2024,2025"
```

This will:
1. Build 5 container images (one per stage)
2. Deploy 5 Container Apps Jobs
3. Create blob storage containers
4. Configure RBAC permissions

## Running the Pipeline

### Sequential Execution (Recommended)

Run stages in order, waiting for each to complete:

```powershell
# Stage 1: Download & Extract (2-4 minutes)
az containerapp job start -n finlex-stage1-download-job -g rg-ailz-lab
az containerapp job execution list -n finlex-stage1-download-job -g rg-ailz-lab --query "[0].properties.status"

# Stage 2: Parse XML (5-10 minutes)
az containerapp job start -n finlex-stage2-parse-job -g rg-ailz-lab
az containerapp job execution list -n finlex-stage2-parse-job -g rg-ailz-lab --query "[0].properties.status"

# Stage 3: Chunk documents (5-10 minutes)
az containerapp job start -n finlex-stage3-chunk-job -g rg-ailz-lab
az containerapp job execution list -n finlex-stage3-chunk-job -g rg-ailz-lab --query "[0].properties.status"

# Stage 4: Generate embeddings (15-30 minutes)
az containerapp job start -n finlex-stage4-embed-job -g rg-ailz-lab
az containerapp job execution list -n finlex-stage4-embed-job -g rg-ailz-lab --query "[0].properties.status"

# Stage 5: Upload to AI Search (5-10 minutes)
az containerapp job start -n finlex-stage5-index-job -g rg-ailz-lab
az containerapp job execution list -n finlex-stage5-index-job -g rg-ailz-lab --query "[0].properties.status"
```

### Check Execution Status

```powershell
# Get latest execution for a stage
$execution = az containerapp job execution list -n finlex-stage1-download-job -g rg-ailz-lab --query "[0].name" -o tsv

# View logs
az containerapp job logs show -n finlex-stage1-download-job -g rg-ailz-lab --execution $execution
```

### Skip Stages

If intermediate results already exist, set `SKIP_EXISTING=true` (default):

```powershell
# Re-run only Stage 4 (embeddings) with new model
# Stages 1-3 will skip existing files
az containerapp job start -n finlex-stage4-embed-job -g rg-ailz-lab
```

## Local Testing

Run stages locally for development:

```powershell
# Set up environment
$env:STORAGE_ACCOUNT_NAME = "stailzezle7syi"
$env:AZURE_SEARCH_ENDPOINT = "https://srch-ailz-ezle7syi.search.windows.net"
$env:AZURE_SEARCH_INDEX = "finlex-multi-index"
$env:AZURE_OPENAI_ENDPOINT = "https://foundry-ezle7syi.openai.azure.com/"
$env:AZURE_OPENAI_DEPLOYMENT = "text-embedding-3-small"
$env:AZURE_OPENAI_DIMENSIONS = "1536"
$env:TARGET_YEARS = "2024"
$env:SKIP_EXISTING = "false"

# Install dependencies
pip install -r requirements.txt

# Run individual stage
cd src-multi
python stage1_download.py
python stage2_parse.py
python stage3_chunk.py
python stage4_embed.py
python stage5_index.py
```

## Debugging Workflows

### Inspect Intermediate Results

```powershell
# List parsed documents
az storage blob list --account-name stailzezle7syi --container-name finlex-parsed --prefix "2024/" -o table

# Download a parsed document
az storage blob download --account-name stailzezle7syi --container-name finlex-parsed --name "2024/SF_2024_123.json" --file "debug.json"

# View chunks for a document
az storage blob download --account-name stailzezle7syi --container-name finlex-chunks --name "2024/SF_2024_123.jsonl" --file "chunks.jsonl"
```

### Test Chunking Strategy

```powershell
# Modify stage3_chunk.py chunking logic
# Clear existing chunks
az storage blob delete-batch --account-name stailzezle7syi --source finlex-chunks

# Re-run chunking
az containerapp job start -n finlex-stage3-chunk-job -g rg-ailz-lab

# Inspect new chunks
az storage blob download --account-name stailzezle7syi --container-name finlex-chunks --name "2024/SF_2024_123.jsonl" --file "new-chunks.jsonl"
```

### Compare Embeddings

```powershell
# Run Stage 4 with different model
# Update job environment variable AZURE_OPENAI_DEPLOYMENT
# Clear embedded container and re-run

# Compare vector dimensions
az storage blob download --account-name stailzezle7syi --container-name finlex-embedded --name "2024/SF_2024_123.jsonl" --file "embedded.jsonl"
```

## Environment Variables

Each stage uses these environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TARGET_YEARS` | No | `2024,2025` | Comma-separated years to process |
| `SKIP_EXISTING` | No | `true` | Skip files that already exist in output |
| `STORAGE_ACCOUNT_NAME` | Yes | - | Azure Storage account name |
| `AZURE_SEARCH_ENDPOINT` | Yes (Stage 5) | - | AI Search endpoint URL |
| `AZURE_SEARCH_INDEX` | Yes (Stage 5) | `finlex-multi-index` | Search index name |
| `AZURE_OPENAI_ENDPOINT` | Yes (Stage 4) | - | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_DEPLOYMENT` | Yes (Stage 4) | `text-embedding-3-small` | Embedding model deployment |
| `AZURE_OPENAI_DIMENSIONS` | No | `1536` | Vector dimensions |

## Comparison with Monolithic Pipeline

| Aspect | Monolithic | Multi-Stage |
|--------|-----------|-------------|
| **Total Time** | 30-60 min | 32-64 min |
| **Debugging** | All-or-nothing | Stage-by-stage |
| **Iteration** | Full re-run | Skip unchanged stages |
| **Storage** | In-memory | Blob storage |
| **Observability** | Final result only | Intermediate results |
| **Failure Recovery** | Start from scratch | Resume from checkpoint |
| **Testing** | Full pipeline | Individual stages |
| **Cost** | Lower (less storage) | Higher (blob storage) |

## Best Practices

### 1. Development Workflow
1. Test stages locally first
2. Deploy to Azure once stable
3. Use `SKIP_EXISTING=true` for iterative development
4. Keep intermediate results during development

### 2. Production Workflow
1. Run full pipeline sequentially
2. Monitor each stage for completion
3. Clean up intermediate blobs after successful indexing
4. Use `SKIP_EXISTING=true` for incremental updates

### 3. Troubleshooting
- Check execution logs first
- Inspect blob storage for stage outputs
- Test failed stage locally with same data
- Use smaller `TARGET_YEARS` for faster debugging

## Performance Tips

- **Stage 1**: Fast, download bandwidth limited
- **Stage 2**: CPU bound, optimize XML parsing if needed
- **Stage 3**: Fast, memory efficient with streaming
- **Stage 4**: Slowest, limited by OpenAI TPM quota (120K)
- **Stage 5**: Network bound, batch size optimized at 100

## Future Enhancements

- Event Grid triggers for automatic stage progression
- Azure Functions for lightweight orchestration
- Parallel processing within stages (multiple years)
- Metrics and monitoring dashboards
- Automatic cleanup of intermediate blobs
- Delta ingestion (only new documents)
