# AI Chat Application - Design Document

## 🎉 Implementation Status: COMPLETE

All core features have been implemented! The application is ready for testing and deployment.

## Overview
A ChatGPT-like conversational AI application with persistent chat history, thread management, and user preferences. The application uses Azure OpenAI's Responses API for intelligent conversations.

**What's Implemented:**
- ✅ Complete React frontend with chat interface
- ✅ Node.js/Express backend with all 8 API endpoints
- ✅ Azure OpenAI Responses API integration with streaming
- ✅ Thread management (create, list, delete, switch)
- ✅ Message persistence with Azure Blob Storage
- ✅ User preferences (model, temperature, max tokens, system prompt)
- ✅ Docker containerization for both frontend and backend
- ✅ Docker Compose for local development
- ✅ Complete documentation (README, DEPLOYMENT)
- ✅ Startup scripts for easy local development

## Architecture

### Components
1. **Frontend** - React + TypeScript chat interface
2. **Backend (Orchestrator)** - Node.js + Express API server
3. **Azure OpenAI** - Responses API for AI capabilities
4. **Future: Foundry Agent Service** - Thread management and orchestration

## Technology Stack

### Frontend
- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Inline CSS (Azure Portal style)
- **State Management**: React hooks
- **HTTP Client**: Fetch API
- **Build**: Docker multi-stage build with nginx

### Backend
- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Express.js
- **Storage**: Azure Blob Storage (threads, messages, preferences)
- **AI Integration**: Azure OpenAI Responses API
- **Session Management**: express-session with MemoryStore
- **Build**: Docker with TypeScript compilation

### Azure Services
- **Azure OpenAI**: gpt-4o model via Responses API
- **Azure Blob Storage**: Persistent storage for chat data
- **Azure Container Registry**: Image storage
- **Azure Container Apps**: Application hosting

## Features

### Core Features (MVP)
1. **Chat Interface**
   - Real-time message exchange with AI
   - Streaming responses (if supported)
   - Message history display
   - Loading indicators
   - Error handling

2. **Thread Management**
   - Create new chat threads
   - List all threads with preview
   - Switch between threads
   - Delete threads
   - Auto-save messages

3. **User Preferences**
   - Model selection (gpt-4o, gpt-4o-mini)
   - Temperature control (0-2)
   - Max tokens setting
   - System prompt customization
   - Theme preferences (light/dark)

4. **Data Persistence**
   - Threads stored in blob storage
   - Messages stored per thread
   - Preferences stored per user
   - All data survives browser refresh

### Future Enhancements
- Multi-user support with authentication
- Agent Service integration for advanced orchestration
- File attachments and image support
- Code syntax highlighting
- Export chat history
- Voice input/output

## API Design

### Backend Endpoints

#### Thread Management
- `GET /api/threads` - List all threads
- `POST /api/threads` - Create new thread
- `GET /api/threads/:threadId` - Get thread details
- `DELETE /api/threads/:threadId` - Delete thread
- `GET /api/threads/:threadId/messages` - Get thread messages

#### Chat Operations
- `POST /api/chat` - Send message and get AI response
  - Body: `{ threadId, message, preferences }`
  - Returns: `{ response, messageId, threadId }`

#### Preferences
- `GET /api/preferences` - Get user preferences
- `PUT /api/preferences` - Update user preferences

#### Health
- `GET /health` - Health check endpoint

## Data Models

### Thread
```typescript
interface Thread {
  threadId: string;           // UUID
  userId: string;             // Static 'demo' for now
  title: string;              // First message or "New Chat"
  createdAt: string;          // ISO timestamp
  lastMessageAt: string;      // ISO timestamp
  messageCount: number;       // Total messages in thread
  preview: string;            // Last message preview
}
```

### Message
```typescript
interface Message {
  messageId: string;          // UUID
  threadId: string;           // Reference to thread
  role: 'user' | 'assistant' | 'system';
  content: string;            // Message text
  timestamp: string;          // ISO timestamp
  metadata?: {
    model?: string;
    tokens?: number;
    error?: string;
  };
}
```

