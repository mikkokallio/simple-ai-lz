# Adventure Creation App - Azure Migration Plan

## Current State Analysis

### GitHub Spark Dependencies
1. **`@github/spark` package** - Used for:
   - `useKV()` hook for persistent key-value storage (like localStorage but managed by Spark)
   - `window.spark.llmPrompt()` for AI chat completions (LLM API calls)
   - Spark runtime initialization

2. **Azure OpenAI (DALL-E 3)** - Already using Azure:
   - Uses environment variables: `VITE_AZURE_OPENAI_ENDPOINT`, `VITE_AZURE_OPENAI_API_KEY`
   - Direct OpenAI SDK calls to Azure endpoint
   - ✅ **This is already Azure-compatible!**

### Existing Azure Infrastructure (rg-ailz-demo-v11)
- Azure Container Apps Environment (consumption-based)
- Azure Cosmos DB (NoSQL database)
- Azure Storage (blob storage)
- Azure AI Foundry (AI models hub)
- Virtual Network with private endpoints
- Managed Identity for authentication
- Key Vault (fallback for non-MI scenarios)

## Migration Strategy

### 1. Replace Spark Key-Value Storage → Azure Cosmos DB
**Current**: `useKV()` stores adventure data in Spark's managed storage
**Target**: Cosmos DB with container "adventures" for adventure documents

**Why Cosmos DB:**
- NoSQL document database perfect for JSON adventure objects
- Already provisioned in v11
- Supports managed identity authentication
- Fast read/write for interactive UI

**Implementation:**
- Create custom `useCosmosDB()` hook to replace `useKV()`
- Store each adventure as a document with partition key = user ID or session ID
- Backend API for CRUD operations (Create, Read, Update, Delete adventures)

### 2. Replace Spark LLM → Azure AI Foundry Models
**Current**: `window.spark.llmPrompt()` calls Spark's managed LLM
**Target**: Azure OpenAI GPT-4 via Azure AI Foundry endpoint

**Why Azure OpenAI:**
- Already using it for DALL-E 3
- Same authentication pattern (managed identity or key)
- GPT-4 or GPT-4o for high-quality adventure generation
- Consistent with existing Azure infrastructure

**Implementation:**
- Create `lib/azureOpenAI.ts` utility for chat completions
- Replace `llmPrompt()` calls with direct Azure OpenAI SDK
- Use same endpoint/key pattern as DALL-E integration

### 3. Container Apps Architecture

#### Frontend Container App
- **Image**: React/Vite SPA (build → nginx/node server)
- **Port**: 8080 (standard for Container Apps)
- **Ingress**: `external: true` (accessible via App Gateway)
- **Environment Variables**:
  - `VITE_AZURE_OPENAI_ENDPOINT` (for DALL-E + GPT-4)
  - `VITE_AZURE_OPENAI_API_KEY` (if not using managed identity)
  - `VITE_BACKEND_API_URL` (backend API endpoint)
- **No managed identity needed** (static frontend, API calls via backend)

#### Backend API Container App
- **Framework**: Node.js/Express or Python/FastAPI (simple REST API)
- **Port**: 8080
- **Ingress**: `external: true` (called by frontend)
- **Endpoints**:
  - `GET /api/adventures` - List user's adventures
  - `GET /api/adventures/:id` - Get adventure by ID
  - `POST /api/adventures` - Create new adventure
  - `PUT /api/adventures/:id` - Update adventure
  - `DELETE /api/adventures/:id` - Delete adventure
  - `POST /api/ai/chat` - LLM chat completions (proxy to Azure OpenAI)
  - `POST /api/ai/portrait` - DALL-E 3 portrait generation (proxy to Azure OpenAI)
- **Managed Identity**: 
  - Cosmos DB Data Contributor (read/write adventures)
  - Cognitive Services OpenAI User (call GPT-4 + DALL-E)
