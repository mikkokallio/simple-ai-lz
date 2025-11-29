# Adventure Creator - Azure Migration Summary

## ✅ Completed

### Backend API (Node.js/Express)
**Location**: `examples/adventure-creation/backend/`

**Files Created**:
- `package.json` - Dependencies (Express, Cosmos SDK, Azure Identity, OpenAI)
- `tsconfig.json` - TypeScript configuration
- `Dockerfile` - Multi-stage build for production
- `.env.example` - Environment variable template
- `.dockerignore` - Docker build exclusions

**Source Code**:
- `src/index.ts` - Express server with middleware, health check, API routes
- `src/services/cosmos.ts` - Cosmos DB client with managed identity, CRUD operations
- `src/services/openai.ts` - Azure OpenAI client (GPT-4 + DALL-E 3) with managed identity
- `src/routes/adventures.ts` - REST API for adventures (GET, POST, PUT, DELETE)
- `src/routes/ai.ts` - AI proxy endpoints (chat, portrait generation)
- `src/middleware/auth.ts` - Session middleware, error handling

**Key Features**:
- ✅ Managed Identity authentication (no API keys)
- ✅ Session-based data isolation
- ✅ CORS configured for frontend
- ✅ Health check endpoint
- ✅ Graceful shutdown handling
- ✅ Production-ready error handling

### Frontend Updates
**Location**: `examples/adventure-creation/src/`

**Files Created**:
- `src/lib/api.ts` - API client replacing Spark APIs
- `src/hooks/useAdventure.ts` - Custom hook replacing useKV

**Files Modified**:
- `src/App.tsx` - Use useAdventure instead of useKV
- `src/main.tsx` - Removed @github/spark import
- `src/lib/utils.ts` - Use API client llmPrompt
- `src/lib/dalle.ts` - Call backend API instead of direct Azure OpenAI
- `src/components/stages/NPCsStage.tsx` - Removed API key check
- `package.json` - Removed @github/spark and openai dependencies

**Frontend Docker**:
- `frontend/Dockerfile` - Multi-stage build (Node build → nginx serve)
- `frontend/nginx.conf` - SPA routing, compression, security headers
- `frontend/.dockerignore` - Docker build exclusions

### Infrastructure as Code (Bicep)
**Location**: `examples/adventure-creation/infrastructure/`

**Files Created**:
- `cosmos.bicep` - Cosmos DB database and container setup
- `cosmos.bicepparam` - Parameters for v11 Cosmos account
- `app.bicep` - Container Apps (frontend + backend) with managed identity
- `app.bicepparam` - v11 resource references and configuration
- `README.md` - Deployment guide with commands

**Resources Defined**:
- Cosmos DB database: `adventureCreator`
- Cosmos DB container: `adventures` (partition key: `/sessionId`)
- Backend Container App: `ca-adventure-backend-demo11`
- Frontend Container App: `ca-adventure-frontend-demo11`
- Role assignment: Backend → Cosmos DB Data Contributor
- Role assignment: Backend → Cognitive Services OpenAI User (manual step)

## 📋 Ready to Deploy

### Step 1: Deploy Cosmos DB
```powershell
cd examples/adventure-creation/infrastructure
az deployment group create `
  --resource-group rg-ailz-demo-v11 `
  --template-file cosmos.bicep `
  --parameters cosmos.bicepparam `
  --name adventure-cosmos
```

### Step 2: Build Backend Image
```powershell
cd ../backend
az acr build `
  --registry acrdemo11gvfyvq `
  --image adventure-creator-backend:latest `
  --file Dockerfile `
  .
```

### Step 3: Build Frontend Image
```powershell
cd ..
az acr build `
  --registry acrdemo11gvfyvq `
  --image adventure-creator-frontend:latest `
  --file frontend/Dockerfile `
  .
```

### Step 4: Deploy Container Apps
```powershell
cd infrastructure
az deployment group create `
  --resource-group rg-ailz-demo-v11 `
  --template-file app.bicep `
  --parameters app.bicepparam `
  --name adventure-apps
```

