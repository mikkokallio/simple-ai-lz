# Azure AI Foundry Agents Integration

This document describes the Azure AI Foundry Agent Service integration added to the AI Chat application.

## Overview

The application now supports importing and chatting with Azure AI Foundry agents alongside regular chat threads. Agents are specialized AI assistants configured in Azure AI Foundry portal with custom instructions, tools, and knowledge bases.

## Architecture

### Backend Components

#### 1. **Infrastructure** (`infrastructure/foundry-project.bicep`)
- Creates AI Foundry resource (CognitiveServices account with project management enabled)
- Creates AI Foundry Project (groups agents and resources)
- Deploys gpt-4o model for agent use
- **Automatically assigns RBAC role** (Azure AI User) to backend Container App
- Outputs project endpoint for API access

**Prerequisites:**
- Backend Container App must be deployed first to get its managed identity principal ID

**Quick Deployment (Recommended):**
Use the provided deployment script:

```bash
# Linux/macOS
./infrastructure/deploy-foundry.sh rg-ailz-lab aca-ai-chat-backend-<suffix> foundry-<suffix>

# Windows PowerShell
.\infrastructure\deploy-foundry.ps1 -ResourceGroup rg-ailz-lab -BackendName aca-ai-chat-backend-<suffix> -FoundryName foundry-<suffix>
```

The script will:
1. Get the backend Container App's managed identity principal ID
2. Deploy the Foundry infrastructure with RBAC role assignment
3. Configure the backend with the project endpoint
4. Display deployment summary and next steps

**Manual Deployment:**
```bash
# Get the backend Container App principal ID
BACKEND_PRINCIPAL_ID=$(az containerapp show \
  --name aca-ai-chat-backend-<suffix> \
  --resource-group rg-ailz-lab \
  --query "identity.principalId" -o tsv)

# Deploy Foundry infrastructure with RBAC
az deployment group create \
  --resource-group rg-ailz-lab \
  --template-file infrastructure/foundry-project.bicep \
  --parameters \
    aiFoundryName=foundry-<suffix> \
    aiProjectName=agents-project \
    backendPrincipalId=$BACKEND_PRINCIPAL_ID

# Get the project endpoint from deployment outputs
PROJECT_ENDPOINT=$(az deployment group show \
  --resource-group rg-ailz-lab \
  --name <deployment-name> \
  --query "properties.outputs.projectEndpoint.value" -o tsv)

# Update backend with project endpoint
az containerapp update \
  --name aca-ai-chat-backend-<suffix> \
  --resource-group rg-ailz-lab \
  --set-env-vars AI_FOUNDRY_PROJECT_ENDPOINT="$PROJECT_ENDPOINT"
```

**RBAC Configuration:**
The Bicep template automatically assigns the **Azure AI User** role to the backend Container App's managed identity at the project scope. This role grants:
- `Microsoft.CognitiveServices/*` - Full permissions for agent operations including:
  - `agents/*/read` - List and read agent definitions
  - `agents/*/action` - Execute agent operations (create threads, send messages)
  - `agents/*/delete` - Delete threads and messages

**Note:** RBAC propagation can take 2-10 minutes. Agent operations will return 401 errors until propagation completes.

#### 2. **Foundry Agent Client** (`backend/src/agents/foundryClient.ts`)
- `AIProjectClient` wrapper for Agent Service operations
- Methods:
  - `listAgents()` - Discover agents in Foundry project
  - `getAgent(agentId)` - Get agent details
  - `createThread(agentId)` - Create new conversation thread
  - `sendMessage(agentId, threadId, message)` - Stream agent responses
  - `getMessages(threadId)` - Retrieve conversation history
  - `deleteThread(threadId)` - Clean up threads

#### 3. **Agent Manager** (`backend/src/agents/agentManager.ts`)
- **Purpose**: Metadata index ONLY - stores agent-to-thread associations
- **What it stores**:
  - Agent import metadata (which agents have been imported)
  - Thread-to-agent association (which threads belong to which agents)
  - Thread metadata (title, timestamps)