- **Environment Variables**:
  - `COSMOS_ENDPOINT` (from existing Cosmos DB)
  - `COSMOS_DATABASE_NAME` (create new database "adventureCreator")
  - `AZURE_OPENAI_ENDPOINT` (from AI Foundry)
  - `AZURE_OPENAI_DEPLOYMENT_GPT4` (e.g., "gpt-4o")
  - `AZURE_OPENAI_DEPLOYMENT_DALLE` (e.g., "dall-e-3")

### 4. New Azure Resources Needed

#### Cosmos DB Database & Container
- **Database**: `adventureCreator` (new database in existing Cosmos account)
- **Container**: `adventures`
  - Partition key: `/userId` or `/sessionId`
  - Indexing: Default (all properties)
- **Estimated cost**: ~$0.50/day (serverless, low usage)

#### Container Apps (2 new apps)
- **Frontend**: `ca-adventure-creator-frontend-demo11`
- **Backend**: `ca-adventure-creator-backend-demo11`
- **Total cost**: ~$0 (consumption-based, low traffic)

#### Role Assignments (via Managed Identity)
- Backend → Cosmos DB: "Cosmos DB Data Contributor"
- Backend → Azure OpenAI: "Cognitive Services OpenAI User"

### 5. Authentication & User Sessions
**Simplified for demo:**
- No authentication initially (single-user demo)
- Use session ID stored in browser localStorage
- Backend associates adventures with session ID

**Future production:**
- Add Entra ID authentication (Container Apps Easy Auth)
- Replace session ID with user ID from JWT token
- Backend validates JWT and uses user ID for data isolation

### 6. Infrastructure as Code

#### Create `infrastructure/` folder in app directory
- `app.bicep` - Container Apps (frontend + backend)
- `app.bicepparam` - Parameters for v11 deployment
- `cosmos.bicep` - Cosmos DB database/container creation
- No top-level resources (VNet, CAE, Storage, etc.)

#### Bicep Parameters Needed
```bicep
param containerAppsEnvironmentId string  // From v11
param cosmosAccountName string           // From v11
param azureOpenAIEndpoint string         // From v11 AI Foundry
param location string = 'swedencentral'
param uniqueSuffix string = 'demo11'
```

### 7. Migration Steps (Execution Order)

1. **Create Backend API** (Node.js/Express recommended)
   - Implement Cosmos DB CRUD operations
   - Implement Azure OpenAI proxy endpoints
   - Add managed identity authentication
   - Dockerize backend

2. **Update Frontend Code**
   - Remove `@github/spark` dependency
   - Replace `useKV()` with API calls
   - Replace `llmPrompt()` with backend API calls
   - Update DALL-E calls to go through backend
   - Keep existing DALL-E integration pattern

3. **Create Infrastructure Templates**
   - Write Bicep for Cosmos DB setup
   - Write Bicep for Container Apps (frontend + backend)
   - Create parameter file for v11

4. **Deploy Infrastructure**
   - Deploy Cosmos DB database/container
   - Deploy backend Container App
   - Deploy frontend Container App

5. **Build & Push Images**
   - Build backend Docker image → ACR
   - Build frontend Docker image → ACR

6. **Test End-to-End**
   - Test via VPN (Container App URLs)
   - Test via App Gateway (public access)
   - Verify AI features (GPT-4 chat, DALL-E portraits)
   - Verify data persistence (Cosmos DB)

### 8. Key Technical Decisions

#### Why Not Use Container Apps Jobs?
- App needs real-time interaction, not batch processing
- Container Apps with HTTP ingress is correct choice

#### Why Backend API?
- Managed identity works best server-side
- Frontend can't directly authenticate to Cosmos DB with MI
- Backend centralizes Azure service authentication
- Simpler to add rate limiting, caching, logging

#### Why Cosmos DB vs Storage Tables?
- Cosmos DB better for complex JSON documents
- Flexible schema for adventure data
- Already provisioned in v11
- Better query capabilities for future features

