# OCR & Translation App

A modern web application demonstrating Azure AI services for document processing, optical character recognition (OCR), and translation capabilities.

## Features

- **Document Intelligence (OCR)** - Extract text and structure from documents using Azure Document Intelligence
- **Content Understanding (Preview)** - Advanced document understanding with AI Foundry's Content Understanding service  
- **Document Translation** - Translate documents between multiple languages using Azure Translator

## Architecture

```
┌─────────────────┐      HTTPS/443      ┌──────────────────┐
│  React Frontend │ ◄──────────────────► │  Backend API     │
│  (TypeScript +  │                      │  (Node.js/       │
│   TailwindCSS)  │                      │   Express)       │
└─────────────────┘                      └──────────────────┘
                                                  │
                                                  │ Managed Identity
                                                  │ (Private Endpoint)
                                                  ▼
                        ┌────────────────────────────────────────┐
                        │      Azure AI Services (Private)       │
                        ├────────────────────────────────────────┤
                        │  • AI Foundry (Content Understanding)  │
                        │  • Document Intelligence              │
                        │  • Document Translator                │
                        └────────────────────────────────────────┘
```

Both frontend and backend run as **Container Apps** with:
- **Internal ingress** (VNet-accessible via VPN)
- **Managed identity** for secure Azure AI service authentication
- **Private endpoints** for AI services (no public access)
- **Zero secrets** in code or configuration

## Project Structure

```
ocr-translation-app/
├── frontend/          # React + TypeScript + Vite frontend
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── Dockerfile
├── backend/           # Node.js/Express API
│   ├── src/
│   ├── package.json
│   └── Dockerfile
├── infrastructure/    # Bicep templates for app deployment
│   └── app.bicep
└── docs/              # Additional documentation
```

## Prerequisites

1. **Infrastructure deployed** - The base AI landing zone must be deployed first (main.bicep)
2. **VPN connected** - Apps are internal-only, accessible via Point-to-Site VPN
3. **AI services enabled** - Deploy with `deployAiServices=true` parameter

## Quick Start

### 1. Deploy Infrastructure

The base infrastructure (VNet, Container Apps Environment, AI services) must be deployed first:

```powershell
# From repository root
az deployment sub create \
  --name ailz-deployment \
  --location swedencentral \
  --template-file main.bicep \
  --parameters main.bicepparam
```

### 2. Deploy the App

```powershell
# From examples/ocr-translation-app/infrastructure/
az deployment group create \
  --resource-group rg-ailz-lab \
  --template-file app.bicep \
  --parameters @app.parameters.json
```

### 3. Access the App

1. Connect to the VPN (see main README for VPN setup)
2. Navigate to the app URL (output from deployment)
3. Upload documents and choose your AI service

## Development

### Frontend

```bash
cd frontend/
npm install
npm run dev  # Local development
npm run build  # Production build
```

### Backend

```bash
cd backend/
npm install
npm run dev  # Local development with hot reload
npm run build  # Production build
npm start  # Run production build
```

## API Endpoints

- `POST /api/ocr/document-intelligence` - Process document with Document Intelligence
- `POST /api/ocr/content-understanding` - Process with Content Understanding (AI Foundry)
- `POST /api/translate` - Translate document
- `GET /api/health` - Health check endpoint

## Configuration

Configuration is managed via environment variables injected by Container Apps:

- `AZURE_CLIENT_ID` - Managed identity client ID (auto-injected)
- `DOCUMENT_INTELLIGENCE_ENDPOINT` - Document Intelligence service endpoint
- `AI_FOUNDRY_ENDPOINT` - AI Foundry endpoint
- `TRANSLATOR_ENDPOINT` - Translator service endpoint

No secrets or keys are needed - authentication uses managed identity.

## Security

- ✅ **No public access** - All AI services use private endpoints
- ✅ **Managed identity** - No credentials in code or config
- ✅ **VNet isolation** - Apps only accessible via VPN
- ✅ **HTTPS only** - All traffic encrypted
- ✅ **RBAC** - Least privilege access to AI services

## Cost Estimate

- Frontend Container App: ~$0 (consumption, minimal traffic)
- Backend Container App: ~$0 (consumption, minimal traffic)  
- Document Intelligence S0: ~$1.50/1000 pages
- Translator S1: ~$10/million characters
- AI Foundry: Pay-per-use (varies by model)

Most costs are pay-per-use for AI services.

## Troubleshooting

### Cannot access app
- Ensure VPN is connected
- Verify app ingress is set to `external: true` (VNet-accessible)
- Check Container Apps logs

### AI service errors
- Verify managed identity has appropriate RBAC roles
- Check private endpoint connectivity
- Review backend logs for specific errors

## Next Steps

- [ ] Add support for batch processing
- [ ] Implement result caching
- [ ] Add more document formats
- [ ] Create admin dashboard
- [ ] Add usage analytics

## License

See repository root LICENSE file.
