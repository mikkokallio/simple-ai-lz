# Content Understanding Implementation

## Overview

Successfully implemented Azure AI Foundry Content Understanding service into the OCR-translation-app. This replaces the old Form Recognizer stub with the new Content Understanding API.

## Implementation Date
November 13, 2025

## Changes Made

### 1. Backend Configuration (`backend/.env.example`)
- Added `FOUNDRY_ENDPOINT` - Azure AI Foundry endpoint URL
- Added `FOUNDRY_API_KEY` - API key for Content Understanding service

### 2. Backend Helper Functions (`backend/src/server.ts`)

#### New Helper Functions:
1. **`submitContentUnderstandingJob(fileUrl, analyzerId)`**
   - Submits document to Content Understanding API
   - Uses analyzer ID (default: `prebuilt-documentAnalyzer`)
   - Returns operation location URL for polling
   - Uses managed identity via API key authentication

2. **`pollContentUnderstandingResult(operationLocation, maxWaitSeconds, pollIntervalSeconds)`**
   - Polls the operation URL until completion
   - Default: 120 seconds timeout, 10-second intervals
   - Returns full Content Understanding result
   - Handles success, failure, and timeout scenarios

3. **`uploadTempBlobForContentUnderstanding(fileBuffer, filename, mimeType)`**
   - Uploads file to `content-understanding-temp` container
   - Returns blob URL for Content Understanding to access
   - Uses managed identity (no SAS tokens required)

#### Updated Endpoints:

**`POST /api/workspace/:documentId/process` (mode: 'ocr-cu')**
- Replaced old Form Recognizer implementation
- New flow:
  1. Upload file to temp blob
  2. Submit Content Understanding job
  3. Poll for results (120s timeout, 10s intervals)
  4. Extract markdown and page data
  5. Save both `result.json` and `result.md` to workspace

**`POST /api/ocr/content-understanding`**
- Replaced 501 stub with full implementation
- Accepts file upload + optional `analyzerId`
- Processes document through Content Understanding
- Saves to workspace if `documentId` provided
- Returns structured result with markdown, pages, and full result

### 3. Frontend Updates (`frontend/src/main.tsx`)

#### Updated Interfaces:
```typescript
interface ProcessedResult {
  // ... existing fields ...
  markdown?: string
  pages?: Array<{
    lines: Array<{
      content: string
      source: string  // Bounding box polygon coordinates
      spans?: Array<{ offset: number; length: number }>
    }>
    words?: Array<{...}>
  }>
  fullResult?: any
}
```

#### New Features:

**Content Understanding Viewer Modal**
- Three view modes:
  1. **📝 Markdown View** - Clean rendered markdown from Content Understanding
  2. **{} JSON View** - Full structured JSON result with all metadata
  3. **📐 Bounding Boxes View** - Page-by-page display of detected lines with:
     - Line text content
     - Bounding box coordinates (polygon format)
     - Organized by page

**Enhanced Results Display**
- Content Understanding results now clickable in Results tab
- Automatically opens specialized viewer when `mode === 'ocr-cu'`
- Falls back to simple text display for other OCR modes

## Content Understanding Result Structure

### API Response Format:
```json
{
  "status": "Succeeded",
  "result": {
    "contents": [{
      "markdown": "# Document Title\n\nExtracted content...",
      "pages": [{
        "lines": [{
          "content": "Text content of the line",
          "source": "POLYGON(x1 y1, x2 y2, x3 y3, x4 y4)",
          "spans": [{ "offset": 0, "length": 25 }]
        }],
        "words": [{
          "content": "word",
          "source": "POLYGON(...)",
          "confidence": 0.98
        }]
      }]
    }]
  }
}
```

### Saved Files in Workspace:
```
workspace/
  {userId}/
    {documentId}/
      results/
        ocr-cu/
          result.json     # Full structured result
          result.md       # Extracted markdown for easy viewing
```

## Usage Instructions

### Backend Configuration

1. Set environment variables in Container App or `.env`:
```bash
FOUNDRY_ENDPOINT=https://your-foundry-instance.cognitiveservices.azure.com
FOUNDRY_API_KEY=your-api-key
```

2. Ensure storage account has:
   - `workspace` container (existing)
   - `content-understanding-temp` container (auto-created)

3. Configure managed identity with:
   - Storage Blob Data Contributor role
   - Cognitive Services User role (if using managed identity auth)

### Frontend Usage

1. Upload document to workspace
2. Select document(s)
3. Choose "📄 OCR: Content Understanding (Extracts entities)" from dropdown
4. Click "Process Selected"
5. After processing, go to "Results" tab
6. Click on the Content Understanding result
7. Use tabs to switch between Markdown, JSON, and Bounding Boxes views

