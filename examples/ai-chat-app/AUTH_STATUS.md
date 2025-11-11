# Authentication Implementation - Current Status

## ✅ Completed Work

### Backend Changes

1. **Authentication Infrastructure**
   - ✅ Installed: `passport`, `passport-azure-ad`, `express-session`, `@types/passport`, `@types/express-session`
   - ✅ Created: `backend/src/auth/authConfig.ts` - Configuration management
   - ✅ Created: `backend/src/auth/authMiddleware.ts` - Passport strategy & middleware
   - ✅ Updated: `backend/src/server.ts` - Integrated authentication

2. **Data Model Updates**
   - ✅ Added `userId?: string` to `AgentMetadata` interface (for imported agents)
   - ✅ Added `userId: string` to `AgentThread` interface (required for all threads)

3. **Default Agent Changes**
   - ✅ Changed from per-user (`default-agent-{userId}`) to shared (`default`)
   - ✅ Agent name changed to "Default" (clean, no prefix)
   - ✅ Checks if "default" agent exists in Foundry before creating

4. **Protected Endpoints** (now require authentication)
   - ✅ `GET /api/user` - Returns logged-in user info
   - ✅ `GET /api/threads` - Filters threads by userId
   - ✅ `GET /api/agents` - Shows default agent + user's imported agents
   - ✅ `POST /api/agents/discover` - Excludes "Default" from import list
   - ✅ `POST /api/agents/import` - Associates imported agent with userId
   - ✅ `POST /api/threads/:threadId/messages` - Associates new threads with userId
   - ✅ `POST /api/agents/:agentId/threads` - Associates new threads with userId

5. **Environment Configuration**
   - ✅ Updated `.env.example` with Entra ID variables
   - ✅ Created `ENTRA_ID_SETUP.md` - Complete setup guide

### Frontend Changes

1. **MSAL Packages**
   - ✅ Installed: `@azure/msal-browser`, `@azure/msal-react`

## 🚧 Remaining Work

### You Need to Do

1. **Create Entra ID App Registration** (following `ENTRA_ID_SETUP.md`)
   - Create app registration in Azure Portal
   - Configure redirect URIs (SPA platform):
     - Development: `http://localhost:5173`
     - Production: `https://aca-ai-chat-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io`
   - Create client secret
   - Copy configuration values

2. **Update Backend .env File**
   ```bash
   ENTRA_TENANT_ID=<your-tenant-id-guid>
   ENTRA_CLIENT_ID=<your-client-id-guid>
   ENTRA_CLIENT_SECRET=<your-client-secret-value>
   ENTRA_AUDIENCE=<your-client-id-guid>
   ENTRA_ISSUER=https://login.microsoftonline.com/<your-tenant-id>/v2.0
   ```

### I Still Need to Do

1. **Frontend MSAL Integration**
   - [ ] Create MSAL configuration file
   - [ ] Wrap app with `MsalProvider`
   - [ ] Add login/logout logic
   - [ ] Add authentication context hooks
   - [ ] Add user profile UI component (bottom-left sidebar)
   - [ ] Add modal for user details + logout button

2. **Frontend API Updates**
   - [ ] Update all `fetch()` calls to include `Authorization: Bearer <token>` header
   - [ ] Add token acquisition before each API call
   - [ ] Handle 401 errors (redirect to login)
   - [ ] Handle token refresh automatically

## 📋 Configuration Values Needed

### From Entra ID App Registration

You'll need to provide these values from your app registration:

1. **Application (client) ID** - GUID format
   - Backend: `ENTRA_CLIENT_ID`
   - Frontend: `VITE_ENTRA_CLIENT_ID`

2. **Directory (tenant) ID** - GUID format
   - Backend: `ENTRA_TENANT_ID`
   - Frontend: `VITE_ENTRA_TENANT_ID`

3. **Client Secret** - String value (only for backend)
   - Backend: `ENTRA_CLIENT_SECRET`
   - ⚠️ Keep this secure, never commit to git

### Frontend Environment Variables (still to be created)

Create `frontend/.env` file with:
```bash
VITE_ENTRA_CLIENT_ID=<your-client-id-guid>
VITE_ENTRA_TENANT_ID=<your-tenant-id-guid>
VITE_ENTRA_REDIRECT_URI=http://localhost:5173
```

For production, these will be:
```bash
VITE_ENTRA_CLIENT_ID=<your-client-id-guid>
VITE_ENTRA_TENANT_ID=<your-tenant-id-guid>
VITE_ENTRA_REDIRECT_URI=https://aca-ai-chat-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io
```

## 🔑 Key Decisions Made

1. **Single Shared Default Agent**
   - ID: `default`
   - Name: `Default`
   - Accessible to all authenticated users
   - Not shown in import discovery

2. **User Data Isolation**
   - Threads: Filtered by `userId`
   - Imported agents: Filtered by `userId`
   - Default agent: Shared (no userId)

3. **Authentication Flow**
   - Frontend: MSAL with Authorization Code Flow + PKCE
   - Backend: passport-azure-ad Bearer token validation
   - Tokens: JWT bearer tokens in Authorization header

4. **User Interface**
   - User profile: Bottom-left corner of sidebar
   - User details modal: Click on profile to open
   - Logout: Button in modal

## 📁 New Files Created

```
backend/src/auth/
├── authConfig.ts          # Environment config & validation
└── authMiddleware.ts      # Passport strategy & helpers

examples/ai-chat-app/
├── ENTRA_ID_SETUP.md     # Complete setup guide
└── AUTH_STATUS.md        # This file
```

## 🔄 Next Steps (After App Registration)

1. You create app registration and provide values
2. I update backend `.env` with your values
3. I create frontend MSAL configuration
4. I integrate MSAL into React app
5. I update all API calls with authentication
6. We test locally with both running
7. We deploy backend v25 and frontend v16
8. We configure Container Apps environment variables
9. We test in production

## ⚠️ Important Notes

### For App Registration

- **Platform**: Must be "Single-page application (SPA)", NOT "Web"
- **Redirect URIs**: Must match exactly (case-sensitive, include protocol)
- **Client Secret**: Copy immediately after creation (can't view again)
- **Permissions**: Default `User.Read` is sufficient
- **Optional Claims**: Add email, name, upn for better UX

### For Deployment

- Backend needs all `ENTRA_*` variables as Container App secrets
- Frontend needs `VITE_ENTRA_*` variables baked into build
- Must use HTTPS in production (Entra ID requirement)
- Test locally first before deploying

### Security

- Never commit client secrets to git
- Use Managed Identity in production if possible
- Secrets should be in Azure Key Vault
- Token validation happens on every request (backend)
- CORS is already configured correctly

## 🐛 Known Issues to Watch For

1. **TypeScript Error** - `userId` property might show as not existing due to cache
   - Solution: Restart TypeScript server or rebuild
   - Error is cosmetic, code is correct

2. **CORS Issues** - If frontend can't call backend after auth
   - Check `Access-Control-Allow-Origin` includes frontend URL
   - Check `Access-Control-Allow-Headers` includes `Authorization`
   - Already configured in server.ts

3. **Token Expiration** - Tokens expire after 1 hour
   - MSAL handles refresh automatically
   - Backend returns 401 if token invalid
   - Frontend should retry with fresh token

## 📞 When You're Ready

Once you have the app registration values, let me know and I'll:
1. Create the frontend MSAL configuration
2. Integrate authentication into the React app
3. Add the user profile UI
4. Update all API calls to include auth tokens
5. Test the complete flow

We're about 60% done with the authentication implementation!
