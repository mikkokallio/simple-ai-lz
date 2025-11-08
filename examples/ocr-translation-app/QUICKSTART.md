# OCR & Translation App - Local Development

Quick start guide for running the app locally.

## Prerequisites

- Node.js 20+
- npm or yarn

## Backend

```powershell
cd backend
npm install
npm run dev
```

The backend will run on `http://localhost:3000`

### Environment Variables

Copy `.env.example` to `.env` and configure:

```
NODE_ENV=development
PORT=3000
AI_FOUNDRY_ENDPOINT=https://your-ai-foundry.cognitiveservices.azure.com/
DOCUMENT_INTELLIGENCE_ENDPOINT=https://your-doc-intel.cognitiveservices.azure.com/
TRANSLATOR_ENDPOINT=https://your-translator.cognitiveservices.azure.com/
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=...
```

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend will run on `http://localhost:5173`

### Environment Variables

Copy `.env.example` to `.env`:

```
VITE_BACKEND_URL=http://localhost:3000
```

## Building Containers

### Backend

```powershell
cd backend
docker build -t ocr-translation-backend:latest .
docker run -p 3000:3000 --env-file .env ocr-translation-backend:latest
```

### Frontend

```powershell
cd frontend
docker build -t ocr-translation-frontend:latest .
docker run -p 80:80 -e VITE_BACKEND_URL=http://localhost:3000 ocr-translation-frontend:latest
```

## Deploying to Azure Container Apps

See the main [README.md](README.md) for full deployment instructions.

Quick deploy:

```powershell
# Build and push to ACR
az acr build --registry <your-acr> --image ocr-translation-backend:latest ./backend
az acr build --registry <your-acr> --image ocr-translation-frontend:latest ./frontend

# Deploy
az deployment group create `
  --resource-group <your-rg> `
  --template-file infrastructure/app.bicep `
  --parameters frontendImage=<your-acr>.azurecr.io/ocr-translation-frontend:latest `
  --parameters backendImage=<your-acr>.azurecr.io/ocr-translation-backend:latest `
  --parameters aiFoundryId=<resource-id> `
  --parameters documentIntelligenceId=<resource-id> `
  --parameters documentTranslatorId=<resource-id>
```

## MVP Status

This is an MVP demonstrating containerization in Azure Container Apps:

✅ Backend Express API with health endpoint
✅ Frontend React app showing backend status
✅ Docker containerization for both
✅ Azure Container Apps infrastructure
⏳ Full OCR and translation functionality (coming later)

The stub endpoints return success responses but don't process documents yet.