### API Usage

**Direct endpoint:**
```bash
curl -X POST http://backend:3000/api/ocr/content-understanding \
  -F "file=@document.pdf" \
  -F "analyzerId=prebuilt-documentAnalyzer"
```

**Workspace-integrated:**
```bash
curl -X POST http://backend:3000/api/workspace/{documentId}/process \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "ocr-cu",
    "analyzerId": "prebuilt-documentAnalyzer",
    "outputFormat": "json"
  }'
```

## Key Features

### Managed Identity Support
- No SAS tokens required
- Uses DefaultAzureCredential for blob access
- API key authentication for Content Understanding service
- Secure, enterprise-ready architecture

### Polling Strategy
- Configurable timeout (default: 120 seconds)
- Configurable poll interval (default: 10 seconds)
- Optimized for 1-page documents (typically completes in 10-15 seconds)
- Handles long-running jobs gracefully

### Result Storage
- Dual format: JSON + Markdown
- Structured data for programmatic access
- Human-readable markdown for quick viewing
- Full result preserved for future analysis

### Frontend Visualization
- Markdown view for content review
- JSON view for developers/debugging
- Bounding boxes view for spatial analysis
- Organized by pages and lines

## Differences from Old Implementation

### Old (Form Recognizer):
- ❌ Used deprecated Form Recognizer API
- ❌ Required base64 encoding
- ❌ Limited to layout analysis
- ❌ Simple text extraction only

### New (Content Understanding):
- ✅ Uses latest Azure AI Foundry Content Understanding
- ✅ Blob URL-based (more efficient for large files)
- ✅ Advanced document understanding
- ✅ Rich structured output with markdown
- ✅ Configurable analyzers
- ✅ Better entity extraction
- ✅ Comprehensive visualization options

## Testing Checklist

- [ ] Backend can reach FOUNDRY_ENDPOINT
- [ ] API key is valid and has necessary permissions
- [ ] Temp blob container created successfully
- [ ] File upload to temp blob works
- [ ] Content Understanding job submission succeeds
- [ ] Polling completes within timeout
- [ ] Results saved to workspace (both .json and .md)
- [ ] Results appear in Results tab
- [ ] Clicking result opens viewer modal
- [ ] All three view modes (Markdown, JSON, Bounding Boxes) work
- [ ] Bounding box coordinates display correctly
- [ ] Error handling works (timeout, API errors, etc.)

## Known Limitations

1. **File Size**: Limited by Content Understanding API limits (typically 500MB)
2. **File Types**: Supports images and PDFs (depends on analyzer)
3. **Polling Timeout**: Max 2 minutes - increase for very large documents
4. **Temp Storage**: Files left in temp container (consider cleanup job)
5. **Bounding Box Visualization**: Text-only display, no image overlay yet

## Future Enhancements

1. **Image Overlay**: Draw bounding boxes on actual document image
2. **Temp File Cleanup**: Background job to clean old temp blobs
3. **Progress Indicator**: Real-time progress during polling
4. **Analyzer Selection**: UI dropdown for different analyzers
5. **Result Caching**: Avoid re-processing same document
6. **Export Options**: Download markdown/JSON separately
7. **Comparison View**: Side-by-side original vs. analyzed

## Troubleshooting

### "Content Understanding not configured" Error
- Check `FOUNDRY_ENDPOINT` and `FOUNDRY_API_KEY` environment variables
- Verify endpoint URL format: `https://your-instance.cognitiveservices.azure.com`
- Ensure API key is valid and not expired

### "Operation-Location header not found" Error
- Check API version in URL (currently `2025-05-01-preview`)
- Verify endpoint URL is correct
- Check API key permissions

### "Timed out after 120 seconds" Error
- Increase `maxWaitSeconds` parameter (default: 120)
- Check document size (very large files take longer)
- Verify Content Understanding service is responsive

### Polling Never Completes
- Check Content Understanding service status
- Verify blob URL is accessible to the service
- Check network connectivity from service to blob storage

### Results Not Appearing in UI
- Check browser console for errors
- Verify `/api/workspace/{documentId}/results` returns data
- Check that `result.json` was saved to blob storage
- Ensure userId matches between upload and retrieval

## References

- [Azure AI Foundry Content Understanding Documentation](https://learn.microsoft.com/azure/ai-services/content-understanding/)
- [Content Understanding API Reference](https://learn.microsoft.com/azure/ai-services/content-understanding/reference)
- Original notebook: `content_understanding_translate.ipynb`