- **What it does NOT store**:
  - Thread content (messages, conversation state) - managed by Foundry
  - Agent definitions - stored in Foundry
- **Storage pattern**: "Metadata Index" pattern
  - **Current**: Blob Storage (works but suboptimal for queries)
  - **Recommended**: Azure Cosmos DB or Table Storage for fast lookups
  - Foundry: Actual thread content and conversation state
  - This follows Azure's "Bring Your Own Storage" pattern for thread organization

**Storage Options Comparison:**

| Storage | Latency | Cost | Query Flexibility | Best For |
|---------|---------|------|-------------------|----------|
| **Cosmos DB** | ~5-10ms | $$$ | ⭐⭐⭐⭐⭐ Complex queries, indexes | **Production apps with many threads** |
| **Table Storage** | ~20ms | $ | ⭐⭐⭐ Partition-based queries | **Cost-sensitive, simple queries** |
| **Redis** | <1ms | $$$$ | ⭐⭐⭐⭐ Cache + sorted sets | **High-performance cache layer** |
| **Blob Storage** | ~50-100ms | $$ | ⭐ Full file reads only | **Dev/testing, low query frequency** |

**Current Implementation**: Uses Blob Storage for simplicity in demo/prototype phase. **For production**, migrate to Cosmos DB for:
- Native Foundry integration (official BYOD support)
- 10x faster queries (`WHERE agentId = 'X' ORDER BY lastMessageAt DESC`)
- Efficient pagination and filtering
- Automatic indexing on all properties
- Global distribution and auto-scaling

- Storage format: `agent-metadata.json` in Azure Blob Storage
  ```json
  {
    "agents": [{
      "id": "asst_abc123",
      "name": "Product Expert",
      "instructions": "You are...",
      "model": "gpt-4o",
      "importedAt": "2025-11-10T20:00:00Z",
      "foundryProjectEndpoint": "https://..."
    }],
    "threads": [{
      "id": "thread_xyz",              // Thread ID from Foundry
      "agentId": "asst_abc123",        // Association to agent
      "createdAt": "2025-11-10T20:05:00Z",
      "lastMessageAt": "2025-11-10T20:10:00Z",
      "title": "Product inquiry"       // User-friendly metadata
    }]
  }
  ```

**Why this architecture?**
- **Foundry manages state**: Thread content, messages, and conversation history live in Foundry's native, production-ready storage
- **We manage organization**: Track which threads belong to which agents (Foundry threads are agent-agnostic)
- **Best of both worlds**: Foundry's robust state management + our custom organization layer
- **Storage evolution path**:
  - **Current (Blob)**: Simple, works for prototyping
  - **Production upgrade**: Migrate to Cosmos DB for 10x faster queries and better scalability
  - **Enterprise option**: Redis cache layer + Cosmos DB backend for <1ms lookups
