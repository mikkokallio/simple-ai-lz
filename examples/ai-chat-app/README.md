# AI Chat Application

A ChatGPT-like conversational AI application built with React, TypeScript, Node.js, and Azure OpenAI.

## Features

- 💬 Real-time chat interface with streaming responses
- 📂 Thread management (create, switch, delete conversations)
- ⚙️ Customizable preferences (model, temperature, max tokens, system prompt)
- 💾 Persistent storage using Azure Blob Storage
- 🎨 Clean, modern UI inspired by Azure Portal design language
- 🔒 Managed Identity authentication with Azure services

## Architecture

### Frontend
- React 18 with TypeScript
- Vite for fast development and building
- Server-Sent Events (SSE) for streaming responses
- Inline CSS styling (Azure Portal design)

### Backend
- Node.js 20 + Express + TypeScript
- Azure OpenAI Responses API (GPT-4o)
- Azure Blob Storage for data persistence
- DefaultAzureCredential for authentication

### Data Storage Structure
```
chat-data/
└── demo/
    ├── threads/
    │   ├── {threadId}.json
    │   └── ...
    ├── messages/
    │   └── {threadId}/
    │       ├── {messageId}.json
    │       └── ...
    └── preferences.json
```

## Prerequisites

- Node.js 20 or later
- Docker and Docker Compose (for containerized deployment)
- Azure subscription with:
  - Azure Storage Account
  - Azure OpenAI Service with GPT-4o deployment
- Azure CLI installed and authenticated (`az login`)

## Local Development Setup

### 1. Clone and Navigate

```bash
cd examples/ai-chat-app
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and fill in your Azure resource details:

```env
AZURE_STORAGE_ACCOUNT_NAME=your_storage_account_name
AZURE_STORAGE_CONTAINER_NAME=chat-data
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
SESSION_SECRET=your-random-secret-key
```

### 3. Backend Setup

```bash
cd backend
npm install
npm run dev
```

The backend will start on http://localhost:5000

### 4. Frontend Setup (in a new terminal)

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on http://localhost:5173

## Docker Development

Build and run with Docker Compose:

```bash
# Make sure you're authenticated with Azure
az login

# Create .env file with your Azure credentials
cp .env.example .env
# Edit .env with your values

# Build and start
docker-compose up --build

# Access the app at http://localhost:8080
```

## Production Deployment to Azure Container Apps

### 1. Build and Push Docker Images

```bash
# Set your Azure Container Registry name
export ACR_NAME="your-acr-name"

# Login to ACR
az acr login --name $ACR_NAME

# Build and push backend
cd backend
docker build -t $ACR_NAME.azurecr.io/ai-chat-backend:latest .
docker push $ACR_NAME.azurecr.io/ai-chat-backend:latest

# Build and push frontend
cd ../frontend
docker build -t $ACR_NAME.azurecr.io/ai-chat-frontend:latest .
docker push $ACR_NAME.azurecr.io/ai-chat-frontend:latest
```

### 2. Deploy to Azure Container Apps

```bash
# Set variables
export RESOURCE_GROUP="your-resource-group"
export LOCATION="eastus"
export CONTAINER_ENV="your-container-env"
export STORAGE_ACCOUNT="your-storage-account"
export OPENAI_ENDPOINT="https://your-resource.openai.azure.com"

# Create Container Apps Environment (if not exists)
az containerapp env create \
  --name $CONTAINER_ENV \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

# Deploy backend
az containerapp create \
  --name ai-chat-backend \
  --resource-group $RESOURCE_GROUP \
  --environment $CONTAINER_ENV \
  --image $ACR_NAME.azurecr.io/ai-chat-backend:latest \
  --target-port 5000 \
  --ingress external \
  --registry-server $ACR_NAME.azurecr.io \
  --system-assigned \
  --env-vars \
    AZURE_STORAGE_ACCOUNT_NAME=$STORAGE_ACCOUNT \
    AZURE_STORAGE_CONTAINER_NAME=chat-data \
    AZURE_OPENAI_ENDPOINT=$OPENAI_ENDPOINT \
    AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o \
    SESSION_SECRET=your-production-secret

