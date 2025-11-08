# UI Redesign Plan: Workspace-First Flow

## Current Problems
1. Documents don't persist visibly
2. Upload and processing are tightly coupled
3. No way to see previous results
4. No document preview/thumbnail
5. Can't reprocess existing documents

## New UI Architecture

### Two-Tab Layout

#### Tab 1: **My Documents** (Document Library)
- **Upload Area** (top)
  - Drag & drop or click to upload
  - Shows upload progress
  - Files immediately appear in library below after upload
  
- **Document Library** (main area)
  - Grid or list view of uploaded documents
  - Each document shows:
    - **Thumbnail/Icon**: PDF icon or actual thumbnail preview
    - **Filename**: Original filename
    - **Upload Time**: When uploaded
    - **File Size**: KB/MB
    - **Malware Status**: Clean/Pending/Infected (color-coded)
    - **Actions**:
      - 👁️ Preview (popup with fade background)
      - 🔧 Process (opens tool selector)
      - 📥 Download original
      - 🗑️ Delete
  
- **Preview Modal** (on click)
  - Full document preview
  - PDF viewer or image display
  - Background fades to 80% dark
  - Close button
  - Download button
  
- **Process Tool Selector** (on "Process" click)
  - Modal or slide-in panel
  - Shows available tools:
    - Document Intelligence OCR
    - Azure AI Language (Key Phrases)
    - OpenAI Vision OCR
    - Azure Translator
    - OpenAI Translation
  - For translation: language selector
  - For OpenAI: custom prompt
  - **Start Processing** button
  - Processing creates result in Tab 2

#### Tab 2: **Results** (Processing Results)
- **Results Library** (main area)
  - Grid or list view of all processing results
  - **Sort**: Recent on top (by processing time)
  - Each result shows:
    - **Result Type Icon**: OCR/Translate/Analyze
    - **Source Document**: Link to original in Tab 1
    - **Processing Time**: When processed
    - **Tool Used**: "Document Intelligence", "Azure Translator", etc.
    - **Status**: Success/Failed (color-coded)
    - **Preview/Content**: First few lines or thumbnail
    - **Actions**:
      - 👁️ View Full Result
      - 📥 Download Result
      - 🔄 Reprocess (go back to Tab 1, select tool)
      - 🗑️ Delete Result
  
- **Result Viewer Modal** (on "View" click)
  - For OCR: Extracted text, formatted nicely
  - For Translation: Translated document preview
  - For Analysis: Key phrases, insights
  - Side-by-side view option (original | result)
  - Background fade
  - Download button
  - Close button

## Data Flow

### Upload Flow
1. User uploads file in Tab 1
2. File → `/api/workspace/upload` → Get documentId
3. Document appears in library immediately
4. Upload time = now

### Processing Flow
1. User clicks "Process" on document in Tab 1
2. Tool selector modal appears
3. User selects tool + options (language, prompt)
4. Frontend calls processing endpoint with:
   - `documentId` (from library)
   - Selected tool/options
5. Backend:
   - Gets original file from workspace
   - Processes with selected tool
   - Saves result to `workspace/{userId}/{documentId}/results/{mode}/`
   - Updates metadata with `processedModes`
6. Frontend:
   - Shows "Processing..." indicator
   - Polls or waits for completion
   - Switches to Tab 2 to show result
7. Result appears in Tab 2 with:
   - Processing time = now
   - Link to source document

### Reprocess Flow
1. User clicks "Reprocess" on result in Tab 2
2. Switches to Tab 1, highlights source document
3. Opens tool selector
4. User picks different tool
5. Creates new result (same flow as above)

## Visual Design

### Colors & Icons
- **Document Icon**: 📄 (default for no thumbnail)
- **OCR Result**: 📝 (text document)
- **Translation**: 🌐 (globe)
- **Analysis**: 🔍 (magnifying glass)
- **Success**: Green (#10b981)
- **Error**: Red (#ef4444)
- **Processing**: Orange (#f59e0b)
- **Pending**: Gray (#6b7280)

### Layout
- **Tab Buttons**: Top center, large, clear active state
- **Document Cards**: Grid layout, 3-4 columns on desktop
- **Result Cards**: List layout, newest on top
- **Modals**: Centered, max-width 80vw, backdrop blur + fade

### Responsive
- Desktop: Multi-column grid
- Tablet: 2 columns
- Mobile: Single column, stack cards

## API Requirements

### New Endpoints Needed
1. **GET /api/workspace/:documentId/original** - Download original file
2. **GET /api/workspace/:documentId/thumbnail** - Get thumbnail image
3. **DELETE /api/workspace/:documentId** - Delete document
4. **DELETE /api/workspace/:documentId/result/:mode** - Delete result
5. **GET /api/workspace/results** - List all results across all documents
6. **POST /api/workspace/:documentId/reprocess** - Already exists!

### Enhanced Existing Endpoints
- **GET /api/workspace/documents** - Add thumbnail URL to response
- **GET /api/workspace/:documentId** - Add result summaries

## Implementation Phases

### Phase 1: Backend Result Saving ✅
- [x] Save OCR results to workspace
- [x] Save translation results to workspace
- [x] Update metadata with processedModes

### Phase 2: Frontend documentId Tracking ✅
- [x] Pass documentId to processing endpoints
- [x] Store documentId in file state

### Phase 3: Results Tab (Next)
- [ ] Create Results interface
- [ ] Fetch results from workspace
- [ ] Display results in grid
- [ ] Result viewer modal
- [ ] Download result functionality

### Phase 4: Enhanced Document Library
- [ ] Add thumbnail/icon display
- [ ] Add preview modal
- [ ] Add process button with tool selector
- [ ] Add delete functionality

### Phase 5: Polish
- [ ] Side-by-side comparison view
- [ ] Search/filter documents
- [ ] Search/filter results
- [ ] Sort options
- [ ] Animations & transitions

## Testing Checklist

### Upload & Persist
- [ ] Upload PDF → appears in library
- [ ] Refresh page → document still there
- [ ] Upload multiple → all appear

### Process & View
- [ ] Process with OCR → result in Tab 2
- [ ] Process with Translate → result in Tab 2
- [ ] View result → shows content
- [ ] Download result → gets file

### Reprocess
- [ ] Click reprocess → switches to Tab 1
- [ ] Pick different tool → new result appears
- [ ] Both results exist in Tab 2

### Delete
- [ ] Delete document → removes from library
- [ ] Delete result → removes from Tab 2
- [ ] Delete document with results → also removes results

## Future Enhancements
- Entra ID authentication (filter by real user)
- Document tagging/categories
- Batch processing (select multiple, process all)
- Export results as ZIP
- Share documents with other users
- Version history for reprocessed documents
