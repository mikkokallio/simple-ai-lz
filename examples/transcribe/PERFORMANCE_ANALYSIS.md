# Performance Analysis & Optimization Guide

## Current Performance Issues
- **Browser refresh**: ~10 seconds loading time
- **Token acquisition**: ~10 seconds to get Speech Service token
- **Overall slowness**: All operations feel sluggish

## Performance Logging Added (v23/v18)

### Backend Logging (server.js)
1. **Startup tracking**:
   - Total server startup time
   - Individual Azure client initialization times (Cosmos, OpenAI, Storage, Credential)
   - Memory usage at startup
   - Periodic memory logging every 30 seconds

2. **Request-level middleware**:
   - Duration of every HTTP request
   - HTTP status code
   - Current memory usage (heap used/total, RSS)
   - Format: `[PERF] METHOD /path - STATUS - DURATIONms - Memory: XXMBheap/YYMBheap`

3. **Speech Token endpoint** (`/api/getSpeechToken`):
   - Request timestamp
   - Token exchange fetch duration
   - Token text parsing duration
   - Token length received
   - Total endpoint duration
   - Success/failure with ✓/✗ markers

4. **OpenAI processing** (`/api/processTranscript`):
   - Total transcript length
   - OpenAI API call duration
   - Cosmos DB save duration
   - Total endpoint duration

### Frontend Logging (page.tsx, RealTimeDictation.tsx)
1. **Page load metrics**:
   - DOM Content Loaded time
   - Page Load Complete time
   - React component mount time

2. **Token acquisition breakdown**:
   - API base URL used
   - Token fetch start timestamp
   - Token fetch HTTP duration
   - JSON parsing duration
   - Speech SDK config creation duration
   - Audio config and recognizer creation duration
   - Total time to start recording

## Potential Performance Bottlenecks

### 1. Cold Start Issues
**Symptom**: First request after deployment is very slow  
**Causes**:
- Container cold start (pulling image, starting container)
- Azure Managed Identity token acquisition (first call can take 3-5s)
- Lazy initialization of Azure SDK clients
- Network latency for first connections

**How to diagnose**:
- Check `[STARTUP]` logs for initialization times
- Compare first request vs subsequent requests
- Monitor Azure Container Apps scaling events

### 2. Azure Managed Identity Token Acquisition
**Symptom**: Slow responses on APIs that use Azure resources  
**Causes**:
- DefaultAzureCredential tries multiple auth methods sequentially
- Each token acquisition involves network calls to Azure metadata service
- Tokens are not cached by default in application code

**How to diagnose**:
- Look for `[AUTH]` logs showing token acquisition times
- Check if delays correlate with calls to Cosmos DB, OpenAI, or Storage
- Monitor for repeated token acquisitions for same resource

**Optimization opportunities**:
```javascript
// Current: Token acquired on every OpenAI call
azureADTokenProvider: async () => {
  const token = await credential.getToken('https://cognitiveservices.azure.com/.default');
  return token.token;
}

// Better: Cache token until expiry
let cachedToken = null;
let tokenExpiry = 0;
azureADTokenProvider: async () => {
  const now = Date.now();
  if (!cachedToken || now >= tokenExpiry) {
    const token = await credential.getToken('https://cognitiveservices.azure.com/.default');
    cachedToken = token.token;
    tokenExpiry = token.expiresOnTimestamp - 60000; // Refresh 1 min before expiry
  }
  return cachedToken;
}
```

### 3. Container Resources
**Current allocation**:
- Backend: 1.0 CPU, 2Gi memory
- Frontend: 0.5 CPU, 1Gi memory

**How to diagnose**:
- Check `[MEMORY]` logs for memory pressure
- Monitor if heap used approaches heap total
- Look for garbage collection pauses in logs
- Check Azure Container Apps metrics for CPU throttling

**Symptoms of under-resourcing**:
- Memory approaching limit (heap used > 80% of heap total)
- High external memory usage
- Slow response times during high memory usage

### 4. Network Latency
**Geography**:
- Container Apps: Sweden Central
- Speech Service: Sweden Central (good)
- OpenAI: Unknown region (check logs)
- Cosmos DB: Unknown region (check logs)
- Storage: Unknown region (check logs)