#### Why Not Use Key Vault?
- Managed identity is preferred pattern
- Key Vault only if MI authentication fails
- Will ask user before using Key Vault

### 9. Environment Variables Strategy

#### Development (local)
- `.env.local` file with API keys
- Backend runs locally with keys
- Frontend calls `http://localhost:8080/api/...`

#### Production (Azure)
- Backend uses managed identity (no keys)
- Frontend gets backend URL from env var
- Both apps deployed to Container Apps

### 10. Potential Issues & Mitigations

**Issue 1**: Frontend can't call backend across VNet
- **Solution**: Both apps have `external: true` ingress
- Backend is accessible within VNet and via App Gateway

**Issue 2**: Managed identity permission errors
- **Solution**: Verify role assignments with `az role assignment list`
- Fallback: Use Key Vault secrets if MI fails

**Issue 3**: CORS errors (frontend → backend)
- **Solution**: Configure CORS in backend to allow frontend domain
- Add `Access-Control-Allow-Origin` headers

**Issue 4**: Large adventures exceed Cosmos document size limit (2MB)
- **Solution**: Split large adventures into multiple documents
- Or compress JSON before storing

**Issue 5**: Cold start latency (consumption plan)
- **Solution**: Keep apps warm with health check pings
- Or switch to dedicated plan if latency is critical

### 11. Success Criteria

✅ **Frontend loads** in browser (via VPN or App Gateway)
✅ **Create adventure** saves to Cosmos DB
✅ **Edit adventure** updates Cosmos DB
✅ **AI chat** generates suggestions (GPT-4)
✅ **Generate portrait** creates NPC images (DALL-E 3)
✅ **Data persists** across browser refreshes
✅ **Managed identity** authenticates to Azure services
✅ **No Spark dependencies** in package.json

### 12. Estimated Timeline

- **Backend API creation**: 2-3 hours
- **Frontend updates**: 2-3 hours
- **Infrastructure templates**: 1-2 hours
- **Deployment & testing**: 1-2 hours
- **Total**: ~6-10 hours (with debugging)

### 13. File Structure (After Migration)

```
examples/adventure-creation/
├── frontend/
│   ├── src/
│   │   ├── App.tsx (updated, no Spark)
│   │   ├── hooks/
│   │   │   └── useAdventure.ts (replaces useKV with API calls)
│   │   ├── lib/
│   │   │   ├── dalle.ts (updated to call backend API)
│   │   │   └── api.ts (new, API client)
│   │   └── ... (existing components)
│   ├── Dockerfile
│   └── nginx.conf (for serving SPA)
├── backend/
│   ├── src/
│   │   ├── index.ts (Express server)
│   │   ├── routes/
│   │   │   ├── adventures.ts (CRUD endpoints)
│   │   │   └── ai.ts (OpenAI proxy)
│   │   ├── services/
│   │   │   ├── cosmos.ts (Cosmos DB client)
│   │   │   └── openai.ts (Azure OpenAI client)
│   │   └── middleware/
│   │       └── auth.ts (session validation)
│   ├── Dockerfile
│   └── package.json
├── infrastructure/
│   ├── cosmos.bicep (database/container)
│   ├── app.bicep (Container Apps)
│   ├── app.bicepparam (v11 parameters)
│   └── README.md (deployment instructions)
├── MIGRATION_PLAN.md (this file)
└── ... (existing app files)
```

## Next Steps

1. **Create backend API structure** (Node.js/Express)
2. **Implement Cosmos DB integration**
3. **Implement Azure OpenAI integration**
4. **Update frontend to use new API**
5. **Create Bicep templates**
6. **Deploy and test**

**Questions for user before proceeding:**
- Prefer Node.js or Python for backend? (Node.js recommended since frontend is TypeScript)
- Need authentication now or later? (Recommend later for faster demo)
- Any specific port preferences? (Default: 8080 for both apps)
