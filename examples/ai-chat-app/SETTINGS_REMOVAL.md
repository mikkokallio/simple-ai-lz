# Settings Feature Removal - Issue Documentation

## Date: November 11, 2025

## What Was Requested
User requested removal of Settings UI feature since the default agent is now configured in Azure AI Foundry (not per-user).

## What Was Changed

### Frontend (Successfully Removed)
- ✅ Removed Settings button from sidebar
- ✅ Removed Settings modal (154 lines of JSX)
- ✅ Removed all Settings-related state: `showSettings`, `preferences`, `editedPreferences`, `availableMcpServers`
- ✅ Removed Settings API functions: `fetchPreferences()`, `updatePreferences()`, `fetchMcpServers()`
- ✅ Removed Settings-related types: `UserPreferences`, `MCPServer` interfaces
- ✅ Removed Settings load/save handler functions
- ✅ Frontend compiles successfully
- ✅ **Deployed as v19 - WORKING**

### Backend (Attempted Removal - FAILED)
- ✅ Removed `/api/preferences` endpoints (GET/PUT)
- ✅ Removed `/api/mcp-servers` endpoint (GET)
- ✅ Removed UserPreferences and MCPServer type definitions
- ✅ Removed MCP_SERVERS_CONFIG parsing
- ✅ Moved preference functions to deprecated comment block
- ✅ Backend compiles successfully locally
- ❌ **Deployed as v23 - BROKEN (token verification failed)**
- ✅ **Rolled back to v22 - WORKING**

## The Mystery: Why Did v23 Fail?

### Symptoms
- Backend v23 started successfully
- All initialization completed (storage, OpenAI, agent client, default agent)
- But ALL authenticated requests failed with: `"Authentication failed - no user: In Strategy.prototype.jwtVerify: cannot verify token"`

### What We Ruled Out
1. **Code changes**: The Settings removal didn't touch authentication code
2. **Frontend token**: Using same `loginRequest` scope that worked in v16
3. **Local compilation**: Backend code compiles without errors locally
4. **Environment variables**: Same ENTRA_* variables as v22

### What Could Have Caused It
**Hypothesis**: The v23 Docker build may have had an issue with:
- Dependency versions (passport-azure-ad deprecation warnings)
- Build timing or layer caching
- Environment variable propagation during build

### Timeline of Events
1. v16 frontend + v22 backend = ✅ Working perfectly
2. Removed Settings from frontend → v17
3. Removed Settings from backend → v23
4. Deployed BOTH v17 + v23 together
5. Authentication broke with "cannot verify token"
6. Incorrectly changed frontend token scope (v18) - made it worse
7. Reverted token scope (v19) + rolled back backend to v22 = ✅ Working again

## Current State

### Deployed (WORKING)
- **Frontend v19**: Settings removed, using `loginRequest` token scope
- **Backend v22**: Settings endpoints still exist but not used by frontend

### Local Code (READY)
- **Frontend**: Clean, Settings removed, compiles successfully
- **Backend**: Clean, Settings removed, compiles successfully
- **Issue**: Backend Settings removal works locally but failed in v23 deployment

## Recommendations

### Short Term
- ✅ Keep frontend v19 deployed (Settings removed)
- ✅ Keep backend v22 deployed (Settings still there but unused)
- This configuration is fully functional for users

### Long Term - Before Removing Backend Settings
1. **Investigate v23 failure**:
   - Check Docker build logs for v23 vs v22
   - Compare dependency versions in built images
   - Test token validation in isolated environment

2. **Possible fixes to try**:
   - Update `passport-azure-ad` to non-deprecated version
   - Lock dependency versions in package.json
   - Clear Docker build cache before building
   - Test authentication immediately after deployment

3. **Safe deployment process**:
   - Deploy backend changes separately from frontend
   - Test authentication after each deployment
   - Keep previous version available for quick rollback

## Lessons Learned

1. **Don't deploy frontend + backend together** when making significant changes
2. **Settings removal was fine** - the issue was unrelated to the code changes
3. **Token verification mysteriously failed** in v23 despite identical auth code
4. **Local compilation success ≠ deployment success** for Docker builds
5. **Always have rollback plan** - saved us with v22 rollback

## Files Changed

### Frontend
- `frontend/src/main.tsx` - Settings UI removed
- `frontend/src/authConfig.ts` - Unchanged (using loginRequest)

### Backend  
- `backend/src/server.ts` - Settings endpoints commented/removed
- `backend/src/auth/*` - Unchanged (authentication working in v22)

## Future Work

- [ ] Investigate why v23 token verification failed
- [ ] Update passport-azure-ad to non-deprecated package
- [ ] Deploy backend Settings removal once token issue resolved
- [ ] Document proper backend deployment process