### Preferences
```typescript
interface UserPreferences {
  userId: string;             // Static 'demo' for now
  model: 'gpt-4o' | 'gpt-4o-mini';
  temperature: number;        // 0-2
  maxTokens: number;          // Max response length
  systemPrompt: string;       // Custom system instruction
  theme: 'light' | 'dark';
  lastUpdated: string;        // ISO timestamp
}
```

## Storage Structure (Azure Blob)

```
workspace/
  demo/
    threads/
      {threadId}/
        metadata.json          # Thread info
        messages.json          # Array of messages
    preferences.json           # User preferences
```

## UI Design

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│ [☰] AI Chat Assistant                    [⚙️ Settings] [🧵] │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│ Threads  │                  Chat Area                       │
│          │                                                  │
│ 🧵 Chat 1│  User: Hello!                                   │
│ 🧵 Chat 2│  AI: Hi! How can I help you today?             │
│ 🧵 Chat 3│  User: Tell me about...                        │
│          │  AI: [Streaming response...]                    │
│ + New    │                                                  │
│          │  ┌─────────────────────────────────┐           │
│          │  │ Type your message...            │ [Send]    │
│          │  └─────────────────────────────────┘           │
└──────────┴──────────────────────────────────────────────────┘
```

### Color Scheme (Azure Portal Style)
- Primary: `#0078d4` (Azure blue)
- Hover: `#106ebe`
- Success: `#107c10`
- Error: `#d13438`
- Background: `#faf9f8`
- Surface: `#ffffff`
- Text: `#323130`
- Border: `#edebe9`

## OpenAI Responses API Integration

### Request Format
```typescript
POST https://{endpoint}.openai.azure.com/openai/deployments/{model}/responses
Content-Type: application/json
api-key: {apiKey}

{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant" },
    { "role": "user", "content": "Hello!" }
  ],
  "temperature": 1,
  "max_tokens": 4096
}
```

### Response Handling
- Parse streaming or non-streaming responses
- Extract assistant message
- Handle errors gracefully
- Track token usage

## Environment Variables

### Backend
```
NODE_ENV=production
PORT=3000
AZURE_OPENAI_ENDPOINT=https://...
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=gpt-4o
STORAGE_ACCOUNT_NAME=...
```

### Frontend
```
VITE_API_URL=http://localhost:3000
```

## Development Workflow

1. **Initial Setup**
   - Create folder structure
   - Set up TypeScript configs
   - Configure build systems

2. **Backend Development**
   - Implement storage layer
   - Create thread management
   - Integrate OpenAI API
   - Add preferences handling

3. **Frontend Development**
   - Build chat interface
   - Implement thread sidebar
   - Create settings panel
   - Add message display

4. **Integration**
   - Connect frontend to backend
   - Test all workflows
   - Handle edge cases

5. **Deployment**
   - Build Docker images
   - Push to ACR
   - Deploy to Container Apps
   - Configure environment variables

## Security Considerations

- API key stored securely in environment
- CORS configured for frontend origin
- Session-based user identification (temporary)
- Input validation on all endpoints
- Rate limiting (future)

## Success Criteria

- ✅ User can send messages and receive AI responses
- ✅ Conversations persist across sessions
- ✅ Multiple threads can be managed simultaneously
- ✅ Preferences are saved and applied
- ✅ UI is responsive and intuitive
- ✅ Error handling is robust
- ✅ Application is containerized and deployable

## Future Roadmap

### Phase 2: Foundry Agent Service
- Integrate with Azure AI Foundry
- Advanced thread orchestration
- Agent-based workflows
- RAG (Retrieval Augmented Generation)

### Phase 3: Advanced Features
- Multi-user authentication (Microsoft Entra ID)
- File upload and analysis
- Image generation
- Voice chat
- Collaboration features

### Phase 4: Enterprise Features
- Usage analytics
- Cost tracking
- Admin dashboard
- Custom model fine-tuning
- API access for third parties