# Deploy frontend
az containerapp create \
  --name ai-chat-frontend \
  --resource-group $RESOURCE_GROUP \
  --environment $CONTAINER_ENV \
  --image $ACR_NAME.azurecr.io/ai-chat-frontend:latest \
  --target-port 80 \
  --ingress external \
  --registry-server $ACR_NAME.azurecr.io
```

### 3. Grant Permissions

The backend needs permissions to access Azure Storage and OpenAI:

```bash
# Get the backend's managed identity
BACKEND_PRINCIPAL_ID=$(az containerapp show \
  --name ai-chat-backend \
  --resource-group $RESOURCE_GROUP \
  --query identity.principalId -o tsv)

# Grant Storage Blob Data Contributor role
az role assignment create \
  --assignee $BACKEND_PRINCIPAL_ID \
  --role "Storage Blob Data Contributor" \
  --scope /subscriptions/{subscription-id}/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Storage/storageAccounts/$STORAGE_ACCOUNT

# Grant Cognitive Services OpenAI User role
az role assignment create \
  --assignee $BACKEND_PRINCIPAL_ID \
  --role "Cognitive Services OpenAI User" \
  --scope /subscriptions/{subscription-id}/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.CognitiveServices/accounts/{openai-account-name}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/threads` | List all threads |
| POST | `/api/threads` | Create new thread |
| GET | `/api/threads/:id` | Get thread details |
| DELETE | `/api/threads/:id` | Delete thread |
| GET | `/api/threads/:id/messages` | Get messages in thread |
| POST | `/api/threads/:id/messages` | Send message (streaming response) |
| GET | `/api/preferences` | Get user preferences |
| PUT | `/api/preferences` | Update user preferences |

## Data Models

### Thread
```typescript
{
  threadId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}
```

### Message
```typescript
{
  messageId: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
```

### UserPreferences
```typescript
{
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}
```

## Usage

1. **Create a Thread**: Click "New +" button in the sidebar
2. **Send Messages**: Type in the input area and press Enter (Shift+Enter for new line)
3. **Switch Threads**: Click on any thread in the sidebar
4. **Delete Threads**: Click the "Delete" button on a thread
5. **Adjust Settings**: Click the "⚙️ Settings" button to customize AI behavior

## Configuration

### User Preferences (via Settings UI)
- **Model**: OpenAI model to use (default: gpt-4o)
- **Temperature**: Controls randomness (0-2, default: 0.7)
- **Max Tokens**: Maximum response length (1-16000, default: 2000)
- **System Prompt**: Instructions for the AI assistant

## Troubleshooting

### Backend Issues

**"Failed to initialize storage"**
- Ensure Azure Storage Account exists
- Check that your identity has "Storage Blob Data Contributor" role
- Verify `AZURE_STORAGE_ACCOUNT_NAME` is correct

**"Failed to initialize OpenAI"**
- Ensure Azure OpenAI resource exists
- Check that your identity has "Cognitive Services OpenAI User" role
- Verify `AZURE_OPENAI_ENDPOINT` and deployment name are correct

### Frontend Issues

**Cannot connect to backend**
- Ensure backend is running on port 5000
- Check Vite proxy configuration in `vite.config.ts`
- For production, update `nginx.conf` with correct backend URL

**Streaming not working**
- Check browser console for errors
- Verify SSE (Server-Sent Events) are not blocked
- Ensure backend is sending correct Content-Type headers

## Security Considerations

- Uses Managed Identity for Azure authentication (no keys in code)
- Session cookies are HTTP-only
- CORS configured for specific frontend origin
- Helmet.js for security headers
- Input validation on all endpoints

## Future Enhancements

- [ ] Multi-user support with authentication
- [ ] File upload and analysis
- [ ] Export conversations
- [ ] Search across threads
- [ ] Integration with Azure AI Foundry Agent Service
- [ ] Token usage tracking and limits
- [ ] Markdown rendering in messages
- [ ] Code syntax highlighting

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
