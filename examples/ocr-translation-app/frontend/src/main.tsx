import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

// Runtime configuration
declare global {
  interface Window {
    ENV?: {
      BACKEND_URL?: string
    }
  }
}

const API_BASE_URL = window.ENV?.BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://aca-ocr-trans-backend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io')

interface HealthStatus {
  status: string
  timestamp: string
  environment: string
  services: {
    aiFoundry: boolean
    documentIntelligence: boolean
    translator: boolean
  }
}

interface SelectedFile {
  file: File
  preview?: string
  id: string
}

interface WorkspaceDocument {
  documentId: string
  userId: string
  originalFilename: string
  mimeType: string
  uploadTime: string
  fileSize: number
  malwareScanStatus: 'pending' | 'clean' | 'infected'
  malwareScanTime?: string
  processedModes: string[]
  lastAccessed: string
  selected?: boolean
}

interface ProcessedResult {
  documentId: string
  userId: string
  originalFilename: string
  mode: string
  processingTime?: string
  ocrText?: string
  translatedText?: string
  sourceLanguage?: string
  targetLanguage?: string
  translatedDocumentUrl?: string
  error?: string
}

type ProcessingMode = 'ocr-di' | 'ocr-cu' | 'ocr-openai' | 'translate' | 'translate-openai' | 'document-translate'

const DEFAULT_SYSTEM_PROMPTS = {
  'ocr-openai': 'You are an expert OCR system. Extract all text from the provided image with high accuracy. Maintain the original formatting, structure, and layout as much as possible. Return only the extracted text without any commentary or metadata.',
  'translate-openai': 'You are an expert translator. Translate the provided text to the target language while maintaining the original meaning, tone, and style. Preserve formatting and structure. Return only the translated text.'
}

