import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { DocumentTable } from './components/DocumentTable'
import { MessageModal } from './components/MessageModal'
import { ConfirmModal } from './components/ConfirmModal'
import { BoundingBoxViewer } from './components/BoundingBoxViewer'

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
  service?: string
  error?: string
  // Document Intelligence specific fields
  text?: string
  model?: string
  pageCount?: number
  // Content Understanding specific fields
  markdown?: string
  pages?: Array<{
    pageNumber?: number
    width?: number
    height?: number
    angle?: number
    unit?: string
    lines?: Array<{
      content: string
      source?: string
      polygon?: any
      spans?: Array<{ offset: number; length: number }>
    }>
    words?: Array<{
      content: string
      source?: string
      polygon?: any
      confidence?: number
      spans?: Array<{ offset: number; length: number }>
    }>
  }>
  fullResult?: any
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
  
  // PDF Preview state
  const [pdfPreview, setPdfPreview] = useState<{
    isOpen: boolean
    jobId: string | null
    filename: string | null
    blobUrl: string | null
  }>({
    isOpen: false,
    jobId: null,
    filename: null,
    blobUrl: null
  })
  
  // Modal state
  const [messageModal, setMessageModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    type: 'info' | 'success' | 'error' | 'warning'
  }>({ isOpen: false, title: '', message: '', type: 'info' })
  
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })
  
  // Content Understanding viewer state
  const [cuViewerModal, setCuViewerModal] = useState<{
    isOpen: boolean
    result: ProcessedResult | null
    viewMode: 'markdown' | 'json' | 'bounding-boxes'
    documentId: string | null
    userId: string | null
  }>({ isOpen: false, result: null, viewMode: 'markdown', documentId: null, userId: null })
  
  // Document Intelligence viewer state
  const [diViewerModal, setDiViewerModal] = useState<{
    isOpen: boolean
    result: ProcessedResult | null
    viewMode: 'text' | 'pages' | 'json' | 'bounding-boxes'
    documentId: string | null
    userId: string | null
  }>({ isOpen: false, result: null, viewMode: 'text', documentId: null, userId: null })
  
  // UI state
  const [isDragging, setIsDragging] = useState(false)
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('ocr-di')
  const [systemPrompt] = useState<string>(DEFAULT_SYSTEM_PROMPTS['ocr-openai'])
  const [targetLanguage, setTargetLanguage] = useState<string>('en')
  const [previewDocument, setPreviewDocument] = useState<WorkspaceDocument | null>(null)
  const [activeTab, setActiveTab] = useState<'upload' | 'workspace' | 'results'>('upload')
  const [flashingTab, setFlashingTab] = useState<string | null>(null)

  // Helper functions for modals
  const showMessage = (title: string, message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setMessageModal({ isOpen: true, title, message, type })
  }

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm })
  }

  const showContentUnderstandingResult = (result: ProcessedResult, documentId: string, userId: string) => {
    setCuViewerModal({ isOpen: true, result, viewMode: 'markdown', documentId, userId })
  }

  const showDocumentIntelligenceResult = (result: ProcessedResult, documentId: string, userId: string) => {
    setDiViewerModal({ isOpen: true, result, viewMode: 'text', documentId, userId })
  }

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
          malwareScanStatus: 'clean' as const
        }))
        setWorkspaceDocuments(documentsWithUserId)
        
        // Load results after documents are loaded
        loadProcessedResultsForDocuments(documentsWithUserId)
      }
    } catch (error) {
      console.error('Failed to load documents:', error)
    }
  }

  const loadProcessedResultsForDocuments = async (documents: WorkspaceDocument[]) => {
    try {
      console.log('[LOAD_RESULTS] Loading results for', documents.length, 'documents')
      // Load results for all documents
      const allResults: ProcessedResult[] = []
      
      for (const doc of documents) {
        try {
          console.log('[LOAD_RESULTS] Fetching results for document:', doc.documentId)
          const response = await fetch(`${API_BASE_URL}/api/workspace/${doc.documentId}/results`, {
            credentials: 'include'
          })
          
          console.log('[LOAD_RESULTS] Response status:', response.status, 'for document:', doc.documentId)
          
          if (!response.ok) {
            console.log('[LOAD_RESULTS] Response not OK for', doc.documentId)
            continue
          }
          
          const data = await response.json()
          console.log('[LOAD_RESULTS] Results data for', doc.documentId, ':', data)
          
          if (data.status === 'success' && data.results) {
            console.log('[LOAD_RESULTS] Found', data.results.length, 'results for', doc.documentId)
            // Convert stored results to ProcessedResult format
            for (const storedResult of data.results) {
              console.log('[LOAD_RESULTS] Fetching result content for mode:', storedResult.mode)
              // Fetch the actual result content
              const resultResponse = await fetch(`${API_BASE_URL}/api/workspace/${doc.documentId}/results/${storedResult.mode}`, {
                credentials: 'include'
              })
              
              if (resultResponse.ok) {
                const resultData = await resultResponse.json()
                console.log('[LOAD_RESULTS] Result data:', resultData)
                if (resultData.status === 'success' && resultData.result) {
                  const result = resultData.result
                  console.log('[LOAD_RESULTS] Processing result for mode:', storedResult.mode)
                  console.log('[LOAD_RESULTS] Result has markdown:', !!result.markdown)
                  console.log('[LOAD_RESULTS] Result has pages:', !!result.pages)
                  allResults.push({
                    documentId: doc.documentId,
                    userId: doc.userId,
                    originalFilename: doc.originalFilename,
                    mode: storedResult.mode as ProcessingMode,
                    processingTime: storedResult.lastModified || new Date().toISOString(),
                    ocrText: result.text || result.sourceText,
                    translatedText: result.translatedText || result.message,
                    sourceLanguage: result.sourceLanguage,
                    targetLanguage: result.targetLanguage,
                    translatedDocumentUrl: result.translatedDocumentUrl,
                    service: result.service,
                    error: result.error,
                    // Content Understanding fields
                    markdown: result.markdown,
                    pages: result.pages,
                    fullResult: result.fullResult
                  })
                  console.log('[LOAD_RESULTS] Added result to allResults, total now:', allResults.length)
                }
              }
            }
          }
        } catch (err) {
          console.error(`Failed to load results for ${doc.documentId}:`, err)
        }
      }
      
      console.log('[LOAD_RESULTS] Total results loaded:', allResults.length)
      console.log('[LOAD_RESULTS] Setting processedResults state with:', allResults)
      setProcessedResults(allResults)
      console.log('[LOAD_RESULTS] State update called')
    } catch (error) {
      console.error('Failed to load processed results:', error)
    }
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
      showMessage('No Files Selected', 'Please select files to upload first.', 'warning')
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
      
      // Switch to workspace tab with flash effect
      setActiveTab('workspace')
      setFlashingTab('workspace')
      setTimeout(() => setFlashingTab(null), 1000) // Flash for 1 second
      
      showMessage('Upload Successful', `${selectedFiles.length} file(s) uploaded successfully!`, 'success')
    } catch (error) {
      showMessage('Upload Failed', `${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    } finally {
      setIsUploading(false)
    }
  }

  // Process selected documents - Step 2 to Step 3
  const processSelectedDocuments = async () => {
    const selectedDocs = workspaceDocuments.filter(doc => doc.selected)
    
    if (selectedDocs.length === 0) {
      showMessage('No Documents Selected', 'Please select at least one document to process.', 'warning')
      return
    }

    // Check for image files if using document-translate mode
    if (processingMode === 'document-translate') {
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.tif', '.webp']
      const imageFiles = selectedDocs.filter(doc => 
        imageExtensions.some(ext => doc.originalFilename.toLowerCase().endsWith(ext))
      )
      
      if (imageFiles.length > 0) {
        const imageNames = imageFiles.map(f => f.originalFilename).join(', ')
        const confirmed = window.confirm(
          `Document Translation requires PDF format.\n\n${imageFiles.length} image file(s) detected:\n${imageNames}\n\nConvert these images to PDF before translation?\n\nClick OK to convert and continue, or Cancel to abort.`
        )
        
        if (!confirmed) {
          showMessage('Processing Cancelled', 'Document translation requires PDF format. Please use "Translate: Doc Intelligence + Text Translator" for image files.', 'warning')
          return
        }
      }
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

        const data = await response.json()
        
        // If document-translate, poll for job completion
        if (processingMode === 'document-translate' && data.result?.jobId) {
          const jobId = data.result.jobId
          console.log(`[TRANSLATE] Job ${jobId} started for ${doc.originalFilename}`)
          
          // Poll every 3 seconds for up to 6 minutes
          const maxAttempts = 120
          let attempts = 0
          let jobCompleted = false
          
          while (attempts < maxAttempts && !jobCompleted) {
            await new Promise(resolve => setTimeout(resolve, 3000))
            
            const statusResponse = await fetch(`${API_BASE_URL}/api/translation-job/${jobId}`, {
              credentials: 'include'
            })
            
            if (!statusResponse.ok) {
              throw new Error('Failed to check translation job status')
            }
            
            const statusData = await statusResponse.json()
            const job = statusData.job
            
            console.log(`[TRANSLATE] Job ${jobId} status: ${job.status} - ${job.progress}`)
            
            if (job.status === 'completed') {
              jobCompleted = true
              console.log(`[TRANSLATE] Job ${jobId} completed successfully`)
              
              // Fetch PDF as blob to avoid X-Frame-Options issue
              try {
                const pdfResponse = await fetch(`${API_BASE_URL}/api/translation-job/${jobId}/preview`)
                if (!pdfResponse.ok) {
                  throw new Error('Failed to fetch PDF')
                }
                const pdfBlob = await pdfResponse.blob()
                const blobUrl = URL.createObjectURL(pdfBlob)
                
                // Show PDF preview with blob URL
                setPdfPreview({
                  isOpen: true,
                  jobId: jobId,
                  filename: doc.originalFilename,
                  blobUrl: blobUrl
                })
              } catch (error) {
                console.error('[TRANSLATE] Failed to load PDF preview:', error)
                // Still show success but without preview
              }
            } else if (job.status === 'failed') {
              throw new Error(`Translation failed: ${job.error || 'Unknown error'}`)
            }
            
            attempts++
          }
          
          if (!jobCompleted) {
            throw new Error('Translation job timeout - please check results later')
          }
        }
      }

      // Reload workspace to update processed modes
      await loadWorkspaceDocuments()
      
      // Switch to results tab with flash effect
      setActiveTab('results')
      setFlashingTab('results')
      setTimeout(() => setFlashingTab(null), 1000) // Flash for 1 second
      
      showMessage('Processing Complete', `${selectedDocs.length} document(s) processed successfully!`, 'success')
    } catch (error) {
      showMessage('Processing Failed', `${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const deleteDocument = async (userId: string, documentId: string, filename: string) => {
    showConfirm(
      'Delete Document',
      `Are you sure you want to delete "${filename}"?\n\nThis action cannot be undone.`,
      async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/workspace/${userId}/${documentId}`, {
            method: 'DELETE',
            credentials: 'include'
          })
          
          if (!response.ok) {
            throw new Error(`Delete failed: ${response.statusText}`)
          }
          
          await response.json()
          showMessage('Delete Successful', 'Document deleted successfully!', 'success')
          
          await loadWorkspaceDocuments()
        } catch (error) {
          showMessage('Delete Failed', `${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
        }
      }
    )
  }

  const selectedCount = workspaceDocuments.filter(doc => doc.selected).length

  return (
    <>
    <style>{`
      @keyframes flash {
        0%, 100% { background-color: white; }
        50% { background-color: #e6f3ff; }
      }
    `}</style>
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '2rem',
      fontFamily: '"Segoe UI", "Segoe UI Web (West European)", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif'
    }}>
      <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', color: 'white', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '600', marginBottom: '0.5rem' }}>
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

        {/* Tab Navigation */}
        <div style={{ 
          display: 'flex', 
          gap: '0', 
          marginBottom: '0',
          background: 'white',
          borderBottom: '1px solid #e0e0e0'
        }}>
          <button
            onClick={() => setActiveTab('upload')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'upload' ? (flashingTab === 'upload' ? '#e6f3ff' : 'white') : 'white',
              color: '#323130',
              border: 'none',
              borderBottom: activeTab === 'upload' ? '2px solid #0078d4' : '2px solid transparent',
              fontSize: '14px',
              fontWeight: activeTab === 'upload' ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s',
              animation: flashingTab === 'upload' ? 'flash 0.5s ease-in-out 2' : 'none'
            }}
          >
            📤 Select Files to Upload
          </button>
          <button
            onClick={() => setActiveTab('workspace')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'workspace' ? (flashingTab === 'workspace' ? '#e6f3ff' : 'white') : 'white',
              color: '#323130',
              border: 'none',
              borderBottom: activeTab === 'workspace' ? '2px solid #0078d4' : '2px solid transparent',
              fontSize: '14px',
              fontWeight: activeTab === 'workspace' ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s',
              animation: flashingTab === 'workspace' ? 'flash 0.5s ease-in-out 2' : 'none'
            }}
          >
            📁 My Documents ({workspaceDocuments.length})
          </button>
          <button
            onClick={() => setActiveTab('results')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'results' ? (flashingTab === 'results' ? '#e6f3ff' : 'white') : 'white',
              color: '#323130',
              border: 'none',
              borderBottom: activeTab === 'results' ? '2px solid #0078d4' : '2px solid transparent',
              fontSize: '14px',
              fontWeight: activeTab === 'results' ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s',
              animation: flashingTab === 'results' ? 'flash 0.5s ease-in-out 2' : 'none'
            }}
          >
            📊 Results ({processedResults.length})
          </button>
        </div>

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div style={{ 
            background: 'white', 
            padding: '2rem', 
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            {/* Drag & Drop Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${isDragging ? '#0078d4' : '#d1d1d1'}`,
                borderRadius: '2px',
                padding: '3rem',
                textAlign: 'center',
                background: isDragging ? '#f3f2f1' : '#fafafa',
                transition: 'all 0.2s',
                cursor: 'pointer',
                marginBottom: '1.5rem'
              }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
              <p style={{ fontSize: '16px', color: '#323130', marginBottom: '1rem', fontWeight: 500 }}>
                Drag and drop files here
              </p>
              <p style={{ fontSize: '13px', color: '#605e5c', marginBottom: '1.5rem' }}>
                or
              </p>
              <label style={{
                background: '#0078d4',
                color: 'white',
                padding: '8px 24px',
                borderRadius: '2px',
                cursor: 'pointer',
                display: 'inline-block',
                fontWeight: 600,
                fontSize: '14px',
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
                <h3 style={{ margin: '0 0 1rem 0', color: '#323130', fontSize: '16px', fontWeight: 600 }}>
                  Selected Files ({selectedFiles.length})
                </h3>
                <div style={{ display: 'grid', gap: '8px', marginBottom: '1.5rem' }}>
                  {selectedFiles.map(file => (
                    <div key={file.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      background: 'white',
                      border: '1px solid #e0e0e0',
                      borderRadius: '2px'
                    }}>
                      <span style={{ fontSize: '20px' }}>📄</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, color: '#323130', fontSize: '13px' }}>{file.file.name}</div>
                        <div style={{ fontSize: '12px', color: '#605e5c' }}>
                          {(file.file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <button
                        onClick={() => removeSelectedFile(file.id)}
                        style={{
                          background: '#d13438',
                          color: 'white',
                          border: 'none',
                          padding: '6px 16px',
                          borderRadius: '2px',
                          cursor: 'pointer',
                          fontWeight: 500,
                          fontSize: '13px'
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
                    padding: '12px',
                    background: isUploading ? '#a19f9d' : '#107c10',
                    color: 'white',
                    border: 'none',
                    borderRadius: '2px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s'
                  }}
                >
                  {isUploading ? '⏳ Uploading...' : `🚀 Upload ${selectedFiles.length} File(s)`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* My Documents (Workspace) Tab */}
        {activeTab === 'workspace' && (
          <div style={{ 
            background: 'white', 
            padding: '24px', 
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            {/* Processing Controls */}
            <div style={{ 
              padding: '20px',
              background: '#f3f2f1',
              borderRadius: '2px',
              marginBottom: '24px'
            }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#323130', fontSize: '16px', fontWeight: 600 }}>
                ⚙️ Processing Settings
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#323130', fontSize: '13px' }}>
                    Processing Mode:
                  </label>
                  <select
                    value={processingMode}
                    onChange={(e) => setProcessingMode(e.target.value as ProcessingMode)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '2px',
                      border: '1px solid #8a8886',
                      fontSize: '13px',
                      fontFamily: 'inherit'
                    }}
                  >
                    <option value="ocr-di">📄 OCR: Document Intelligence (Best for forms)</option>
                    <option value="ocr-cu">📄 OCR: Content Understanding (Extracts entities)</option>
                    <option value="ocr-openai">📄 OCR: OpenAI Vision (AI-powered)</option>
                    <option value="translate">🌐 Translate: Doc Intelligence + Text Translator</option>
                    <option value="translate-openai">🌐 Translate: OpenAI Vision (Context-aware)</option>
                    <option value="document-translate">📑 Document Translation (Format-preserving)</option>
                  </select>
                </div>

                {(processingMode.includes('translate') || processingMode === 'document-translate') && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#323130', fontSize: '13px' }}>
                      Target Language:
                    </label>
                    <select
                      value={targetLanguage}
                      onChange={(e) => setTargetLanguage(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '2px',
                        border: '1px solid #8a8886',
                        fontSize: '13px',
                        fontFamily: 'inherit'
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
              </div>

              <button
                onClick={processSelectedDocuments}
                disabled={isProcessing || selectedCount === 0}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: (isProcessing || selectedCount === 0) ? '#a19f9d' : '#0078d4',
                  color: 'white',
                  border: 'none',
                  borderRadius: '2px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: (isProcessing || selectedCount === 0) ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                {isProcessing ? '⏳ Processing...' : 
                 selectedCount === 0 ? 'Select Documents to Process' :
                 `🔄 Process ${selectedCount} Selected Document(s)`}
              </button>
            </div>

            {/* Documents Table */}
            <DocumentTable
              columns={[
                {
                  key: 'originalFilename',
                  label: 'Name',
                  width: 350,
                  render: (filename, doc) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>
                        {doc.mimeType === 'application/pdf' ? '📄' : 
                         doc.mimeType?.startsWith('image/') ? '🖼️' : '📎'}
                      </span>
                      <span 
                        style={{ 
                          color: '#0078d4', 
                          cursor: 'pointer',
                          textDecoration: 'none',
                          fontWeight: 400
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setPreviewDocument(doc)
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.textDecoration = 'underline'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.textDecoration = 'none'
                        }}
                      >
                        {filename}
                      </span>
                    </div>
                  )
                },
                {
                  key: 'uploadTime',
                  label: 'Uploaded',
                  width: 180,
                  render: (time) => new Date(time).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                },
                {
                  key: 'fileSize',
                  label: 'Size',
                  width: 100,
                  render: (size) => {
                    if (size < 1024) return `${size} B`
                    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
                    return `${(size / (1024 * 1024)).toFixed(1)} MB`
                  }
                },
                {
                  key: 'malwareScanStatus',
                  label: 'Scan',
                  width: 100,
                  render: (status) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {status === 'clean' && (
                        <>
                          <span style={{ color: '#107c10', fontSize: '16px' }}>✓</span>
                          <span style={{ color: '#107c10', fontSize: '13px' }}>Clean</span>
                        </>
                      )}
                      {status === 'infected' && (
                        <>
                          <span style={{ color: '#d13438', fontSize: '16px' }}>✗</span>
                          <span style={{ color: '#d13438', fontSize: '13px' }}>Infected</span>
                        </>
                      )}
                      {status === 'pending' && (
                        <>
                          <span style={{ color: '#0078d4', fontSize: '16px' }}>⏳</span>
                          <span style={{ color: '#0078d4', fontSize: '13px' }}>Pending</span>
                        </>
                      )}
                    </div>
                  )
                },
                {
                  key: 'processedModes',
                  label: 'Processed',
                  width: 220,
                  sortable: false,
                  render: (modes: string[]) => (
                    modes.length > 0 ? (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {modes.map(mode => (
                          <span
                            key={mode}
                            style={{
                              padding: '2px 8px',
                              background: '#e1dfdd',
                              color: '#323130',
                              borderRadius: '2px',
                              fontSize: '11px',
                              fontWeight: 500
                            }}
                          >
                            {mode}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#8a8886' }}>—</span>
                    )
                  )
                },
                {
                  key: 'actions',
                  label: 'Actions',
                  width: 100,
                  sortable: false,
                  render: (_, doc) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteDocument(doc.userId, doc.documentId, doc.originalFilename)
                      }}
                      style={{
                        padding: '4px 12px',
                        background: '#d13438',
                        color: 'white',
                        border: 'none',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500
                      }}
                    >
                      Delete
                    </button>
                  )
                }
              ]}
              data={workspaceDocuments}
              onRowClick={(doc) => {
                // Row click selects the document
                setWorkspaceDocuments(prev =>
                  prev.map(d =>
                    d.documentId === doc.documentId
                      ? { ...d, selected: !d.selected }
                      : d
                  )
                )
              }}
              onSelectionChange={(ids) => {
                setWorkspaceDocuments(prev => 
                  prev.map(doc => ({
                    ...doc,
                    selected: ids.includes(doc.documentId)
                  }))
                )
              }}
              selectedIds={workspaceDocuments.filter(d => d.selected).map(d => d.documentId)}
              emptyMessage="No documents yet. Upload documents above to get started."
            />
          </div>
        )}

        {/* Step 3: Results */}
        {activeTab === 'results' && (() => {
          console.log('[RENDER] Results tab rendering with processedResults:', processedResults)
          console.log('[RENDER] processedResults.length:', processedResults.length)
          return (
          <div style={{ 
            background: 'white', 
            padding: '24px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <DocumentTable
              columns={[
                {
                  key: 'originalFilename',
                  label: 'Document',
                  width: 300,
                  render: (filename) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>📄</span>
                      <span style={{ fontWeight: 400 }}>{filename}</span>
                    </div>
                  )
                },
                {
                  key: 'mode',
                  label: 'Tool',
                  width: 200,
                  render: (mode) => (
                    <span style={{
                      padding: '4px 10px',
                      background: '#0078d4',
                      color: 'white',
                      borderRadius: '2px',
                      fontSize: '12px',
                      fontWeight: 500
                    }}>
                      {mode}
                    </span>
                  )
                },
                {
                  key: 'processingTime',
                  label: 'Processed',
                  width: 180,
                  render: (time) => time ? new Date(time).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : '—'
                },
                {
                  key: 'sourceLanguage',
                  label: 'Source',
                  width: 100,
                  render: (lang) => lang || '—'
                },
                {
                  key: 'targetLanguage',
                  label: 'Target',
                  width: 100,
                  render: (lang) => lang || '—'
                },
                {
                  key: 'status',
                  label: 'Status',
                  width: 120,
                  render: (_, result) => (
                    result.error ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#d13438', fontSize: '16px' }}>✗</span>
                        <span style={{ color: '#d13438', fontWeight: 500, fontSize: '13px' }}>Error</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#107c10', fontSize: '16px' }}>✓</span>
                        <span style={{ color: '#107c10', fontWeight: 500, fontSize: '13px' }}>Success</span>
                      </div>
                    )
                  )
                },
                {
                  key: 'actions',
                  label: '',
                  width: 120,
                  sortable: false,
                  render: (_, result) => (
                    result.translatedDocumentUrl ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          window.open(`${API_BASE_URL}${result.translatedDocumentUrl}`, '_blank')
                        }}
                        style={{
                          padding: '4px 12px',
                          background: '#0078d4',
                          color: 'white',
                          border: 'none',
                          borderRadius: '2px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 500
                        }}
                      >
                        Download
                      </button>
                    ) : null
                  )
                }
              ]}
              data={processedResults}
              onRowClick={(result) => {
                console.log('[RESULT_CLICK] Clicked result:', result)
                console.log('[RESULT_CLICK] Mode:', result.mode, 'Markdown:', !!result.markdown)
                if (result.error) {
                  showMessage('Processing Error', result.error, 'error')
                } else if (result.mode === 'document-translate' && result.translatedDocumentUrl) {
                  // For document translation, open the translated PDF in a new tab
                  console.log('[RESULT_CLICK] Opening translated PDF')
                  window.open(`${API_BASE_URL}${result.translatedDocumentUrl}`, '_blank')
                } else if (result.mode === 'ocr-cu') {
                  // For Content Understanding, show enhanced viewer
                  console.log('[RESULT_CLICK] Opening CU viewer')
                  showContentUnderstandingResult(result, result.documentId, result.userId)
                } else if (result.mode === 'ocr-di') {
                  // For Document Intelligence, show enhanced viewer
                  console.log('[RESULT_CLICK] Opening DI viewer')
                  showDocumentIntelligenceResult(result, result.documentId, result.userId)
                } else if (result.ocrText) {
                  showMessage('Extracted Text', result.ocrText.substring(0, 500) + (result.ocrText.length > 500 ? '...' : ''), 'info')
                } else if (result.translatedText) {
                  showMessage('Translation', result.translatedText.substring(0, 500) + (result.translatedText.length > 500 ? '...' : ''), 'info')
                } else {
                  console.log('[RESULT_CLICK] No matching condition, showing JSON')
                  showMessage('Result', JSON.stringify(result, null, 2), 'info')
                }
              }}
              selectedIds={[]}
              emptyMessage="No results yet. Process documents to see results here."
            />
          </div>
          )
        })()}
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
          background: 'rgba(0, 0, 0, 0.6)',
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
            borderRadius: '2px',
            width: '90%',
            maxWidth: '1200px',
            height: '90%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 8px 16px rgba(0,0,0,0.3)'
          }}
        >
          <div style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e0e0e0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f3f2f1'
          }}>
            <h3 style={{ margin: 0, color: '#323130', fontSize: '16px', fontWeight: 600 }}>
              {previewDocument.originalFilename}
            </h3>
            <button
              onClick={() => setPreviewDocument(null)}
              style={{
                background: '#d13438',
                color: 'white',
                border: 'none',
                padding: '6px 16px',
                borderRadius: '2px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '13px'
              }}
            >
              ✕ Close
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden', background: '#faf9f8' }}>
            {previewDocument.mimeType === 'application/pdf' ? (
              <iframe
                src={`${API_BASE_URL}/api/workspace/${previewDocument.userId}/${previewDocument.documentId}/original/${encodeURIComponent(previewDocument.originalFilename)}`}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title={previewDocument.originalFilename}
              />
            ) : previewDocument.mimeType?.startsWith('image/') ? (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                padding: '20px'
              }}>
                <img
                  src={`${API_BASE_URL}/api/workspace/${previewDocument.userId}/${previewDocument.documentId}/original/${encodeURIComponent(previewDocument.originalFilename)}`}
                  alt={previewDocument.originalFilename}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    border: '1px solid #e0e0e0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                />
              </div>
            ) : (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                color: '#605e5c',
                fontSize: '14px'
              }}>
                Preview not available for this file type
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* Message Modal */}
    <MessageModal
      isOpen={messageModal.isOpen}
      title={messageModal.title}
      message={messageModal.message}
      type={messageModal.type}
      onClose={() => setMessageModal({ ...messageModal, isOpen: false })}
    />

    {/* Confirm Modal */}
    <ConfirmModal
      isOpen={confirmModal.isOpen}
      title={confirmModal.title}
      message={confirmModal.message}
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={() => {
        confirmModal.onConfirm()
        setConfirmModal({ ...confirmModal, isOpen: false })
      }}
      onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
    />

    {/* PDF Preview Modal */}
    {pdfPreview.isOpen && pdfPreview.jobId && pdfPreview.blobUrl && (
      <div 
        onClick={() => {
          URL.revokeObjectURL(pdfPreview.blobUrl!)
          setPdfPreview({ isOpen: false, jobId: null, filename: null, blobUrl: null })
        }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}
      >
        <div 
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'white',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '1200px',
            height: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: '#111827' }}>
                📄 Translated PDF Preview
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6b7280' }}>
                {pdfPreview.filename}
              </p>
            </div>
            <button
              onClick={() => {
                URL.revokeObjectURL(pdfPreview.blobUrl!)
                setPdfPreview({ isOpen: false, jobId: null, filename: null, blobUrl: null })
              }}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '28px',
                cursor: 'pointer',
                color: '#6b7280',
                padding: '0',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f3f4f6'
                e.currentTarget.style.color = '#111827'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.color = '#6b7280'
              }}
            >
              ×
            </button>
          </div>
          
          {/* PDF Viewer */}
          <div style={{ flex: 1, padding: '20px', overflow: 'hidden' }}>
            <object
              data={pdfPreview.blobUrl}
              type="application/pdf"
              style={{
                width: '100%',
                height: '100%',
                border: '1px solid #e5e7eb',
                borderRadius: '8px'
              }}
            >
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#6b7280'
              }}>
                <p style={{ fontSize: '16px', marginBottom: '12px' }}>
                  ⚠️ Your browser doesn't support PDF preview
                </p>
                <a
                  href={pdfPreview.blobUrl}
                  download={pdfPreview.filename}
                  style={{
                    padding: '10px 20px',
                    background: '#3b82f6',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  📥 Download PDF
                </a>
              </div>
            </object>
          </div>
          
          {/* Footer with Download Button */}
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px'
          }}>
            <a
              href={pdfPreview.blobUrl}
              download={pdfPreview.filename}
              style={{
                padding: '10px 20px',
                background: '#3b82f6',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              📥 Download PDF
            </a>
            <button
              onClick={() => {
                URL.revokeObjectURL(pdfPreview.blobUrl!)
                setPdfPreview({ isOpen: false, jobId: null, filename: null, blobUrl: null })
              }}
              style={{
                padding: '10px 20px',
                background: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Content Understanding Viewer Modal */}
    {cuViewerModal.isOpen && cuViewerModal.result && (
      <div 
        onClick={() => setCuViewerModal({ ...cuViewerModal, isOpen: false })}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
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
            borderRadius: '2px',
            width: '90%',
            maxWidth: '1200px',
            height: '90%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 8px 16px rgba(0,0,0,0.3)'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e0e0e0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f3f2f1'
          }}>
            <h3 style={{ margin: 0, color: '#323130', fontSize: '16px', fontWeight: 600 }}>
              Content Understanding: {cuViewerModal.result.originalFilename}
            </h3>
            <button
              onClick={() => setCuViewerModal({ ...cuViewerModal, isOpen: false })}
              style={{
                background: '#d13438',
                color: 'white',
                border: 'none',
                borderRadius: '2px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              Close
            </button>
          </div>

          {/* View Mode Tabs */}
          <div style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 24px',
            borderBottom: '1px solid #e0e0e0',
            background: '#faf9f8'
          }}>
            <button
              onClick={() => setCuViewerModal({ ...cuViewerModal, viewMode: 'markdown' })}
              style={{
                padding: '8px 16px',
                background: cuViewerModal.viewMode === 'markdown' ? '#0078d4' : 'transparent',
                color: cuViewerModal.viewMode === 'markdown' ? 'white' : '#323130',
                border: '1px solid #e0e0e0',
                borderRadius: '2px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              📝 Markdown
            </button>
            <button
              onClick={() => setCuViewerModal({ ...cuViewerModal, viewMode: 'json' })}
              style={{
                padding: '8px 16px',
                background: cuViewerModal.viewMode === 'json' ? '#0078d4' : 'transparent',
                color: cuViewerModal.viewMode === 'json' ? 'white' : '#323130',
                border: '1px solid #e0e0e0',
                borderRadius: '2px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              {} JSON
            </button>
            <button
              onClick={() => setCuViewerModal({ ...cuViewerModal, viewMode: 'bounding-boxes' })}
              style={{
                padding: '8px 16px',
                background: cuViewerModal.viewMode === 'bounding-boxes' ? '#0078d4' : 'transparent',
                color: cuViewerModal.viewMode === 'bounding-boxes' ? 'white' : '#323130',
                border: '1px solid #e0e0e0',
                borderRadius: '2px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              📐 Bounding Boxes
            </button>
          </div>

          {/* Content */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '24px',
            background: 'white'
          }}>
            {cuViewerModal.viewMode === 'markdown' && (
              <div style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'Consolas, "Courier New", monospace',
                fontSize: '13px',
                lineHeight: '1.6',
                color: '#323130',
                background: '#f3f2f1',
                padding: '16px',
                borderRadius: '2px'
              }}>
                {cuViewerModal.result.markdown || 'No markdown available'}
              </div>
            )}

            {cuViewerModal.viewMode === 'json' && (
              <pre style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'Consolas, "Courier New", monospace',
                fontSize: '12px',
                lineHeight: '1.5',
                color: '#323130',
                background: '#f3f2f1',
                padding: '16px',
                borderRadius: '2px',
                margin: 0
              }}>
                {JSON.stringify(cuViewerModal.result.fullResult || cuViewerModal.result, null, 2)}
              </pre>
            )}

            {cuViewerModal.viewMode === 'bounding-boxes' && (
              <BoundingBoxViewer
                pages={cuViewerModal.result.pages as any || []}
                documentId={cuViewerModal.documentId}
                userId={cuViewerModal.userId}
              />
            )}
          </div>
        </div>
      </div>
    )}

    {/* Document Intelligence Viewer Modal */}
    {diViewerModal.isOpen && diViewerModal.result && (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
      }}>
        <div style={{
          background: 'white',
          borderRadius: '2px',
          width: '95%',
          maxWidth: '1200px',
          height: '90%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 16px rgba(0,0,0,0.3)'
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e0e0e0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f3f2f1'
          }}>
            <h3 style={{ margin: 0, color: '#323130', fontSize: '16px', fontWeight: 600 }}>
              Document Intelligence: {diViewerModal.result.originalFilename}
            </h3>
            <button
              onClick={() => setDiViewerModal({ ...diViewerModal, isOpen: false })}
              style={{
                background: '#d13438',
                color: 'white',
                border: 'none',
                borderRadius: '2px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              Close
            </button>
          </div>

          {/* View Mode Tabs */}
          <div style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 24px',
            borderBottom: '1px solid #e0e0e0',
            background: '#faf9f8'
          }}>
            <button
              onClick={() => setDiViewerModal({ ...diViewerModal, viewMode: 'text' })}
              style={{
                padding: '8px 16px',
                background: diViewerModal.viewMode === 'text' ? '#0078d4' : 'transparent',
                color: diViewerModal.viewMode === 'text' ? 'white' : '#323130',
                border: '1px solid #e0e0e0',
                borderRadius: '2px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              📄 Text
            </button>
            <button
              onClick={() => setDiViewerModal({ ...diViewerModal, viewMode: 'pages' })}
              style={{
                padding: '8px 16px',
                background: diViewerModal.viewMode === 'pages' ? '#0078d4' : 'transparent',
                color: diViewerModal.viewMode === 'pages' ? 'white' : '#323130',
                border: '1px solid #e0e0e0',
                borderRadius: '2px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              📑 Pages
            </button>
            <button
              onClick={() => setDiViewerModal({ ...diViewerModal, viewMode: 'bounding-boxes' })}
              style={{
                padding: '8px 16px',
                background: diViewerModal.viewMode === 'bounding-boxes' ? '#0078d4' : 'transparent',
                color: diViewerModal.viewMode === 'bounding-boxes' ? 'white' : '#323130',
                border: '1px solid #e0e0e0',
                borderRadius: '2px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              🔲 Bounding Boxes
            </button>
            <button
              onClick={() => setDiViewerModal({ ...diViewerModal, viewMode: 'json' })}
              style={{
                padding: '8px 16px',
                background: diViewerModal.viewMode === 'json' ? '#0078d4' : 'transparent',
                color: diViewerModal.viewMode === 'json' ? 'white' : '#323130',
                border: '1px solid #e0e0e0',
                borderRadius: '2px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              {} JSON
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
            {diViewerModal.viewMode === 'text' && (
              <div>
                <div style={{
                  background: '#f3f2f1',
                  padding: '16px',
                  borderRadius: '2px',
                  marginBottom: '16px'
                }}>
                  <div style={{ fontSize: '13px', color: '#605e5c', marginBottom: '8px' }}>
                    <strong>Service:</strong> {diViewerModal.result.service}
                  </div>
                  <div style={{ fontSize: '13px', color: '#605e5c', marginBottom: '8px' }}>
                    <strong>Model:</strong> {diViewerModal.result.model || 'prebuilt-read'}
                  </div>
                  <div style={{ fontSize: '13px', color: '#605e5c' }}>
                    <strong>Pages:</strong> {diViewerModal.result.pageCount}
                  </div>
                </div>
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'Consolas, "Courier New", monospace',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  color: '#323130',
                  background: 'white',
                  border: '1px solid #e0e0e0',
                  padding: '16px',
                  borderRadius: '2px',
                  margin: 0
                }}>
                  {diViewerModal.result.text || 'No text content available'}
                </pre>
              </div>
            )}

            {diViewerModal.viewMode === 'pages' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {(diViewerModal.result.pages || []).map((page: any, idx: number) => (
                  <div key={idx} style={{
                    background: 'white',
                    border: '1px solid #e0e0e0',
                    borderRadius: '2px',
                    padding: '16px'
                  }}>
                    <h4 style={{
                      margin: '0 0 12px 0',
                      color: '#0078d4',
                      fontSize: '14px',
                      fontWeight: 600
                    }}>
                      Page {page.pageNumber} ({page.lines?.length || 0} lines, {page.words?.length || 0} words)
                    </h4>
                    <div style={{ fontSize: '12px', color: '#605e5c', marginBottom: '12px' }}>
                      Size: {page.width} × {page.height} {page.unit} | Angle: {page.angle}°
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(page.lines || []).map((line: any, lineIdx: number) => (
                        <div key={lineIdx} style={{
                          padding: '8px',
                          background: '#faf9f8',
                          borderLeft: '3px solid #0078d4',
                          borderRadius: '2px',
                          fontSize: '13px',
                          fontFamily: 'Consolas, "Courier New", monospace'
                        }}>
                          {line.content}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {(!diViewerModal.result.pages || diViewerModal.result.pages.length === 0) && (
                  <div style={{ textAlign: 'center', color: '#605e5c', padding: '40px' }}>
                    No page data available
                  </div>
                )}
              </div>
            )}

            {diViewerModal.viewMode === 'json' && (
              <pre style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'Consolas, "Courier New", monospace',
                fontSize: '12px',
                lineHeight: '1.5',
                color: '#323130',
                background: '#f3f2f1',
                padding: '16px',
                borderRadius: '2px',
                margin: 0
              }}>
                {JSON.stringify(diViewerModal.result.fullResult || diViewerModal.result, null, 2)}
              </pre>
            )}

            {diViewerModal.viewMode === 'bounding-boxes' && (
              <BoundingBoxViewer
                pages={diViewerModal.result.pages as any || []}
                documentId={diViewerModal.documentId}
                userId={diViewerModal.userId}
              />
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
