# Finlex Ingestion Pipeline - Implementation Options

## Option 1: Azure Functions in Container Apps (Recommended)

### Architecture
```
Container Apps Environment
├── Download Function (HTTP/Timer)
├── Process Function (Blob Trigger)
└── Shared: Storage, OpenAI, AI Search
```

### Pros
- ✅ Familiar serverless model (event-driven)
- ✅ Built-in triggers (Timer, HTTP, Blob)
- ✅ Auto-scaling based on events
- ✅ Consumption pricing (pay-per-execution)
- ✅ Runs in existing Container Apps Environment
- ✅ Easy local development with Azure Functions Core Tools

### Cons
- ❌ Max execution time limits (230 seconds default, configurable but not ideal for very large archives)
- ❌ More complex for long-running batch jobs
- ❌ Durable Functions needed for orchestration

### When to Choose
- Event-driven processing preferred
- Fast processing per document (< 5 minutes)
- Need built-in trigger bindings
- Team familiar with Azure Functions

---

## Option 2: Container Apps Jobs (Emerging Choice)

### Architecture
```
Container Apps Environment
├── Ingestion Job (CRON scheduled)
│   ├── Download step
│   ├── Extract step
│   ├── Process step
│   └── Index step
└── Shared: Storage, OpenAI, AI Search
```

### Pros
- ✅ Purpose-built for batch processing
- ✅ No time limits (can run for hours)
- ✅ CRON-based scheduling built-in
- ✅ Better for long-running tasks
- ✅ Simpler orchestration (single container, multiple steps)
- ✅ Same Container Apps Environment
- ✅ Easier local development (just Docker)
- ✅ Can use any language/framework

### Cons
- ❌ No built-in triggers (only CRON/manual)
- ❌ Need to implement event handling manually
- ❌ Less mature than Functions

### When to Choose
- Batch processing preferred
- Long processing times expected (> 5 minutes)
- Need full control over execution
- Want simpler architecture

---

## Option 3: Standard Container Apps (Alternative)

### Architecture
```
Container Apps Environment
├── Ingestion Service (always-on or scale-to-zero)
│   └── Express/FastAPI server with endpoints
│       ├── POST /ingest (trigger manually)
│       └── GET /status (check progress)
└── Background Job Queue (optional)
```

### Pros
- ✅ Maximum flexibility
- ✅ Can add REST API for control
- ✅ Easy to add custom logic
- ✅ Full framework support (Express, FastAPI)

### Cons
- ❌ Need to implement scheduling manually
- ❌ More boilerplate code
- ❌ Overkill for simple batch processing

### When to Choose
- Need REST API for ingestion control
- Want to expose status/monitoring endpoints
- Complex workflow orchestration needed

---

## Recommended Approach: Container Apps Jobs

### Rationale
1. **Batch Nature**: Ingestion is inherently a batch process, not event-driven
2. **Long Running**: Processing large archives may take 30+ minutes
3. **Simplicity**: Single container with sequential steps is easier to understand
4. **Debugging**: Easier to run locally and debug
5. **Flexibility**: Can add orchestration logic without Durable Functions complexity

### Implementation Structure

```typescript
// src/index.ts - Main entry point
async function main() {
  console.log('🚀 Starting Finlex ingestion pipeline...');
  
  try {
    // Step 1: Download
    const archivePath = await downloadFinlexArchive();
    
    // Step 2: Extract
    const documents = await extractArchive(archivePath);
    
    // Step 3: Process
    const chunks = await processDocuments(documents);
    
    // Step 4: Index
    await indexToAISearch(chunks);
    
    console.log('✅ Ingestion completed successfully');
  } catch (error) {
    console.error('❌ Ingestion failed:', error);
    process.exit(1);
  }
}

main();
```

### Project Structure
```
finlex-ingestion/
├── Dockerfile
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main orchestrator
│   ├── download.ts           # Download from Finlex
│   ├── extract.ts            # ZIP extraction
│   ├── process.ts            # Document parsing & chunking
│   ├── embed.ts              # Generate embeddings
│   ├── index.ts              # Upload to AI Search
│   ├── models/               # TypeScript interfaces
│   │   ├── Document.ts
│   │   ├── Chunk.ts
│   │   └── SearchDocument.ts
│   └── utils/
│       ├── storage.ts        # Blob Storage helper
│       ├── openai.ts         # OpenAI client
│       ├── search.ts         # AI Search client
│       └── logger.ts         # Logging utility
├── infrastructure/
│   ├── job.bicep             # Container Apps Job
│   ├── search.bicep          # AI Search service
│   └── storage.bicep         # Storage containers
└── README.md
```

---

## Infrastructure Components Needed

### New Resources

1. **Azure AI Search Service**
   ```bicep
   resource search 'Microsoft.Search/searchServices@2023-11-01' = {
     name: 'search-${uniqueString(resourceGroup().id)}'
     location: location
     sku: {
       name: 'basic'  // S1 for production
     }
     properties: {
       replicaCount: 1
       partitionCount: 1
       semanticSearch: 'standard'  // Enable semantic search
     }
   }
   ```

2. **Storage Containers** (in existing account)
   - `finlex-raw`: Downloaded ZIP archives
   - `finlex-processed`: Extracted documents

3. **Container Apps Job**
   ```bicep
   resource job 'Microsoft.App/jobs@2023-05-01' = {
     name: 'job-finlex-ingestion'
     location: location
     properties: {
       environmentId: containerAppsEnvId
       configuration: {
         triggerType: 'Schedule'
         scheduleTriggerConfig: {
           cronExpression: '0 0 2 * * *'  // Daily at 2 AM
           parallelism: 1
           replicaCompletionCount: 1
         }
         replicaTimeout: 7200  // 2 hours max
       }
       template: {
         containers: [
           {
             name: 'finlex-ingestion'
             image: '${acr}.azurecr.io/finlex-ingestion:latest'
             resources: {
               cpu: json('1.0')
               memory: '2Gi'
             }
             env: [/* environment variables */]
           }
         ]
       }
     }
   }
   ```

### Shared Resources (Already Exist)
- Container Apps Environment
- Storage Account
- Azure OpenAI
- Application Insights
- Key Vault

---

## Next Steps

1. **Prototype**: Build simple Node.js script to download and parse sample Finlex data
2. **Containerize**: Create Dockerfile and test locally
3. **Infrastructure**: Create Bicep modules for AI Search and Container Apps Job
4. **Deploy**: Test end-to-end in Azure
5. **Monitor**: Set up Application Insights dashboards
6. **Optimize**: Add caching, better error handling, incremental updates
