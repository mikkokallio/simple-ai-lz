# Finlex Legal Document Ingestion Pipeline - Implementation Guide

## ✅ What's Been Built

Complete production-ready Container Apps Job implementation with:

- **AI Search Service**: Deployed and running (`srch-ailz-ezle7syi`)
- **Python Pipeline**: Full implementation in `src/` directory
- **Infrastructure**: Bicep template for Container Apps Job
- **Deployment Script**: Automated PowerShell deployment

## Quick Start

### Deploy Everything

```powershell
cd c:\Users\mikkokallio\dev\simple-ai-lz\examples\finlex-ingestion

# Deploy with default years (2024, 2025)
# This will automatically deploy text-embedding-3-small if not present
.\deploy.ps1

# Or specify custom years
.\deploy.ps1 -TargetYears "2023,2024,2025"
```

### Manual Job Trigger

```bash
# Start job immediately (don't wait for schedule)
az containerapp job start -n finlex-ingestion-job -g rg-ailz-lab

# View execution history
az containerapp job execution list -n finlex-ingestion-job -g rg-ailz-lab -o table

# View logs from last run
az containerapp job logs show -n finlex-ingestion-job -g rg-ailz-lab
```

## Architecture

### Pipeline Stages

```
FINLEX API → DOWNLOAD → EXTRACT → PARSE → CHUNK → EMBED → INDEX
              (ZIP)      (XML)     (AKN)   (tokens) (vectors) (search)
```

### Components Created

1. **Azure AI Search**: `srch-ailz-ezle7syi` (Basic tier)
   - Vector search enabled (HNSW algorithm)
   - 1536-dimensional embeddings
   - Hybrid search (keyword + semantic)

2. **Python Modules**:
   - `download.py`: Fetches Finlex archive
   - `extract.py`: Filters XML by year
   - `parse.py`: Parses AKN legal XML format
   - `chunk.py`: Token-based chunking (tiktoken)
   - `embed.py`: Azure OpenAI embeddings
   - `index.py`: AI Search indexing

3. **Container Apps Job**: `finlex-ingestion-job`
   - Scheduled: Daily at 1 AM UTC
   - Resources: 1 CPU, 2 Gi memory
   - Timeout: 2 hours
   - Managed identity authentication

## Implementation Details

### Chunking Strategy
- **Size**: 800-1000 tokens per chunk
- **Overlap**: 100 tokens between chunks
- **Boundaries**: Respects sections and sentences
- **Encoding**: cl100k_base (matches text-embedding models)

### AI Search Index Schema

```json
{
  "name": "finlex-documents",
  "fields": [
    {"name": "id", "type": "String", "key": true},
    {"name": "document_id", "type": "String", "filterable": true},
    {"name": "title", "type": "String", "searchable": true},
    {"name": "content", "type": "String", "searchable": true},
    {"name": "content_vector", "type": "Collection(Single)", 
     "dimensions": 1536, "vector_search": true},
    {"name": "publication_date", "type": "String", "filterable": true},
    {"name": "year", "type": "String", "filterable": true},
    {"name": "section_number", "type": "String"},
    {"name": "section_heading", "type": "String"},
    {"name": "chunk_index", "type": "Int32"}
  ]
}
```

### Environment Variables

Set automatically by deployment:

| Variable | Purpose | Example |
|----------|---------|---------|
| `TARGET_YEARS` | Years to process | `2024,2025` |
| `FINLEX_URL` | Data source | `https://data.finlex.fi/download/kaikki` |
| `AZURE_OPENAI_ENDPOINT` | Embeddings | `https://foundry-ezle7syi.cognitiveservices.azure.com/` |
| `AZURE_OPENAI_DEPLOYMENT` | Model name | `text-embedding-3-small` |
| `AZURE_OPENAI_DIMENSIONS` | Vector dimensions | `1536` (or `768`, `512`) |
| `AZURE_SEARCH_ENDPOINT` | Search service | `https://srch-ailz-ezle7syi.search.windows.net` |
| `AZURE_SEARCH_KEY` | Admin key | (retrieved from service) |