**How to diagnose**:
- Compare `[PERF]` durations between endpoints
- Check if external API calls dominate request time
- Use Azure Monitor to check inter-service latency

### 5. Next.js Build Size
**Potential issue**: Large JavaScript bundles slow initial page load

**How to diagnose**:
- Check browser DevTools Network tab for bundle sizes
- Look for large vendor chunks
- Measure Time to Interactive (TTI)

**Current build** (from logs):
```
Route (app)                              Size     First Load JS
┌ ○ /                                    101 kB   185 kB
└ ○ /_not-found                          882 B    85 kB
+ First Load JS shared by all            84.1 kB
```
This is actually quite reasonable (185KB total for main page).

### 6. CORS Preflight Requests
**Potential issue**: OPTIONS requests adding latency

**How to diagnose**:
- Check browser DevTools Network tab for OPTIONS requests
- Measure time spent on preflight vs actual request
- Check if credentials are needed for all requests

## Recommended Monitoring Strategy

### 1. Collect Baseline Metrics
After deploying v23/v18, perform these tests and record metrics:

**Test 1: Cold Start**
- Stop all container replicas
- Load page and measure:
  - Time to see page content
  - Time to select language
  - Time to start recording
  - Time to receive first token
- Check backend logs for `[STARTUP]` total time

**Test 2: Warm Start**
- Refresh page immediately
- Measure same metrics as Test 1
- Should be significantly faster

**Test 3: Token Acquisition**
- Click "Start Recording" button
- Measure time until microphone activates
- Check frontend console for `[PERF]` logs showing breakdown
- Check backend logs for `/api/getSpeechToken` duration

**Test 4: Memory Baseline**
- Let app run idle for 5 minutes
- Check periodic `[MEMORY]` logs
- Record baseline memory usage

**Test 5: Under Load**
- Perform several transcriptions in succession
- Monitor memory growth
- Check for memory leaks (continuously growing heap usage)

### 2. Analyze Log Patterns

Look for these red flags:
- `[STARTUP]` > 5 seconds: Slow initialization
- `[AUTH]` > 2 seconds: Token acquisition issues
- Token fetch > 2 seconds: Network latency to Speech Service
- Memory continuously growing: Possible leak
- Heap used > 80% of heap total: Memory pressure

### 3. Azure Monitor Integration

To get deeper insights, enable Azure Monitor:
```bash
# Application Insights for Container Apps
az containerapp logs show --name aca-triage-backend --resource-group rg-ailz-lab --follow

# View live metrics
az monitor app-insights component show --app <app-insights-name> --resource-group rg-ailz-lab
```

## Quick Wins (Not Implemented Yet - Logging Only)

### 1. Token Caching
Cache Azure AD tokens for OpenAI/Cosmos/Storage to avoid repeated auth calls.

### 2. Speech Token Caching
Cache Speech Service token in frontend (valid for 10 minutes).

### 3. Connection Pooling
Ensure Azure SDK clients reuse connections (should be default).

### 4. Increase Container Resources
If memory pressure detected, increase from 2Gi to 4Gi.

### 5. Add CDN
Serve static frontend assets through Azure CDN if network latency is issue.

### 6. Enable HTTP/2
Ensure Container Apps ingress uses HTTP/2 for multiplexing.

## Next Steps

1. **Deploy v23/v18** with logging
2. **Collect baseline metrics** using tests above
3. **Analyze logs** to identify bottleneck
4. **Implement targeted optimization** based on data
5. **Re-measure** to confirm improvement

## Log Examples to Look For

**Good performance**:
```
[STARTUP] Total startup time: 1200ms
[PERF] GET /api/getSpeechToken - 200 - 450ms - Memory: 45MB/120MB
[PERF] Recognition started successfully, total time: 650ms
```

**Performance issues**:
```
[STARTUP] Total startup time: 8500ms  ← SLOW STARTUP
[AUTH] OpenAI token acquired in 3200ms  ← SLOW TOKEN
[PERF] GET /api/getSpeechToken - 200 - 9800ms  ← SLOW TOKEN EXCHANGE
[MEMORY] Heap: 1850MB/2000MB  ← MEMORY PRESSURE
```