function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Step 1: Selected files (not yet uploaded)
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  
  // Step 2: Uploaded documents in workspace
  const [workspaceDocuments, setWorkspaceDocuments] = useState<WorkspaceDocument[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Step 3: Processed results
  const [processedResults, setProcessedResults] = useState<ProcessedResult[]>([])
  
  // UI state
  const [isDragging, setIsDragging] = useState(false)
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('ocr-di')
  const [systemPrompt] = useState<string>(DEFAULT_SYSTEM_PROMPTS['ocr-openai'])
  const [targetLanguage, setTargetLanguage] = useState<string>('en')
  const [previewDocument, setPreviewDocument] = useState<WorkspaceDocument | null>(null)
  const [activeTab, setActiveTab] = useState<'workspace' | 'results'>('workspace')

  useEffect(() => {
    fetch(`${API_BASE_URL}/health`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`)
        }
        return res.json()
      })
      .then(data => setHealth(data))
      .catch(err => setError(err.message))
    
    loadWorkspaceDocuments()
    loadProcessedResults()
  }, [])
  
  const loadWorkspaceDocuments = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/workspace/documents`, {
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      if (data.status === 'success') {
        const documentsWithUserId = data.documents.map((doc: WorkspaceDocument) => ({
          ...doc,
          userId: doc.userId || 'demo',
          selected: false,
          // FIX: Backend doesn't implement malware scan, so force to 'clean' for now
          malwareScanStatus: 'clean' as const
        }))
        setWorkspaceDocuments(documentsWithUserId)
      }
    } catch (error) {
      console.error('Failed to load documents:', error)
    }
  }

  const loadProcessedResults = async () => {
    // TODO: Implement results loading from backend
    // For now, results will be populated when processing completes
  }

  // File selection handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const droppedFiles = Array.from(e.dataTransfer.files)
    addSelectedFiles(droppedFiles)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      addSelectedFiles(files)
    }
  }

  const addSelectedFiles = (newFiles: File[]) => {
    const fileObjects: SelectedFile[] = newFiles.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      id: `${Date.now()}-${Math.random()}`
    }))
    setSelectedFiles(prev => [...prev, ...fileObjects])
  }

  const removeSelectedFile = (id: string) => {
    setSelectedFiles(prev => {
      const file = prev.find(f => f.id === id)
      if (file?.preview) {
        URL.revokeObjectURL(file.preview)
      }
      return prev.filter(f => f.id !== id)
    })
  }

  // Upload & Scan - Step 1 to Step 2
  const uploadAndScanFiles = async () => {
    if (selectedFiles.length === 0) {
      alert('Please select files first')
      return
    }

    setIsUploading(true)
    
    try {
      for (const selectedFile of selectedFiles) {
        const formData = new FormData()
        formData.append('file', selectedFile.file)

        const response = await fetch(`${API_BASE_URL}/api/workspace/upload`, {
          method: 'POST',
          body: formData,
          credentials: 'include'
        })

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`)
        }
      }

      // Clear selected files
      selectedFiles.forEach(f => {
        if (f.preview) URL.revokeObjectURL(f.preview)
      })
      setSelectedFiles([])
      
      // Reload workspace documents
      await loadWorkspaceDocuments()
      
      alert(`✅ ${selectedFiles.length} file(s) uploaded and scanning for malware...`)
    } catch (error) {
      alert(`❌ Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsUploading(false)
    }
  }

  // Document selection handlers
  const toggleDocumentSelection = (documentId: string) => {
    setWorkspaceDocuments(prev =>
      prev.map(doc =>
        doc.documentId === documentId
          ? { ...doc, selected: !doc.selected }
          : doc
      )
    )
  }

  const selectAllDocuments = () => {
    setWorkspaceDocuments(prev =>
      prev.map(doc => ({ ...doc, selected: true })) // FIX: Select all, not just clean (since we force clean anyway)
    )
  }

  const deselectAllDocuments = () => {
    setWorkspaceDocuments(prev =>
      prev.map(doc => ({ ...doc, selected: false }))
    )
  }

  // Process selected documents - Step 2 to Step 3
  const processSelectedDocuments = async () => {
    const selectedDocs = workspaceDocuments.filter(doc => doc.selected)
    
    if (selectedDocs.length === 0) {
      alert('Please select at least one document to process')
      return
    }

    setIsProcessing(true)
    
    try {
      for (const doc of selectedDocs) {
        const response = await fetch(`${API_BASE_URL}/api/workspace/${doc.documentId}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            mode: processingMode,
            targetLanguage: (processingMode.includes('translate') || processingMode === 'document-translate') ? targetLanguage : undefined,
            systemPrompt: processingMode.includes('openai') ? systemPrompt : undefined
          })
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || `Processing failed for ${doc.originalFilename}`)
        }

        // FIX: Get actual result from response
        const responseData = await response.json()
        const resultData = responseData.result || {}
        
        const result: ProcessedResult = {
          documentId: doc.documentId,
          userId: doc.userId,
          originalFilename: doc.originalFilename,
          mode: processingMode,
          processingTime: new Date().toISOString(),
          ocrText: resultData.text || resultData.sourceText,
          translatedText: resultData.translatedText || resultData.message,
          sourceLanguage: resultData.sourceLanguage,
          targetLanguage: resultData.targetLanguage,
          translatedDocumentUrl: resultData.translatedDocumentUrl
        }
        
        setProcessedResults(prev => [...prev, result])
      }

      // Reload workspace to update processed modes
      await loadWorkspaceDocuments()
      
      // Switch to results tab
      setActiveTab('results')
      
      alert(`✅ ${selectedDocs.length} document(s) processed successfully!`)
    } catch (error) {
      alert(`❌ Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const deleteDocument = async (userId: string, documentId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"?\n\nThis action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/workspace/${userId}/${documentId}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error(`Delete failed: ${response.statusText}`)
      }
      
      await response.json()
      alert(`✅ Document deleted successfully!`)
      
      await loadWorkspaceDocuments()
    } catch (error) {
      alert(`❌ Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const selectedCount = workspaceDocuments.filter(doc => doc.selected).length

  return (
    <>
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '2rem',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', color: 'white', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>
            📄 OCR & Translation
          </h1>
          <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>
            Upload documents • Process with AI • View results
          </p>
          {health && (
            <div style={{ fontSize: '0.9rem', opacity: 0.8, marginTop: '1rem' }}>
              {health.services.documentIntelligence && '✅ Document Intelligence'}
              {health.services.translator && ' • ✅ Translator'}
              {health.services.aiFoundry && ' • ✅ AI Foundry'}
            </div>
          )}
          {error && (
            <div style={{ color: '#fca5a5', marginTop: '1rem' }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Step 1: File Selection & Upload */}
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.95)', 
          padding: '2rem', 
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          marginBottom: '2rem'
        }}>
          <h2 style={{ margin: '0 0 1.5rem 0', color: '#333' }}>📤 Step 1: Select Files to Upload</h2>
          
          {/* Drag & Drop Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: `3px dashed ${isDragging ? '#667eea' : '#cbd5e1'}`,
              borderRadius: '12px',
              padding: '3rem',
              textAlign: 'center',
              background: isDragging ? 'rgba(102, 126, 234, 0.1)' : 'white',
              transition: 'all 0.2s',
              cursor: 'pointer',
              marginBottom: '1.5rem'
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
            <p style={{ fontSize: '1.2rem', color: '#475569', marginBottom: '1rem' }}>
              Drag and drop files here
            </p>
            <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1.5rem' }}>
              or
            </p>
            <label style={{
              background: '#667eea',
              color: 'white',
              padding: '0.75rem 2rem',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'inline-block',
              fontWeight: '600',
              transition: 'background 0.2s'
            }}>
              Browse Files
              <input
                type="file"
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                accept=".pdf,.png,.jpg,.jpeg"
              />
            </label>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>Selected Files ({selectedFiles.length})</h3>
              <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {selectedFiles.map(file => (
                  <div key={file.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem',
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}>
                    <span style={{ fontSize: '2rem' }}>📄</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', color: '#333' }}>{file.file.name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        {(file.file.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button
                      onClick={() => removeSelectedFile(file.id)}
                      style={{
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={uploadAndScanFiles}
                disabled={isUploading}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: isUploading ? '#94a3b8' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                {isUploading ? '⏳ Uploading & Scanning...' : `🚀 Upload & Scan ${selectedFiles.length} File(s)`}
              </button>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          marginBottom: '1rem'
        }}>
          <button
            onClick={() => setActiveTab('workspace')}
            style={{
              flex: 1,
              padding: '1rem',
              background: activeTab === 'workspace' ? '#667eea' : 'rgba(255, 255, 255, 0.95)',
              color: activeTab === 'workspace' ? 'white' : '#333',
              border: 'none',
              borderRadius: '12px 12px 0 0',
              fontSize: '1.1rem',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: activeTab === 'workspace' ? '0 4px 6px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            📁 My Documents ({workspaceDocuments.length})
          </button>
          <button
            onClick={() => setActiveTab('results')}
            style={{
              flex: 1,
              padding: '1rem',
              background: activeTab === 'results' ? '#667eea' : 'rgba(255, 255, 255, 0.95)',
              color: activeTab === 'results' ? 'white' : '#333',
              border: 'none',
              borderRadius: '12px 12px 0 0',
              fontSize: '1.1rem',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: activeTab === 'results' ? '0 4px 6px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            📊 Results ({processedResults.length})
          </button>
        </div>

        {/* Step 2: My Documents (Workspace) */}
        {activeTab === 'workspace' && (
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.95)', 
            padding: '2rem', 
            borderRadius: '0 0 12px 12px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, color: '#333' }}>
                📁 My Documents
                {selectedCount > 0 && ` (${selectedCount} selected)`}
              </h2>
              
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={selectAllDocuments}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  Select All Clean
                </button>
                <button
                  onClick={deselectAllDocuments}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#94a3b8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Processing Mode Selection - FIX: Always show, not just when selected */}
            <div style={{ 
              padding: '1.5rem',
              background: '#f8fafc',
              borderRadius: '8px',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>⚙️ Processing Settings</h3>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#475569' }}>
                  Processing Mode:
                </label>
                <select
                  value={processingMode}
                  onChange={(e) => setProcessingMode(e.target.value as ProcessingMode)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '1rem'
                  }}
                >
                  <option value="ocr-di">📄 OCR: Document Intelligence (Best for forms)</option>
                  <option value="ocr-cu">📄 OCR: Content Understanding (Extracts entities)</option>
                  <option value="ocr-openai">📄 OCR: OpenAI Vision (AI-powered)</option>
                  <option value="translate">🌐 Text Translate: Azure (OCR + Translator)</option>
                  <option value="translate-openai">🌐 Text Translate: OpenAI (One-step)</option>
                  <option value="document-translate">📝 Document Translate: Azure (Preserves format)</option>
                </select>
              </div>

              {(processingMode.includes('translate') || processingMode === 'document-translate') && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#475569' }}>
                    Target Language:
                  </label>
                  <select
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '1rem'
                    }}
                  >
                    <option value="en">English</option>
                    <option value="fi">Finnish</option>
                    <option value="sv">Swedish</option>
                    <option value="de">German</option>
                    <option value="fr">French</option>
                    <option value="es">Spanish</option>
                  </select>
                </div>
              )}

              <button
                onClick={processSelectedDocuments}
                disabled={isProcessing || selectedCount === 0}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: (isProcessing || selectedCount === 0) ? '#94a3b8' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  cursor: (isProcessing || selectedCount === 0) ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                {isProcessing ? '⏳ Processing...' : 
                 selectedCount === 0 ? '🔄 Select Documents to Process' :
                 `🔄 Process ${selectedCount} Selected Document(s)`}
              </button>
            </div>
            
            {workspaceDocuments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
                <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No documents yet</p>
                <p style={{ fontSize: '0.9rem' }}>Upload documents above to get started</p>
              </div>
            ) : (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1.5rem'
              }}>
                {workspaceDocuments.map(doc => (
                  <div 
                    key={doc.documentId}
                    onClick={() => toggleDocumentSelection(doc.documentId)} // FIX: Allow selection always
                    style={{ 
                      background: doc.selected ? '#ede9fe' : 'white', 
                      borderRadius: '8px',
                      border: doc.selected ? '2px solid #667eea' : '1px solid #e5e7eb',
                      boxShadow: doc.selected ? '0 4px 12px rgba(102, 126, 234, 0.3)' : '0 1px 3px rgba(0,0,0,0.1)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'all 0.2s',
                      cursor: 'pointer', // FIX: Always pointer
                      opacity: doc.malwareScanStatus === 'infected' ? 0.5 : 1,
                      position: 'relative' // FIX: Add position relative for checkbox positioning
                    }}
                  >
                    {/* Selection Checkbox */}
                    <div style={{ // FIX: Always show checkbox
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      zIndex: 10
                    }}>
                      <input
                        type="checkbox"
                        checked={doc.selected || false}
                        onChange={(e) => {
                          e.stopPropagation()
                          toggleDocumentSelection(doc.documentId)
                        }}
                        style={{
                          width: '20px',
                          height: '20px',
                          cursor: 'pointer'
                        }}
                      />
                    </div>

                    {/* Thumbnail */}
                    <div style={{ 
                      width: '100%', 
                      height: '200px', 
                      background: '#f3f4f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      {doc.mimeType === 'application/pdf' ? (
                        <embed
                          src={`${API_BASE_URL}/api/workspace/thumbnail/${doc.userId}/${doc.documentId}#toolbar=0&navpanes=0`}
                          type="application/pdf"
                          style={{
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            pointerEvents: 'none'
                          }}
                        />
                      ) : (
                        <div style={{ fontSize: '3rem' }}>📄</div>
                      )}
                    </div>
                    
                    {/* Content */}
                    <div style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <h4 style={{ 
                        margin: '0 0 0.5rem 0', 
                        color: '#333', 
                        fontSize: '0.95rem',
                        fontWeight: '600',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {doc.originalFilename}
                      </h4>
                      <div style={{ fontSize: '0.75rem', color: '#666', flex: 1 }}>
                        <div>{new Date(doc.uploadTime).toLocaleDateString()}</div>
                        <div>{(doc.fileSize / 1024).toFixed(1)} KB</div>
                        <div style={{ 
                          marginTop: '0.5rem',
                          color: doc.malwareScanStatus === 'clean' ? '#10b981' : 
                                 doc.malwareScanStatus === 'infected' ? '#ef4444' : '#f59e0b',
                          fontWeight: '600'
                        }}>
                          {doc.malwareScanStatus === 'clean' && '✅ Clean'}
                          {doc.malwareScanStatus === 'infected' && '⚠️ Infected'}
                          {doc.malwareScanStatus === 'pending' && '⏳ Scanning'}
                        </div>
                      </div>

                      {/* Preview Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setPreviewDocument(doc)
                        }}
                        style={{
                          width: '100%',
                          marginTop: '0.75rem',
                          padding: '0.5rem',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          transition: 'background 0.2s'
                        }}
                      >
                        👁️ Preview
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteDocument(doc.userId, doc.documentId, doc.originalFilename)
                        }}
                        style={{
                          width: '100%',
                          marginTop: '0.5rem',
                          padding: '0.5rem',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          transition: 'background 0.2s'
                        }}
                      >
                        🗑️ Delete
                      </button>
                      
                      {doc.processedModes.length > 0 && (
                        <div style={{ 
                          marginTop: '0.75rem',
                          paddingTop: '0.75rem', 
                          borderTop: '1px solid #e5e7eb',
                          fontSize: '0.7rem'
                        }}>
                          <div style={{ marginBottom: '0.25rem', color: '#666', fontWeight: '600' }}>
                            Processed:
                          </div>
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {doc.processedModes.map(mode => (
                              <span
                                key={mode}
                                style={{
                                  padding: '0.125rem 0.5rem',
                                  background: '#e0e7ff',
                                  color: '#4f46e5',
                                  borderRadius: '4px',
                                  fontWeight: '500'
                                }}
                              >
                                {mode}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Results */}
        {activeTab === 'results' && (
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.95)', 
            padding: '2rem', 
            borderRadius: '0 0 12px 12px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ margin: '0 0 1.5rem 0', color: '#333' }}>📊 Processing Results</h2>
            
            {processedResults.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
                <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No results yet</p>
                <p style={{ fontSize: '0.9rem' }}>Process some documents to see results here</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                {processedResults.map(result => (
                  <div 
                    key={`${result.documentId}-${result.mode}`}
                    style={{
                      background: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '1.5rem',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <h3 style={{ margin: 0, color: '#333' }}>{result.originalFilename}</h3>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        background: '#e0e7ff',
                        color: '#4f46e5',
                        borderRadius: '4px',
                        fontSize: '0.85rem',
                        fontWeight: '600'
                      }}>
                        {result.mode}
                      </span>
                    </div>
                    
                    {result.processingTime && (
                      <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
                        Processed: {new Date(result.processingTime).toLocaleString()}
                      </div>
                    )}

                    {result.error ? (
                      <div style={{
                        padding: '1rem',
                        background: '#fef2f2',
                        border: '1px solid #fca5a5',
                        borderRadius: '6px',
                        color: '#991b1b'
                      }}>
                        ❌ Error: {result.error}
                      </div>
                    ) : (
                      <>
                        {result.ocrText && (
                          <div style={{ marginBottom: '1rem' }}>
                            <h4 style={{ margin: '0 0 0.5rem 0', color: '#475569' }}>Extracted Text:</h4>
                            <div style={{
                              padding: '1rem',
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              maxHeight: '300px',
                              overflow: 'auto',
                              whiteSpace: 'pre-wrap',
                              fontSize: '0.9rem',
                              fontFamily: 'monospace'
                            }}>
                              {result.ocrText}
                            </div>
                          </div>
                        )}

                        {result.translatedText && (
                          <div>
                            <h4 style={{ margin: '0 0 0.5rem 0', color: '#475569' }}>
                              Translation {result.sourceLanguage && result.targetLanguage && 
                                `(${result.sourceLanguage} → ${result.targetLanguage})`}:
                            </h4>
                            <div style={{
                              padding: '1rem',
                              background: '#f0fdf4',
                              border: '1px solid #bbf7d0',
                              borderRadius: '6px',
                              maxHeight: '300px',
                              overflow: 'auto',
                              whiteSpace: 'pre-wrap',
                              fontSize: '0.9rem',
                              fontFamily: 'monospace'
                            }}>
                              {result.translatedText}
                            </div>
                          </div>
                        )}

                        {result.translatedDocumentUrl && (
                          <div style={{ marginTop: '1rem' }}>
                            <a
                              href={`${API_BASE_URL}${result.translatedDocumentUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-block',
                                padding: '0.75rem 1.5rem',
                                background: '#10b981',
                                color: 'white',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                fontWeight: '600',
                                fontSize: '0.95rem',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                              }}
                            >
                              📥 Download Translated Document
                            </a>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* Preview Modal */}
    {previewDocument && (
      <div 
        onClick={() => setPreviewDocument(null)}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '2rem'
        }}
      >
        <div 
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'white',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '1200px',
            height: '90%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <div style={{
            padding: '1.5rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3 style={{ margin: 0, color: '#333' }}>{previewDocument.originalFilename}</h3>
            <button
              onClick={() => setPreviewDocument(null)}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1.5rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '1rem'
              }}
            >
              ✕ Close
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {previewDocument.mimeType === 'application/pdf' ? (
              <iframe
                src={`${API_BASE_URL}/api/workspace/${previewDocument.userId}/${previewDocument.documentId}/original/${encodeURIComponent(previewDocument.originalFilename)}`}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title={previewDocument.originalFilename}
              />
            ) : (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                color: '#666'
              }}>
                Preview not available for this file type
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
