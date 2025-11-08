# Workspace Architecture

## Current Implementation (v16/v17)

### Storage Structure
```
workspace/
  {userId}/                          # Session-based user ID (later: Entra ID)
    {documentId}/                    # UUID for each document
      metadata.json                  # Document metadata
      original/                      # Original uploaded file
        {original-filename}
      results/                       # Processing results
        ocr/                        # OCR results
          result.json
        translate/                  # Translation results
          translated-{lang}-{filename}.pdf
        analyze/                    # Analysis results
          result.json
```

### Backend API (v15-v16)

#### Workspace Management
- `POST /api/workspace/upload` - Upload document, get documentId
- `GET /api/workspace/documents` - List user's documents
- `GET /api/workspace/:documentId` - Get document metadata  
- `GET /api/workspace/:documentId/result/:mode` - Get processing result
- `POST /api/workspace/:documentId/process` - Reprocess document

#### Processing Endpoints (v16 - with workspace integration)
- `POST /api/ocr/document-intelligence` - OCR with Document Intelligence
  - Accepts `documentId` in body
  - Saves result to workspace if documentId provided
  
- `POST /api/translate` - Translate with Document Translation
  - Accepts `documentId` in body
  - Saves translated PDF to workspace if document Id provided

### Frontend (v16-v17)

#### Document Workflow
1. **Upload** → `/api/workspace/upload` → Get `documentId`
2. **Store** documentId in file state
3. **Process** → Pass `documentId` to processing endpoint
4. **Backend saves** result to workspace automatically
5. **Reload** workspace documents to see `processedModes`

#### State Management
```typescript
interface WorkspaceDocument {
  documentId: string
  originalFilename: string
  mimeType: string
  uploadTime: string
  fileSize: number
  malwareScanStatus: string
  processedModes: string[]  // e.g., ["ocr", "translate"]
  lastAccessed: string
}

interface UploadedFile {
  file: File
  preview?: string
  status: 'pending' | 'uploading' | 'uploaded' | 'processing' | 'completed' | 'error'
  result?: any
  error?: string
  documentId?: string  // Links to workspace
}
```

### Session Management
```typescript
// Backend: express-session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}))

// Assign userId if not exists
app.use((req, res, next) => {
  if (!req.session.userId) {
    req.session.userId = uuidv4()
  }
  next()
})

// Frontend: Include credentials in all workspace API calls
fetch(url, {
  credentials: 'include'  // Send session cookie
})
```

## Data Flow Diagrams

### Upload Flow
```
User                    Frontend                Backend                Storage
 |                         |                       |                      |
 |--- Select File -------->|                       |                      |
 |                         |                       |                      |
 |                         |--- POST /workspace -->|                      |
 |                         |    /upload            |                      |
 |                         |                       |--- Save original --->|
 |                         |                       |    & metadata        |
 |                         |<-- documentId --------|                      |
 |                         |    metadata           |                      |
 |<-- Document in lib -----|                       |                      |
 |    (with documentId)    |                       |                      |
```

### Process Flow (v16/v17)
```
User                    Frontend                Backend                Storage
 |                         |                       |                      |
 |--- Click Process ------>|                       |                      |
 |    (from library)       |                       |                      |
 |                         |                       |                      |
 |                         |--- POST /ocr -------->|                      |
 |                         |    + file             |--- Process --------->|
 |                         |    + documentId       |                      |
 |                         |                       |<-- OCR result ------|
 |                         |                       |                      |
 |                         |                       |--- Save result ----->|
 |                         |                       |    workspace/        |
 |                         |                       |    {userId}/{docId}/ |
 |                         |                       |    results/ocr/      |
 |                         |<-- Result ------------|                      |
 |                         |                       |                      |
 |                         |--- GET /workspace --->|                      |
 |                         |    /documents         |--- List docs ------->|
 |                         |<-- Updated list ------|<-- with processed ---|
 |                         |    (processedModes    |    Modes             |
 |                         |     = ["ocr"])        |                      |
 |<-- See processed doc ---|                       |                      |
```

### Current vs Future Flow

#### Current (v15-v17)
- Upload → Workspace (persisted) ✅
- Process → Memory only (lost on refresh) ❌
- Results → Not visible after processing ❌

#### Fixed (v16-v17)
- Upload → Workspace (persisted) ✅
- Process → Workspace (persisted) ✅
- Results → Saved to workspace ✅
- Need: Results tab to view them ⏳

## Known Limitations (To Fix)

### 1. Session-Based User ID
- **Current**: Uses `express-session` with random UUID
- **Problem**: Different browsers = different userId
- **Solution**: Implement Entra ID authentication

### 2. No Results Viewing
- **Current**: Results saved to workspace but not displayed
- **Problem**: Can't see what was processed
- **Solution**: Build Results tab (next phase)

### 3. No Document Preview
- **Current**: Only filename shown
- **Problem**: Can't verify which document before processing
- **Solution**: Add thumbnail/preview modal

### 4. No Reprocess from Library
- **Current**: Must re-upload to process again
- **Problem**: Duplicate documents, wasted storage
- **Solution**: Add "Process" button in document library

### 5. Malware Scan Always "Pending"
- **Current**: Hardcoded to "pending"
- **Problem**: Security risk not addressed
- **Solution**: Integrate Microsoft Defender for Storage

## Security Considerations

### Current
- Session cookies (HTTP-only would be better)
- No authentication (anyone with cookie can access)
- Blob storage private (good)
- No malware scanning (risky)

### Planned
- Entra ID authentication (user identity)
- RBAC on workspace blobs (user isolation)
- Microsoft Defender for Storage (malware detection)
- HTTPS-only cookies
- Content Security Policy

## Performance Considerations

### Current Bottlenecks
1. **Large file uploads**: No chunking, may timeout
2. **List all documents**: Gets slower with many docs
3. **No pagination**: Frontend loads all documents
4. **No caching**: Every page load fetches metadata

### Future Optimizations
1. **Chunk uploads**: Handle large PDFs (>100MB)
2. **Pagination**: Load 20 documents at a time
3. **Caching**: Cache metadata for 5 minutes
4. **Thumbnails**: Pre-generate, serve from CDN
5. **Lazy loading**: Load preview only when clicked

## Deployment Status

| Component | Version | Status | Notes |
|-----------|---------|--------|-------|
| Backend | v15 | ✅ Deployed | Workspace API |
| Backend | v16 | ⏳ Building | Result persistence |
| Frontend | v16 | ✅ Deployed | Workspace integration |
| Frontend | v17 | ✅ Deployed | documentId in requests |
| Storage | - | ✅ Running | Workspace container created |

## Next Steps

1. ✅ Deploy backend v16 (in progress)
2. ✅ Test result persistence
3. ⏳ Build Results tab
4. ⏳ Add document preview
5. ⏳ Implement tool selector
6. ⏳ Entra ID authentication
