import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { DocumentTable } from './components/DocumentTable'
import { MessageModal } from './components/MessageModal'
import { ConfirmModal } from './components/ConfirmModal'

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
  
  // UI state
  const [isDragging, setIsDragging] = useState(false)
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('ocr-di')
  const [systemPrompt] = useState<string>(DEFAULT_SYSTEM_PROMPTS['ocr-openai'])
  const [targetLanguage, setTargetLanguage] = useState<string>('en')
  const [previewDocument, setPreviewDocument] = useState<WorkspaceDocument | null>(null)
  const [activeTab, setActiveTab] = useState<'workspace' | 'results'>('workspace')

  // Helper functions for modals
  const showMessage = (title: string, message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setMessageModal({ isOpen: true, title, message, type })
  }

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm })
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

        {/* Step 1: File Selection & Upload */}
        <div style={{ 
          background: 'white', 
          padding: '2rem', 
          borderRadius: '2px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          marginBottom: '2rem'
        }}>
          <h2 style={{ margin: '0 0 1.5rem 0', color: '#323130', fontSize: '20px', fontWeight: '600' }}>
            📤 Step 1: Select Files to Upload
          </h2>
          
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

        {/* Tab Navigation */}
        <div style={{ 
          display: 'flex', 
          gap: '0', 
          marginBottom: '0',
          background: 'white',
          borderBottom: '1px solid #e0e0e0'
        }}>
          <button
            onClick={() => setActiveTab('workspace')}
            style={{
              padding: '12px 24px',
              background: 'white',
              color: '#323130',
              border: 'none',
              borderBottom: activeTab === 'workspace' ? '2px solid #0078d4' : '2px solid transparent',
              fontSize: '14px',
              fontWeight: activeTab === 'workspace' ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            📁 My Documents ({workspaceDocuments.length})
          </button>
          <button
            onClick={() => setActiveTab('results')}
            style={{
              padding: '12px 24px',
              background: 'white',
              color: '#323130',
              border: 'none',
              borderBottom: activeTab === 'results' ? '2px solid #0078d4' : '2px solid transparent',
              fontSize: '14px',
              fontWeight: activeTab === 'results' ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            📊 Results ({processedResults.length})
          </button>
        </div>

        {/* Step 2: My Documents (Workspace) */}
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
        {activeTab === 'results' && (
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
                if (result.error) {
                  showMessage('Processing Error', result.error, 'error')
                } else if (result.ocrText) {
                  showMessage('Extracted Text', result.ocrText.substring(0, 500) + (result.ocrText.length > 500 ? '...' : ''), 'info')
                } else if (result.translatedText) {
                  showMessage('Translation', result.translatedText.substring(0, 500) + (result.translatedText.length > 500 ? '...' : ''), 'info')
                }
              }}
              selectedIds={[]}
              emptyMessage="No results yet. Process documents to see results here."
            />
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
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