### Step 5: Assign Azure OpenAI Role
```powershell
$backendPrincipalId = az deployment group show `
  --resource-group rg-ailz-demo-v11 `
  --name adventure-apps `
  --query properties.outputs.backendPrincipalId.value `
  -o tsv

az role assignment create `
  --assignee $backendPrincipalId `
  --role "Cognitive Services OpenAI User" `
  --scope /subscriptions/f6f84135-2f56-47ac-b4bf-4202248dd5ee/resourceGroups/rg-ailz-demo-v11/providers/Microsoft.CognitiveServices/accounts/aif-demo11-gvfyvq
```

## 🔧 Technical Details

### Replaced Spark Dependencies
| Spark Feature | Azure Replacement |
|--------------|------------------|
| `useKV()` hook | `useAdventure()` → Cosmos DB API |
| `window.spark.llmPrompt()` | Backend API → Azure OpenAI GPT-4 |
| DALL-E (direct) | Backend API → Azure OpenAI DALL-E 3 |
| Spark runtime | Standard React + Express |

### Authentication Pattern
- **Frontend**: No authentication (calls backend API)
- **Backend**: Managed Identity → Cosmos DB & Azure OpenAI
- **Session**: Browser localStorage sessionId → Cosmos partition key

### Port Configuration
- **Frontend nginx**: Port 8080
- **Backend Express**: Port 8080
- Both use Container Apps standard port

### Environment Variables

**Backend (Container Apps)**:
- `COSMOS_ENDPOINT` - From existing Cosmos account
- `COSMOS_DATABASE_NAME` - adventureCreator
- `COSMOS_CONTAINER_NAME` - adventures
- `AZURE_OPENAI_ENDPOINT` - From AI Foundry
- `AZURE_OPENAI_DEPLOYMENT_GPT4` - gpt-4o
- `AZURE_OPENAI_DEPLOYMENT_DALLE` - dall-e-3
- `FRONTEND_URL` - CORS configuration

**Frontend (Container Apps)**:
- `BACKEND_API_URL` - Backend API endpoint

## 🎯 Success Criteria
- ✅ Backend builds successfully
- ✅ Frontend builds successfully
- ✅ Bicep templates validated
- ✅ No Spark dependencies remaining
- ✅ Managed Identity configured
- ✅ Infrastructure as Code complete

## 📦 File Structure
```
examples/adventure-creation/
├── backend/
│   ├── src/
│   │   ├── index.ts (Express server)
│   │   ├── services/ (Cosmos, OpenAI)
│   │   ├── routes/ (adventures, ai)
│   │   └── middleware/ (auth, error)
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── Dockerfile
│   └── nginx.conf
├── infrastructure/
│   ├── cosmos.bicep
│   ├── cosmos.bicepparam
│   ├── app.bicep
│   ├── app.bicepparam
│   └── README.md
├── src/ (existing frontend code - updated)
│   ├── lib/
│   │   ├── api.ts (NEW - replaces Spark)
│   │   ├── dalle.ts (MODIFIED - uses backend)
│   │   └── utils.ts (MODIFIED - uses api.ts)
│   ├── hooks/
│   │   └── useAdventure.ts (NEW - replaces useKV)
│   └── ... (other existing files)
├── package.json (MODIFIED - removed Spark)
├── MIGRATION_PLAN.md
└── .env.example
```

## 🚀 Next Steps
1. Deploy Cosmos DB (Step 1)
2. Build container images (Steps 2-3)
3. Deploy Container Apps (Step 4)
4. Assign Azure OpenAI role (Step 5)
5. Test via VPN
6. (Optional) Add to App Gateway for public access

## 💰 Cost Estimate
- Container Apps: ~$0/month (consumption, scales to zero)
- Cosmos DB: ~$15/month (serverless)
- Azure OpenAI: Pay-per-use (GPT-4 + DALL-E 3)
- **Total**: ~$15-20/month (low usage)

## 📝 Notes
- All Azure service authentication uses Managed Identity
- No API keys stored in app or Key Vault
- Frontend is static build served by nginx
- Backend proxies all AI requests
- Session-based data isolation (no user auth yet)
- Ready for Entra ID auth upgrade in future
