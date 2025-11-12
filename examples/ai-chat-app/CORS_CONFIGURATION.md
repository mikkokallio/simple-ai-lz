# CORS Configuration - Best Practices Implementation

## Overview

CORS (Cross-Origin Resource Sharing) is now properly configured following cloud-native best practices:

✅ **Infrastructure-level CORS** (Container Apps ingress)  
✅ **Zero application-level CORS** (removed from Express code)  
✅ **Fully repeatable** (defined in Bicep IaC)  
✅ **Environment-aware** (auto-configures from frontend URL)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend Container App                                       │
│ https://aca-ai-chat-frontend-*.azurecontainerapps.io       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ HTTP Request
                        │ Origin: https://frontend.azurecontainerapps.io
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend Container App Ingress (CORS handled here)          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ CORS Policy:                                            │ │
│ │  - allowedOrigins: [frontend URL]                      │ │
│ │  - allowedMethods: [GET, POST, PUT, DELETE, OPTIONS]   │ │
│ │  - allowedHeaders: [*]                                  │ │
│ │  - allowCredentials: true                               │ │
│ └─────────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
                  ┌──────────┐
                  │ Express  │
                  │   App    │ (No CORS middleware)
                  └──────────┘
```

## Why This Approach?

### ✅ Cloud-Native Best Practices

1. **Separation of Concerns**
   - Infrastructure concerns (CORS, TLS, routing) → Infrastructure layer
   - Business logic → Application code
   - Clear boundaries, easier to manage

2. **Infrastructure as Code**
   - CORS policy defined in Bicep
   - Version controlled
   - Repeatable deployments
   - No manual configuration drift

3. **Performance**
   - CORS handled at ingress (reverse proxy)
   - Faster than application-level middleware
   - Reduces application overhead

4. **Security**
   - Centralized security policy
   - Consistent enforcement
   - Easier to audit and update

5. **Portability**
   - Application code doesn't know about deployment environment
   - Can run anywhere (local, Docker, Kubernetes, Container Apps)
   - CORS is deployment-time configuration

## Configuration

### Bicep Parameters

```bicep
@description('Allowed CORS origins for backend API (comma-separated). If empty, will default to frontend URL.')
param corsAllowedOrigins string = ''
```

### Usage

**Auto-configure (Recommended):**
```bash
# Leave corsAllowedOrigins empty - automatically uses frontend URL
az deployment group create \
  --template-file app.bicep \
  --parameters corsAllowedOrigins=""
```

**Manual configuration:**
```bash
# Specify custom origins (for multi-frontend scenarios)
az deployment group create \
  --template-file app.bicep \
  --parameters corsAllowedOrigins="https://frontend1.com,https://frontend2.com"
```

## Bicep Implementation

```bicep
// Calculate CORS origins dynamically
var frontendUrl = 'https://${frontendAppName}.${envDomain}.azurecontainerapps.io'
var corsOrigins = !empty(corsAllowedOrigins) 
  ? split(corsAllowedOrigins, ',') 
  : [frontendUrl]

// Apply to backend ingress
resource backendApp 'Microsoft.App/containerApps@2023-05-01' = {
  properties: {
    configuration: {
      ingress: {
        external: true
        targetPort: 5000
        corsPolicy: {
          allowedOrigins: corsOrigins
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
          exposeHeaders: ['*']
          allowCredentials: true
        }
      }
    }
  }
}
```

## Application Code Changes

### Before (❌ Anti-pattern)

```typescript
import cors from 'cors';

app.use(cors({
  origin: true,
  credentials: true
}));
```

**Problems:**
- Hardcoded in application
- Not repeatable across environments
- Requires code change to update CORS
- Mixed infrastructure and application concerns

### After (✅ Best Practice)

```typescript
// No CORS middleware needed!
// CORS is handled by Container Apps ingress

app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());
```

**Benefits:**
- Clean application code
- Infrastructure handles infrastructure concerns
- Easy to update without code changes
- Works consistently across all environments

## Deployment

### Full Deployment (Repeatable)

```powershell
# Use the deployment script
./infrastructure/deploy-app.ps1 `
  -BackendImage "acr.azurecr.io/backend:v24" `
  -FrontendImage "acr.azurecr.io/frontend:v14" `
  -EntraClientId "..." `
  -EntraTenantId "..."
```

### Quick Update (Image Only)

```bash
# Update backend (CORS policy persists from Bicep)
az containerapp update \
  --name aca-ai-chat-backend-ezle7syi \
  --resource-group rg-ailz-lab \
  --image acrezle7syiailz.azurecr.io/ai-chat-backend:v24
```

## Verification

### Check CORS Configuration

```bash
az containerapp show \
  --name aca-ai-chat-backend-ezle7syi \
  --resource-group rg-ailz-lab \
  --query "properties.configuration.ingress.corsPolicy"
```

Expected output:
```json
{
  "allowCredentials": true,
  "allowedHeaders": ["*"],
  "allowedMethods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  "allowedOrigins": [
    "https://aca-ai-chat-frontend-ezle7syi.mangosmoke-*.azurecontainerapps.io"
  ],
  "exposeHeaders": ["*"]
}
```

### Test CORS

```bash
# Should return CORS headers
curl -H "Origin: https://aca-ai-chat-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -X OPTIONS \
  https://aca-ai-chat-backend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io/api/threads
```

## Migration Summary

| Aspect | Before | After |
|--------|--------|-------|
| **CORS Location** | Express middleware | Container Apps ingress |
| **Configuration** | Hardcoded in code | Bicep parameter |
| **Repeatability** | Manual/ad-hoc | Fully automated |
| **Dependencies** | `cors` npm package | None (removed) |
| **Image Size** | +3 packages | -3 packages (smaller) |
| **Flexibility** | Requires rebuild | Update via Bicep/CLI |
| **Best Practice** | ❌ Anti-pattern | ✅ Cloud-native |

## References

- [Azure Container Apps CORS](https://learn.microsoft.com/en-us/azure/container-apps/ingress-cors)
- [12-Factor App: Config](https://12factor.net/config)
- [Cloud-Native Patterns](https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/introduce-eshoponcontainers-reference-app)

## Files Changed

- ✅ `infrastructure/app.bicep` - Added CORS policy
- ✅ `infrastructure/app.parameters.json` - Added parameters
- ✅ `infrastructure/deploy-app.ps1` - Deployment script
- ✅ `backend/src/server.ts` - Removed CORS middleware
- ✅ `backend/package.json` - Removed `cors` dependency
- ✅ `CORS_CONFIGURATION.md` - This documentation

---

**Status:** ✅ Implemented and deployed (v24)  
**Last Updated:** 2025-11-11
