# Adventure Creator

AI-powered D&D 5e adventure creation tool with React frontend and Node.js backend.

## Project Structure

```
adventure-creation/
├── frontend/           # React + Vite frontend
│   ├── src/           # React components and pages
│   ├── public/        # Static assets
│   ├── Dockerfile     # Frontend container build
│   └── package.json   # Frontend dependencies
├── backend/           # Node.js + Express backend
│   ├── src/           # API routes and services
│   ├── Dockerfile     # Backend container build
│   └── package.json   # Backend dependencies
├── infrastructure/    # Bicep templates for Azure deployment
├── docker-compose.yml # Local development setup
└── README.md         # This file
```

## Local Development

### Prerequisites
- Node.js 22+
- npm or yarn

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on http://localhost:5173

### Backend Development
```bash
cd backend
npm install
npm run dev
```
Backend runs on http://localhost:3000

### Docker Development
```bash
# Build and run both services
docker-compose up --build

# Frontend: http://localhost:8080
# Backend: http://localhost:3000
```

## Azure Deployment

### Build Container Images
```bash
# Build backend image
az acr build --registry <registry-name> \
  --image adventure-creator-backend:latest \
  --file backend/Dockerfile \
  ./backend

# Build frontend image
az acr build --registry <registry-name> \
  --image adventure-creator-frontend:latest \
  --file frontend/Dockerfile \
  ./frontend
```

### Deploy Infrastructure
```bash
cd infrastructure
./deploy.ps1 -ResourceGroup <resource-group-name>
```

## Features

- **AI-Powered Generation**: Create adventures, NPCs, encounters using Azure OpenAI
- **D&D 5e Compatible**: Full stat blocks, encounter balancing, XP calculations
- **Visual Editor**: Drag-and-drop interface with real-time preview
- **Secure**: Azure AD authentication, private endpoints, VPN access

## License

See LICENSE file for details.
