# Finlex Azure Functions Pipeline

Event-driven serverless pipeline for ingesting and indexing Finnish legal documents (Finlex) into Azure AI Search.

## Architecture

```
Finlex API → ingest_function (Timer) → Blob Storage (finlex-raw)
                                            ↓ (EventGrid)
                                     process_function
                                            ↓
                                      AI Search Index
```

### Functions

1. **ingest_function** (Timer-triggered)
   - Runs daily at 2:00 AM UTC
   - Downloads Finlex ZIP archive
   - Parses AKN XML documents
   - Uploads structured JSON to `finlex-raw` blob container
   - Filters by target years (default: 2024, 2025)

2. **process_function** (EventGrid blob trigger)
   - Automatically triggered when new JSON blobs are created
   - Chunks documents using tiktoken (500 tokens, 50 overlap)
   - Generates embeddings via Azure OpenAI (text-embedding-3-small)
   - Indexes to Azure AI Search with vector search

## Prerequisites

- Azure CLI (`az`)
- PowerShell 7+
- Existing resources:
  - Resource Group: `rg-ailz-lab`
  - Storage Account: `stailzezle7syi`
  - Azure OpenAI: `foundry-ezle7syi` with `text-embedding-3-small` deployment
  - AI Search: `srch-ailz-ezle7syi`

## Deployment

Deploy both infrastructure and code:

```powershell
cd function-app
./deploy-functions.ps1
```

Custom target years:

```powershell
./deploy-functions.ps1 -TargetYears "2023,2024,2025"
```

## Manual Testing

Trigger ingest function manually:

```bash
az functionapp function invoke \
  -g rg-ailz-lab \
  -n func-finlex-ingestion \
  --function-name ingest_function
```

Upload a test blob to trigger processing:

```bash
# Upload any JSON file to finlex-raw container
az storage blob upload \
  --account-name stailzezle7syi \
  --container-name finlex-raw \
  --name 2024/test.json \
  --file test-document.json \
  --auth-mode login
```

## Monitoring

View logs in Azure Portal:
- Application Insights: `func-finlex-ingestion-insights`
- Function App logs: Navigate to Function App → Functions → Monitor

Stream logs in real-time:

```bash
func azure functionapp logstream func-finlex-ingestion
```

Query AI Search index:

```bash
az search index show \
  --service-name srch-ailz-ezle7syi \
  --name finlex-functions-index \
  -g rg-ailz-lab
```

## Configuration

Environment variables (set in `infrastructure/main.bicep`):

- `FINLEX_URL`: Finlex data source URL
- `TARGET_YEARS`: Comma-separated years to process
- `STORAGE_ACCOUNT_NAME`: Azure Storage account
- `BLOB_CONTAINER_NAME`: Container for raw data (`finlex-raw`)
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI service endpoint
- `AZURE_OPENAI_DEPLOYMENT`: Embedding model deployment name
- `AZURE_OPENAI_DIMENSIONS`: Embedding vector dimensions (1536)
- `AZURE_SEARCH_ENDPOINT`: AI Search service endpoint
- `AZURE_SEARCH_INDEX`: Target index name

## Local Development

Install dependencies:

```bash
pip install -r requirements.txt
```

Update `local.settings.json` with your credentials, then:

```bash
func start
```

## Advantages Over Container Apps Jobs

✅ **No container builds** - Direct Python deployment  
✅ **Built-in monitoring** - Application Insights integration  
✅ **Event-driven** - EventGrid triggers for blob processing  
✅ **Transparent logs** - Real-time streaming and App Insights queries  
✅ **Managed scaling** - Flex Consumption automatic scaling  
✅ **Simpler deployment** - Single command deployment  
✅ **Cost-efficient** - Pay per execution
