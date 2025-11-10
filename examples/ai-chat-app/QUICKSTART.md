# Quick Start Guide - AI Chat Application

Get up and running in 5 minutes!

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Azure CLI
- Azure subscription with:
  - Storage Account
  - OpenAI Service with gpt-4o deployment

## Step 1: Authenticate with Azure

```bash
az login
```

## Step 2: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your values
# Required values:
#   - AZURE_STORAGE_ACCOUNT_NAME
#   - AZURE_OPENAI_ENDPOINT
#   - AZURE_OPENAI_DEPLOYMENT_NAME (usually "gpt-4o")
```

Example `.env`:
```env
AZURE_STORAGE_ACCOUNT_NAME=mystorage123
AZURE_STORAGE_CONTAINER_NAME=chat-data
AZURE_OPENAI_ENDPOINT=https://my-openai.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
SESSION_SECRET=my-secret-key-for-dev
```

## Step 3: Start with Docker Compose

```bash
docker-compose up --build
```

Wait for both services to start. You'll see:
```
✅ Storage initialized: chat-data
✅ OpenAI client initialized
🚀 AI Chat Backend running on port 5000
```

## Step 4: Access the Application

Open your browser and navigate to:
```
http://localhost:8080
```

## Step 5: Start Chatting!

1. Click "New +" to create your first thread
2. Type a message and press Enter
3. Watch the AI response stream in real-time
4. Try the ⚙️ Settings button to customize AI behavior

## Alternative: Local Development (without Docker)

### Terminal 1 - Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on: http://localhost:5000

### Terminal 2 - Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on: http://localhost:5173

## Troubleshooting

### "Failed to initialize storage"
- Ensure you're logged in: `az login`
- Verify storage account name is correct
- Check your Azure permissions

### "Failed to initialize OpenAI"
- Verify OpenAI endpoint URL (must include https://)
- Check deployment name matches your Azure OpenAI deployment
- Ensure your account has "Cognitive Services OpenAI User" role

### "Cannot connect to backend"
- Check if backend is running on port 5000
- Look for any error messages in backend logs
- Verify Docker containers are healthy: `docker-compose ps`

### Port conflicts
- If port 5000 or 8080 are in use, stop other services or change ports in docker-compose.yml

## Quick Test Commands

```bash
# Check backend health
curl http://localhost:5000/api/health

# List threads (should be empty initially)
curl http://localhost:5000/api/threads

# Check frontend is serving
curl http://localhost:8080
```

## Stopping the Application

```bash
# Press Ctrl+C in the terminal where docker-compose is running
# Or run:
docker-compose down
```

## Next Steps

- Read [README.md](README.md) for detailed features
- See [DEPLOYMENT.md](DEPLOYMENT.md) for Azure deployment
- Customize settings in the UI (⚙️ Settings button)
- Create multiple threads and switch between them

## Tips

- **Keyboard Shortcuts**:
  - Enter: Send message
  - Shift+Enter: New line in message

- **Settings to Try**:
  - Temperature 0.2: More focused responses
  - Temperature 1.5: More creative responses
  - System Prompt: "You are a helpful coding assistant" for programming help

- **Data Location**:
  - All data is stored in Azure Blob Storage
  - Container: `chat-data`
  - Structure: `demo/threads/`, `demo/messages/`, `demo/preferences.json`

Enjoy chatting with your AI! 🤖