- **Future-ready**: Can easily swap storage implementations (Cosmos DB is officially supported by Foundry's BYOD model)

#### 4. **API Endpoints** (added to `backend/src/server.ts`)

**Agent Management:**
- `GET /api/agents` - List imported agents
- `POST /api/agents/discover` - Discover agents from Foundry project
- `POST /api/agents/import` - Import agent by ID
- `DELETE /api/agents/:agentId` - Remove imported agent

**Agent Conversations:**
- `GET /api/agents/:agentId/threads` - List threads for agent
- `POST /api/agents/:agentId/threads` - Create new thread
- `POST /api/agents/:agentId/threads/:threadId/messages` - Send message (streaming)
- `GET /api/agents/:agentId/threads/:threadId/messages` - Get message history
- `DELETE /api/agents/:agentId/threads/:threadId` - Delete thread

### Frontend Components

#### State Management (partial implementation in `frontend/src/main.tsx`)

**New Types:**
```typescript
interface Agent {
  id: string;
  name: string;
  instructions: string;
  model: string;
  importedAt: string;
  foundryProjectEndpoint: string;
}

interface AgentThread {
  id: string;
  agentId: string;
  createdAt: string;
  lastMessageAt: string;
  title: string;
}

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}
```

**API Functions:**
- `fetchAgents()` - Get imported agents
- `discoverAgents()` - Find agents in Foundry
- `importAgent(agentId)` - Import agent
- `deleteAgent(agentId)` - Remove agent
- `createAgentThread(agentId)` - Start conversation
- `sendAgentMessage(...)` - Send with streaming
- `fetchAgentMessages(agentId, threadId)` - Get history

#### UI Components (TO BE IMPLEMENTED)

**AgentsList** (left sidebar section):
```tsx
<div className="agents-section">
  <div className="section-header">
    <h3>Agents</h3>
    <button onClick={openImportModal}>
      <Plus /> Import
    </button>
  </div>
  {agents.map(agent => (
    <AgentItem
      key={agent.id}
      agent={agent}
      selected={currentAgent?.id === agent.id}
      onClick={() => selectAgent(agent)}
      onDelete={() => deleteAgent(agent.id)}
    />
  ))}
</div>
```

**AgentImportModal**:
```tsx
<Modal show={showImportModal}>
  <h2>Import Agent from Foundry</h2>
  {loading ? (
    <Spinner />
  ) : (
    <div className="agent-list">
      {discoveredAgents.map(agent => (
        <div key={agent.id}>
          <h3>{agent.name}</h3>
          <p>{agent.instructions}</p>
          <button onClick={() => handleImport(agent.id)}>
            Import
          </button>
        </div>
      ))}
    </div>
  )}
</Modal>
```

**AgentChatView** (similar to ThreadView):
- Shows agent name and instructions
- Displays agent thread messages
- Input box for sending messages
- Streaming response handling
- Tool call notifications

## Configuration

### Environment Variables

**Backend:**
```bash
# Existing
AI_FOUNDRY_ENDPOINT=https://foundry-mikkolabs.cognitiveservices.azure.com
AI_FOUNDRY_DEPLOYMENT_NAME=gpt-4.1
AI_FOUNDRY_KEY=<from-keyvault>

# New for Agents
AI_FOUNDRY_PROJECT_ENDPOINT=https://<resource>.services.ai.azure.com/api/projects/<project-name>
```

**Container App Secret:**
The project endpoint can be stored as a secret:
```bash
az containerapp secret set \
  --name aca-ai-chat-backend-ezle7syi \
  --resource-group rg-ailz-lab \
  --secrets foundry-project-endpoint=<endpoint>

az containerapp update \
  --name aca-ai-chat-backend-ezle7syi \
  --resource-group rg-ailz-lab \
  --set-env-vars AI_FOUNDRY_PROJECT_ENDPOINT=secretref:foundry-project-endpoint
```

### RBAC Permissions

The Container App managed identity needs:
- **Azure AI User** role on the Foundry Project scope
- Permissions: `agents/*/read`, `agents/*/action`, `agents/*/delete`

```bash
# Get Container App principal ID
PRINCIPAL_ID=$(az containerapp show \
  --name aca-ai-chat-backend-ezle7syi \
  --resource-group rg-ailz-lab \
  --query identity.principalId -o tsv)

# Get Project resource ID
PROJECT_ID=$(az cognitiveservices account project show \
  --account-name foundry-ai-chat \
  --project-name foundry-ai-chat-proj \
  --resource-group rg-ailz-lab \
  --query id -o tsv)

# Assign role
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Azure AI Developer" \
  --scope $PROJECT_ID
```

## Usage Flow

### 1. Create Agent in Foundry Portal

1. Navigate to [Azure AI Foundry](https://ai.azure.com)
2. Select your project
3. Go to **Agents** → **Create Agent**
4. Configure:
   - Name: e.g., "Product Expert"
   - Instructions: "You are an expert on Contoso products..."
   - Model: gpt-4o
   - Tools: Code Interpreter, File Search, etc.
   - Knowledge: Upload product documentation
5. Save agent (note the agent ID starts with `asst_`)

### 2. Import Agent to Chat App

1. Open AI Chat application
2. In left sidebar, click **Agents** section
3. Click **Import** button
4. Modal shows available agents from Foundry
5. Click **Import** on desired agent
6. Agent appears in sidebar

### 3. Chat with Agent

1. Click on imported agent in sidebar
2. Type message and send - thread is created automatically on first message
3. Agent responds using:
   - Custom instructions from Foundry
   - Configured tools (if any)
   - Knowledge base (if attached)
4. **Conversation persists in Foundry's native storage**
5. Thread metadata saved to Blob (agent association, title, timestamps)

### 4. Manage Threads

- **View History**: Load existing threads for any agent
- **Switch Threads**: Click thread to resume previous conversation
- **New Conversation**: "+ New Conversation" button creates fresh thread
- **Delete Thread**: Removes from both Foundry and metadata index
- **Thread Persistence**: All messages stored in Foundry, fully managed by Azure

### 5. Delete Agent

- Removes agent from imported list
- Does NOT delete agent from Foundry (still exists in portal)
- Removes thread metadata associations
- Foundry threads remain accessible via Foundry portal

## Data Flow: Thread Persistence

**Thread Creation Flow:**
```
1. User sends first message to agent
2. Frontend calls: POST /api/agents/:agentId/threads
3. Backend:
   a. Calls Foundry: createThread() → returns threadId
   b. Saves to Blob: { id: threadId, agentId, createdAt, title }
4. Returns threadId to frontend
```

**Message Flow:**
```
1. User sends message
2. Frontend streams: POST /api/agents/:agentId/threads/:threadId/messages
3. Backend:
   a. Calls Foundry: sendMessage() → streams response
   b. Foundry stores message and response natively
   c. Updates Blob: lastMessageAt timestamp
4. Frontend displays streamed response
```

**Load Thread History:**
```
1. User selects agent
2. Frontend calls: GET /api/agents/:agentId/threads
3. Backend:
   a. Queries Blob: threads where agentId = X
   b. Returns: [{ id, agentId, createdAt, title }]
4. User clicks thread
5. Frontend calls: GET /api/agents/:agentId/threads/:threadId/messages
6. Backend:
   a. Calls Foundry: getMessages(threadId)
   b. Returns full message history from Foundry
```

**Key Insight**: Blob Storage is a *metadata index* only. Actual conversation data lives in Foundry's production-ready, scalable storage. We use Blob to organize threads by agent since Foundry threads are agent-agnostic.

## Key Differences: Regular Chat vs Agent Chat

| Feature | Regular Chat | Agent Chat |
|---------|-------------|------------|
| **Endpoint** | `/api/threads` | `/api/agents/:agentId/threads` |
| **AI Model** | User-selected (gpt-4o, gpt-5-mini) | Agent's configured model |
| **System Prompt** | User preference | Agent instructions (managed in Foundry) |
| **Tools** | App tools (regex, calculator, datetime) | Agent tools (code interpreter, file search, Azure Functions) |
| **Knowledge** | None | Agent's knowledge base (vector stores, file search) |
| **Message Storage** | Azure Blob (app-managed) | **Foundry native storage** (service-managed) |
| **Metadata Index** | Azure Blob | Azure Blob (thread-to-agent associations only) |
| **Thread ID Format** | UUID | Foundry thread ID (`thread_*`) |
| **State Management** | Application responsibility | **Foundry manages everything** |

## Implementation Status

### ✅ Completed (Backend)
- Bicep infrastructure template
- Agent client with streaming support
- Agent manager for metadata
- All API endpoints implemented
- Initialization in server startup

### ⏳ Pending (Frontend)
- Agent state management in App component
- AgentsList component in sidebar
- AgentImportModal component
- Agent routing (view selection logic)
- AgentChatView component
- UI styling for agent sections

### 🧪 Testing Required
1. Deploy Foundry infrastructure
2. Create test agent in portal
3. Configure project endpoint
4. Test agent import flow
5. Test agent messaging
6. Test thread management
7. Test error handling (service unavailable)

## Next Steps

1. **Complete Frontend Implementation**:
   - Add agent state to App component
   - Create AgentsList component
   - Create AgentImportModal
   - Add routing logic for agents
   - Style agent UI sections

2. **Deploy and Test**:
   - Build backend v20
   - Build frontend v11
   - Deploy to Container Apps
   - Test with real Foundry agent

3. **Documentation**:
   - User guide for importing agents
   - Admin guide for Foundry setup
   - Troubleshooting common issues

## Troubleshooting

### "Agent service not configured"
- Check `AI_FOUNDRY_PROJECT_ENDPOINT` environment variable
- Verify endpoint format: `https://<resource>.services.ai.azure.com/api/projects/<project>`

### "Failed to discover agents" or 401 PermissionDenied errors
**Symptoms:**
- `/api/agents/discover` returns 500 error
- Backend logs show: `RestError: Pagination failed with unexpected statusCode 401`
- Error code: `PermissionDenied`

**Causes:**
1. **Missing RBAC role** - Backend managed identity doesn't have the Azure AI User role
2. **Wrong role assigned** - "Azure AI Developer" doesn't include agent permissions
3. **RBAC propagation delay** - Role assigned but not yet effective (takes 2-10 minutes)

**Solutions:**
1. Verify the correct role is assigned:
   ```bash
   # Check current role assignments
   az role assignment list \
     --assignee <backend-principal-id> \
     --scope /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<foundry>/projects/<project>
   ```

2. Assign the correct "Azure AI User" role (if missing):
   ```bash
   az role assignment create \
     --assignee <backend-principal-id> \
     --role "Azure AI User" \
     --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<foundry>/projects/<project>"
   ```

3. Wait for RBAC propagation (2-10 minutes) and retry

4. Verify role includes correct permissions:
   ```bash
   az role definition list --name "Azure AI User" --query "[0].permissions[0].dataActions"
   # Should show: ["Microsoft.CognitiveServices/*"]
   ```

**Key difference between roles:**
- ❌ **Azure AI Developer**: `Microsoft.CognitiveServices/accounts/OpenAI/*`, `SpeechServices/*`, etc. (specific services, excludes agents)
- ✅ **Azure AI User**: `Microsoft.CognitiveServices/*` (all services, includes agents)

### "Failed to list agents"
- Verify managed identity has Azure AI User role (see above)
- Check Foundry project exists and accessible
- Review backend logs for authentication errors
- Wait 5-10 minutes if role was recently assigned

### "Failed to import agent"
- Verify agent ID is correct (starts with `asst_`)
- Check agent exists in Foundry project
- Ensure model is deployed in Foundry resource

### Agent responses not streaming
- Check browser dev tools for SSE connection
- Verify backend logs show streaming chunks
- Check for CORS issues with SSE

## Security Considerations

1. **Authentication**: All agent endpoints use `requireAuth` middleware
2. **Authorization**: Managed identity for Foundry API access
3. **Secrets**: Project endpoint stored as Container App secret
4. **Data Isolation**: Agent metadata per user (future: multi-tenant)
5. **Agent Access**: Only imported agents accessible in app

## Performance Notes

- **Agent Discovery**: Cached locally after import
- **Thread Creation**: Instant (Foundry creates lightweight threads)
- **Message Streaming**: Real-time SSE reduces perceived latency
- **Metadata Storage**: Minimal overhead (JSON in Blob)

## Future Enhancements

1. **Multiple Projects**: Support importing from different Foundry projects
2. **Agent Creation**: Create agents directly in app UI
3. **Tool Configuration**: Add/remove agent tools via UI
4. **Knowledge Management**: Upload files to agent knowledge base
5. **Shared Agents**: Enterprise-wide agent library
6. **Agent Templates**: Pre-configured agent templates for common scenarios
7. **Analytics**: Track agent usage, performance, costs
8. **Agent Marketplace**: Discover and import public agents

---

**Implementation Date**: November 10, 2025
**Status**: Backend Complete, Frontend Partial
**Next Review**: After frontend completion and testing