## Project Structure

```
examples/finlex-ingestion/
├── src/
│   ├── main.py          # Pipeline orchestrator
│   ├── download.py      # Download Finlex archive (reused from previous_example)
│   ├── extract.py       # Extract XML files by year
│   ├── parse.py         # Parse AKN XML format (enhanced from previous_example)
│   ├── chunk.py         # Tiktoken-based chunking (NEW)
│   ├── embed.py         # Azure OpenAI embeddings (NEW)
│   └── index.py         # AI Search indexing (NEW)
├── infrastructure/
│   └── job.bicep        # Container Apps Job definition
├── previous_example/    # Original Azure Functions code (reference)
├── Dockerfile           # Python 3.11 container
├── requirements.txt     # Dependencies (tiktoken, openai, azure-search-documents)
├── deploy.ps1          # Deployment automation
└── README.md           # This file
```

## Deployment Steps (Automated)

The `deploy.ps1` script performs:

1. **Build Container**: `az acr build` pushes to existing ACR
2. **Retrieve Config**: Gets Container Apps Environment ID, OpenAI endpoint
3. **Get Search Key**: Retrieves AI Search admin key for index creation
4. **Deploy Job**: Creates Container Apps Job with all parameters

## Configuration

### Change Target Years

```bash
az containerapp job update \
  -n finlex-ingestion-job \
  -g rg-ailz-lab \
  --set-env-vars "TARGET_YEARS=2022,2023,2024,2025"
```

### Change Schedule (CRON)

Edit `infrastructure/job.bicep`:

```bicep
scheduleTriggerConfig: {
  cronExpression: '0 2 * * 0'  # Weekly on Sunday at 2 AM
  parallelism: 1
  replicaCompletionCount: 1
}
```

Redeploy:
```powershell
.\deploy.ps1 -SkipBuild
```

### Increase Resources

Edit `infrastructure/job.bicep`:

```bicep
resources: {
  cpu: json('2.0')      # More CPU = faster processing
  memory: '4Gi'         # More memory = handle larger datasets
}
```

## Performance Expectations

Typical run (2024-2025 data):

| Stage | Time | Details |
|-------|------|---------|
| Download | 2-5 min | ~500 MB ZIP archive |
| Extract | 5-10 min | Filter thousands of XML files |
| Parse | 3-5 min | AKN XML to structured docs |
| Chunk | 2-3 min | Token-based splitting |
| Embed | 15-30 min | Azure OpenAI API calls (batched) |
| Index | 5-10 min | Batch upload to AI Search |
| **Total** | **30-60 min** | Complete pipeline |

## Monitoring

### View Execution Status

```bash
# List all runs
az containerapp job execution list \
  -n finlex-ingestion-job \
  -g rg-ailz-lab \
  -o table

# Get specific execution
az containerapp job execution show \
  -n finlex-ingestion-job \
  -g rg-ailz-lab \
  --job-execution-name <execution-name>
```

### View Logs

```bash
# Latest execution logs
az containerapp job logs show \
  -n finlex-ingestion-job \
  -g rg-ailz-lab \
  --tail 100

# Follow logs (during execution)
az containerapp job logs show \
  -n finlex-ingestion-job \
  -g rg-ailz-lab \
  --follow
```

### Application Insights Queries

```kql
// All finlex job logs
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "finlex-ingestion-job"
| order by TimeGenerated desc
| project TimeGenerated, Log_s

// Pipeline stage completion
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "finlex-ingestion-job"
| where Log_s contains "STEP" or Log_s contains "completed"
| project TimeGenerated, Log_s
```

## Troubleshooting

### Job Won't Start

Check Container Apps environment:
```bash
az containerapp env show -n cae-ailz-ezle7syi -g rg-ailz-lab --query "properties.provisioningState"
```

### Container Image Not Found

Verify ACR has image:
```bash
az acr repository show-tags -n acrezle7syiailz --repository finlex-ingestion
```

### Authentication Failures

Grant managed identity roles:
```bash
# Get job identity
JOB_PRINCIPAL=$(az containerapp job show -n finlex-ingestion-job -g rg-ailz-lab --query "identity.principalId" -o tsv)

# Grant OpenAI access
az role assignment create \
  --assignee $JOB_PRINCIPAL \
  --role "Cognitive Services User" \
  --scope /subscriptions/.../resourceGroups/rg-ailz-lab/providers/Microsoft.CognitiveServices/accounts/aif-ailz-ezle7syi
```

### Embedding API Rate Limits

Increase batch delay in `embed.py`:
```python
import time
time.sleep(1)  # Add after each batch
```

### Index Creation Fails

Verify search key is valid:
```bash
az search admin-key show \
  --resource-group rg-ailz-lab \
  --service-name srch-ailz-ezle7syi
```

## Testing Locally

```bash
cd src

# Set environment variables
export TARGET_YEARS="2024"
export FINLEX_URL="https://data.finlex.fi/download/kaikki"
export AZURE_OPENAI_ENDPOINT="https://aif-ailz-ezle7syi.openai.azure.com"
export AZURE_OPENAI_DEPLOYMENT="text-embedding-ada-002"
export AZURE_SEARCH_ENDPOINT="https://srch-ailz-ezle7syi.search.windows.net"
export AZURE_SEARCH_KEY="<get-from-portal>"

# Install dependencies
pip install -r ../requirements.txt

# Run pipeline
python main.py
```

## Cost Estimation

Per run (2024-2025 data):

| Service | Usage | Cost |
|---------|-------|------|
| Container Apps Job | ~1 hour | ~$0.02 |
| AI Search Basic | 24/7 hosting | ~$75/month |
| Azure OpenAI embeddings | ~500K tokens | ~$0.05 |
| Storage | <1 GB transient | <$0.01 |
| **Total per run** | | **~$0.08** |
| **Monthly (daily)** | | **~$77** |

Most cost is AI Search hosting (fixed). Consider:
- **Dev**: Run manually as needed
- **Prod**: Schedule weekly instead of daily

## Next Steps

1. **Verify Deployment**:
   ```bash
   az containerapp job show -n finlex-ingestion-job -g rg-ailz-lab
   ```

2. **Trigger First Run**:
   ```bash
   az containerapp job start -n finlex-ingestion-job -g rg-ailz-lab
   ```

3. **Monitor Progress**:
   ```bash
   az containerapp job logs show -n finlex-ingestion-job -g rg-ailz-lab --follow
   ```

4. **Test Search**:
   - Use Azure Portal Search Explorer
   - Query with vector search
   - Test hybrid search (keyword + semantic)

5. **Integrate with RAG App**:
   - Use `finlex-documents` index as knowledge base
   - Implement semantic search in AI Chat App
   - Add citation links back to Finlex

## Differences from previous_example

| Aspect | Previous (Functions) | New (Container Apps Job) |
|--------|---------------------|--------------------------|
| **Deployment** | Azure Functions v2 | Container Apps Job |
| **Trigger** | Timer + Blob | CRON schedule only |
| **Output** | Blob Storage (text) | AI Search (vectors) |
| **Chunking** | None (full doc) | Tiktoken-based (smart) |
| **Embeddings** | None | Azure OpenAI (1536-dim) |
| **Search** | Manual | Indexed with vector search |
| **Structure** | Single function | 6-stage pipeline |
| **Metadata** | Basic | Comprehensive (dates, sections) |

## References

- [Azure AI Search Documentation](https://learn.microsoft.com/azure/search/)
- [Azure OpenAI Embeddings](https://learn.microsoft.com/azure/ai-services/openai/concepts/understand-embeddings)
- [Container Apps Jobs](https://learn.microsoft.com/azure/container-apps/jobs)
- [Finlex Data](https://data.finlex.fi/)
- [Akoma Ntoso XML Standard](http://docs.oasis-open.org/legaldocml/akn-core/v1.0/akn-core-v1.0.html)
