import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

// Runtime configuration - can be set via nginx config injection
declare global {
  interface Window {
    ENV?: {
      BACKEND_URL?: string
    }
  }
}

// Use backend URL from environment or default to localhost for development
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

interface UploadedFile {
  file: File
  preview?: string
  status: 'pending' | 'uploading' | 'uploaded' | 'processing' | 'completed' | 'error'
  result?: any
  error?: string
  documentId?: string
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
}

type ProcessingMode = 'ocr-di' | 'ocr-cu' | 'ocr-openai' | 'translate' | 'translate-openai'

const DEFAULT_SYSTEM_PROMPTS = {
  'ocr-openai': 'You are an expert OCR system. Extract all text from the provided image with high accuracy. Maintain the original formatting, structure, and layout as much as possible. Return only the extracted text without any commentary or metadata.',
  'translate-openai': 'You are an expert translator. Translate the provided text to the target language while maintaining the original meaning, tone, and style. Preserve formatting and structure. Return only the translated text.'
}

function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('ocr-di')
  const [systemPrompt, setSystemPrompt] = useState<string>(DEFAULT_SYSTEM_PROMPTS['ocr-openai'])
  const [targetLanguage, setTargetLanguage] = useState<string>('en')
  const [workspaceDocuments, setWorkspaceDocuments] = useState<WorkspaceDocument[]>([])
  const [previewDocument, setPreviewDocument] = useState<WorkspaceDocument | null>(null)

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
    
    // Load workspace documents
    loadWorkspaceDocuments()
  }, [])
  
  const loadWorkspaceDocuments = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/workspace/documents`, {
        credentials: 'include' // Include cookies for session
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      if (data.status === 'success') {
        // Ensure all documents have userId set to 'demo' (for backward compatibility)
        const documentsWithUserId = data.documents.map((doc: WorkspaceDocument) => ({
          ...doc,
          userId: doc.userId || 'demo'
        }))
        setWorkspaceDocuments(documentsWithUserId)
      }
    } catch (err) {
      console.error('Failed to load workspace documents:', err)
    }
  }

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
    addFiles(droppedFiles)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      addFiles(selectedFiles)
    }
  }

  const addFiles = (newFiles: File[]) => {
    const fileObjects: UploadedFile[] = newFiles.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      status: 'pending'
    }))
    setFiles(prev => [...prev, ...fileObjects])
  }

  const processFromWorkspace = async (documentId: string, filename: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/workspace/${documentId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode: processingMode.includes('ocr') ? 'ocr' : processingMode.includes('translate') ? 'translate' : 'analyze',
          targetLanguage: processingMode.includes('translate') ? targetLanguage : undefined
        })
      })
      
      if (!response.ok) {
        throw new Error(`Processing failed: ${response.statusText}`)
      }
      
      const result = await response.json()
      alert(`✅ Processing started for ${filename}!\n\nMode: ${result.mode}\nDocument ID: ${result.documentId}`)
      
      // Reload workspace documents to show updated processed modes
      await loadWorkspaceDocuments()
    } catch (error) {
      alert(`❌ Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
      
      // Reload workspace documents
      await loadWorkspaceDocuments()
    } catch (error) {
      alert(`❌ Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const processFile = async (index: number) => {
    const fileToProcess = files[index]
    if (!fileToProcess) return

    try {
      // Step 1: Upload to workspace first
      setFiles(prev => prev.map((f, i) => i === index ? { ...f, status: 'uploading' as const } : f))
      
      const workspaceFormData = new FormData()
      workspaceFormData.append('file', fileToProcess.file)

      const workspaceResponse = await fetch(`${API_BASE_URL}/api/workspace/upload`, {
        method: 'POST',
        body: workspaceFormData,
        credentials: 'include' // Include session cookie
      })

      if (!workspaceResponse.ok) {
        throw new Error(`Workspace upload failed: ${workspaceResponse.statusText}`)
      }

      const workspaceResult = await workspaceResponse.json()
      const documentId = workspaceResult.documentId
      
      // Store documentId in the file object
      setFiles(prev => prev.map((f, i) => i === index ? { ...f, documentId } : f))
      
      // Step 2: Upload to blob storage for Azure Translator (it requires blob containers)
      let blobUrl: string | undefined
      
      if (processingMode === 'translate') {
        const uploadFormData = new FormData()
        uploadFormData.append('file', fileToProcess.file)

        const uploadResponse = await fetch(`${API_BASE_URL}/api/upload`, {
          method: 'POST',
          body: uploadFormData
        })

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`)
        }

        const uploadResult = await uploadResponse.json()
        blobUrl = uploadResult.blobUrl
      }

      // Step 3: Process the file
      setFiles(prev => prev.map((f, i) => i === index ? { ...f, status: 'processing' as const } : f))
      
      const formData = new FormData()
      formData.append('file', fileToProcess.file)
      
      // Add documentId if available (so backend can save results to workspace)
      if (fileToProcess.documentId) {
        formData.append('documentId', fileToProcess.documentId)
      }

      let endpoint = ''
      switch (processingMode) {
        case 'ocr-di':
          endpoint = '/api/ocr/document-intelligence'
          break
        case 'ocr-cu':
          endpoint = '/api/ocr/language-analysis'
          break
        case 'ocr-openai':
          endpoint = '/api/ocr/openai'
          break
        case 'translate':
          endpoint = '/api/translate'
          break
        case 'translate-openai':
          endpoint = '/api/translate/openai'
          break
      }

      // Add system prompt for OpenAI modes
      if (processingMode === 'ocr-openai' || processingMode === 'translate-openai') {
        formData.append('systemPrompt', systemPrompt)
        if (processingMode === 'translate-openai') {
          formData.append('targetLanguage', targetLanguage)
        }
      } else if (processingMode === 'translate') {
        formData.append('targetLanguage', targetLanguage)
      }

      // Add blobUrl for Azure Translator (required)
      if (blobUrl) {
        formData.append('blobUrl', blobUrl)
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Processing failed: ${response.statusText}`)
      }

      // Handle translation response (binary PDF) vs JSON responses
      let result
      if (processingMode === 'translate') {
        // Translation returns binary PDF
        const blob = await response.blob()
        const downloadUrl = URL.createObjectURL(blob)
        
        // Extract filename from Content-Disposition header or use default
        const contentDisposition = response.headers.get('Content-Disposition')
        const filenameMatch = contentDisposition?.match(/filename="?(.+?)"?$/i)
        const filename = filenameMatch ? filenameMatch[1] : `translated-${files[index].file.name}`
        
        result = {
          status: 'success',
          service: 'Azure Document Translation',
          translatedDocument: downloadUrl,
          filename: filename,
          message: 'Document translated successfully. Click download to save.'
        }
      } else {
        // All other modes return JSON
        result = await response.json()
      }

      setFiles(prev => prev.map((f, i) => 
        i === index ? { ...f, status: 'completed' as const, result: { ...result, blobUrl } } : f
      ))
      
      // Reload workspace documents to show the newly processed file
      loadWorkspaceDocuments()
    } catch (err) {
      setFiles(prev => prev.map((f, i) => 
        i === index ? { 
          ...f, 
          status: 'error' as const, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        } : f
      ))
    }
  }

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = [...prev]
      if (newFiles[index].preview) {
        URL.revokeObjectURL(newFiles[index].preview!)
      }
      newFiles.splice(index, 1)
      return newFiles
    })
  }

  const processAll = () => {
    files.forEach((_, index) => {
      if (files[index].status === 'pending') {
        processFile(index)
      }
    })
  }

  return (
    <>
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '2rem',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', color: 'white', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>
            📄 OCR & Translation
          </h1>
          <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>
            Upload documents for OCR or translation
          </p>
          <p style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '0.5rem' }}>
            Backend: <code style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px' }}>
              {API_BASE_URL}
            </code>
          </p>
        </div>

        {/* Health Status */}
        {error && (
          <div style={{ 
            background: '#fee', 
            padding: '1rem', 
            borderRadius: '8px', 
            color: '#c00',
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            ⚠️ Backend Error: {error}
          </div>
        )}

        {health && (
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.95)', 
            padding: '1.5rem', 
            borderRadius: '12px',
            marginBottom: '2rem',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>Backend Status: <span style={{ color: '#10b981' }}>●</span> {health.status}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <strong>AI Foundry:</strong> {health.services.aiFoundry ? '✅ Ready' : '⚠️ Not configured'}
              </div>
              <div>
                <strong>Document Intelligence:</strong> {health.services.documentIntelligence ? '✅ Ready' : '⚠️ Not configured'}
              </div>
              <div>
                <strong>Translator:</strong> {health.services.translator ? '✅ Ready' : '⚠️ Not configured'}
              </div>
            </div>
          </div>
        )}

        {/* Main Content - Conditionally render Upload or Workspace */}
        {/* Processing Mode Selector */}
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.95)', 
          padding: '1.5rem', 
          borderRadius: '12px',
          marginBottom: '2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>Processing Mode</h3>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ flex: '1', minWidth: '200px', cursor: 'pointer' }}>
              <input 
                type="radio" 
                value="ocr-di" 
                checked={processingMode === 'ocr-di'} 
                onChange={(e) => setProcessingMode(e.target.value as ProcessingMode)}
                style={{ marginRight: '0.5rem' }}
              />
              <strong>Document Intelligence OCR</strong>
              <div style={{ fontSize: '0.85rem', color: '#666', marginLeft: '1.5rem' }}>
                Azure AI Document Intelligence service
              </div>
            </label>
            <label style={{ flex: '1', minWidth: '200px', cursor: 'pointer' }}>
              <input 
                type="radio" 
                value="ocr-cu" 
                checked={processingMode === 'ocr-cu'} 
                onChange={(e) => setProcessingMode(e.target.value as ProcessingMode)}
                style={{ marginRight: '0.5rem' }}
              />
              <strong>Azure AI Language</strong>
              <div style={{ fontSize: '0.85rem', color: '#666', marginLeft: '1.5rem' }}>
                Key phrase extraction from documents
              </div>
            </label>
            <label style={{ flex: '1', minWidth: '200px', cursor: 'pointer' }}>
              <input 
                type="radio" 
                value="ocr-openai" 
                checked={processingMode === 'ocr-openai'} 
                onChange={(e) => {
                  setProcessingMode(e.target.value as ProcessingMode)
                  setSystemPrompt(DEFAULT_SYSTEM_PROMPTS['ocr-openai'])
                }}
                style={{ marginRight: '0.5rem' }}
              />
              <strong>OpenAI Vision OCR</strong>
              <div style={{ fontSize: '0.85rem', color: '#666', marginLeft: '1.5rem' }}>
                GPT-4 Vision for OCR with custom prompts
              </div>
            </label>
            <label style={{ flex: '1', minWidth: '200px', cursor: 'pointer' }}>
              <input 
                type="radio" 
                value="translate" 
                checked={processingMode === 'translate'} 
                onChange={(e) => setProcessingMode(e.target.value as ProcessingMode)}
                style={{ marginRight: '0.5rem' }}
              />
              <strong>Azure Translator</strong>
              <div style={{ fontSize: '0.85rem', color: '#666', marginLeft: '1.5rem' }}>
                Azure AI Translator service
              </div>
            </label>
            <label style={{ flex: '1', minWidth: '200px', cursor: 'pointer' }}>
              <input 
                type="radio" 
                value="translate-openai" 
                checked={processingMode === 'translate-openai'} 
                onChange={(e) => {
                  setProcessingMode(e.target.value as ProcessingMode)
                  setSystemPrompt(DEFAULT_SYSTEM_PROMPTS['translate-openai'])
                }}
                style={{ marginRight: '0.5rem' }}
              />
              <strong>OpenAI Translation</strong>
              <div style={{ fontSize: '0.85rem', color: '#666', marginLeft: '1.5rem' }}>
                GPT-4 translation with custom prompts
              </div>
            </label>
          </div>

          {/* System Prompt for OpenAI modes */}
          {(processingMode === 'ocr-openai' || processingMode === 'translate-openai') && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#333' }}>
                System Prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontFamily: 'monospace',
                  fontSize: '0.9rem',
                  resize: 'vertical'
                }}
                placeholder="Enter custom system prompt..."
              />
            </div>
          )}

          {/* Target Language for translation modes */}
          {(processingMode === 'translate' || processingMode === 'translate-openai') && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#333' }}>
                Target Language
              </label>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                style={{
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem',
                  minWidth: '200px'
                }}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="it">Italian</option>
                <option value="pt">Portuguese</option>
                <option value="nl">Dutch</option>
                <option value="ja">Japanese</option>
                <option value="ko">Korean</option>
                <option value="zh-Hans">Chinese (Simplified)</option>
                <option value="zh-Hant">Chinese (Traditional)</option>
                <option value="ar">Arabic</option>
                <option value="ru">Russian</option>
                <option value="fi">Finnish</option>
                <option value="sv">Swedish</option>
              </select>
            </div>
          )}
        </div>

        {/* Upload Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            background: isDragging ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.95)',
            border: isDragging ? '3px dashed #667eea' : '3px dashed transparent',
            borderRadius: '16px',
            padding: '3rem',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            marginBottom: '2rem',
            boxShadow: '0 8px 16px rgba(0,0,0,0.1)'
          }}
        >
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📎</div>
          <h2 style={{ color: '#333', marginBottom: '1rem' }}>
            {isDragging ? 'Drop files here' : 'Drag & Drop files here'}
          </h2>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>or</p>
          <label style={{
            background: '#667eea',
            color: 'white',
            padding: '0.75rem 2rem',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'inline-block',
            fontWeight: '600',
            transition: 'all 0.2s ease'
          }}>
            Browse Files
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp"
            />
          </label>
          <p style={{ color: '#999', fontSize: '0.85rem', marginTop: '1rem' }}>
            Supported: PDF, PNG, JPG, TIFF, BMP
          </p>
        </div>

        {/* Files List */}
        {files.length > 0 && (
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.95)', 
            padding: '1.5rem', 
            borderRadius: '12px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#333' }}>Uploaded Files ({files.length})</h3>
              <button
                onClick={processAll}
                disabled={files.every(f => f.status !== 'pending')}
                style={{
                  background: files.every(f => f.status !== 'pending') ? '#ccc' : '#10b981',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1.5rem',
                  borderRadius: '6px',
                  cursor: files.every(f => f.status !== 'pending') ? 'not-allowed' : 'pointer',
                  fontWeight: '600'
                }}
              >
                Process All
              </button>
            </div>
            
            {files.map((fileObj, index) => (
              <div key={index} style={{
                background: '#f9fafb',
                padding: '1rem',
                borderRadius: '8px',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem'
              }}>
                {fileObj.preview && (
                  <img src={fileObj.preview} alt="preview" style={{ 
                    width: '60px', 
                    height: '60px', 
                    objectFit: 'cover', 
                    borderRadius: '4px' 
                  }} />
                )}
                {!fileObj.preview && (
                  <div style={{ 
                    width: '60px', 
                    height: '60px', 
                    background: '#e5e7eb', 
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem'
                  }}>
                    📄
                  </div>
                )}
                
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', color: '#333' }}>{fileObj.file.name}</div>
                  <div style={{ fontSize: '0.85rem', color: '#666' }}>
                    {(fileObj.file.size / 1024).toFixed(1)} KB
                  </div>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    Status: <span style={{ 
                      color: fileObj.status === 'completed' ? '#10b981' : 
                             fileObj.status === 'error' ? '#ef4444' : '#667eea',
                      fontWeight: '600'
                    }}>
                      {fileObj.status === 'pending' && '⏸️ Pending'}
                      {fileObj.status === 'uploading' && '⬆️ Uploading...'}
                      {fileObj.status === 'processing' && '⚙️ Processing...'}
                      {fileObj.status === 'completed' && '✅ Completed'}
                      {fileObj.status === 'error' && `❌ Error: ${fileObj.error}`}
                    </span>
                  </div>
                  {fileObj.result && (
                    <details style={{ marginTop: '0.5rem' }}>
                      <summary style={{ cursor: 'pointer', color: '#667eea', fontWeight: '600' }}>
                        View Result
                      </summary>
                      
                      {fileObj.result.translatedDocument ? (
                        <div style={{ marginTop: '0.5rem' }}>
                          <a
                            href={fileObj.result.translatedDocument}
                            download={fileObj.result.filename || 'translated-document.pdf'}
                            style={{
                              display: 'inline-block',
                              background: '#10b981',
                              color: 'white',
                              padding: '0.5rem 1rem',
                              borderRadius: '6px',
                              textDecoration: 'none',
                              fontWeight: '600',
                              marginBottom: '0.5rem'
                            }}
                          >
                            📥 Download Translated Document
                          </a>
                          <div style={{ fontSize: '0.85rem', color: '#666' }}>
                            {fileObj.result.message}
                          </div>
                        </div>
                      ) : (
                        <pre style={{ 
                          background: 'white', 
                          padding: '0.5rem', 
                          borderRadius: '4px', 
                          fontSize: '0.75rem',
                          overflow: 'auto',
                          marginTop: '0.5rem'
                        }}>
                          {JSON.stringify(fileObj.result, null, 2)}
                        </pre>
                      )}
                    </details>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {fileObj.status === 'pending' && (
                    <button
                      onClick={() => processFile(index)}
                      style={{
                        background: '#667eea',
                        color: 'white',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      Process
                    </button>
                  )}
                  <button
                    onClick={() => removeFile(index)}
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
              </div>
            ))}
          </div>
        )}

        {/* MVP Notice */}
        <div style={{ 
          marginTop: '2rem', 
          background: 'rgba(255, 255, 255, 0.9)', 
          padding: '1rem', 
          borderRadius: '8px',
          textAlign: 'center',
          color: '#666'
        }}>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>
            ⚠️ MVP Version: Storage upload and actual AI processing will be implemented next
          </p>
        </div>

          {/* Workspace Document Library */}
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.95)', 
            padding: '1.5rem', 
            borderRadius: '12px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 1.5rem 0', color: '#333' }}>📁 My Documents</h3>
            
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
                    onClick={() => setPreviewDocument(doc)}
                    style={{ 
                      background: 'white', 
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'all 0.2s',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {/* Thumbnail */}
                    <div style={{ 
                      width: '100%', 
                      height: '200px', 
                      background: '#f3f4f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden'
                    }}>
                      {doc.mimeType === 'application/pdf' ? (
                        <embed
                          src={`${API_BASE_URL}/api/workspace/thumbnail/${doc.userId}/${doc.documentId}#toolbar=0&navpanes=0`}
                          type="application/pdf"
                          style={{
                            width: '100%',
                            height: '100%',
                            border: 'none'
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
                                 doc.malwareScanStatus === 'infected' ? '#ef4444' : '#f59e0b'
                        }}>
                          {doc.malwareScanStatus === 'clean' && '✅'}
                          {doc.malwareScanStatus === 'infected' && '⚠️'}
                          {doc.malwareScanStatus === 'pending' && '⏳'}
                        </div>
                      </div>
                      
                      {/* Process Button */}
                      {doc.malwareScanStatus === 'clean' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            processFromWorkspace(doc.documentId, doc.originalFilename);
                          }}
                          style={{
                            width: '100%',
                            marginTop: '0.75rem',
                            padding: '0.5rem',
                            background: '#667eea',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#5568d3'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#667eea'}
                        >
                          🔄 Process Document
                        </button>
                      )}

                      {/* Delete Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteDocument(doc.userId, doc.documentId, doc.originalFilename);
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
                        onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#ef4444'}
                      >
                        🗑️ Delete
                      </button>
                      
                      {doc.processedModes.length > 0 && (
                        <div style={{ 
                          marginTop: 'auto',
                          paddingTop: '0.75rem', 
                          borderTop: '1px solid #e5e7eb',
                          fontSize: '0.7rem'
                        }}>
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
      </div>
    </div>
    
    {/* Preview Modal */}
    {previewDocument && (
      <div 
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
        onClick={() => setPreviewDocument(null)}
      >
        <div 
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
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            padding: '1.5rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#333' }}>
                {previewDocument.originalFilename}
              </h2>
              <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
                {(previewDocument.fileSize / 1024).toFixed(1)} KB • Uploaded {new Date(previewDocument.uploadTime).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={() => setPreviewDocument(null)}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '0.75rem 1.5rem',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '600'
              }}
            >
              ✕ Close
            </button>
          </div>
          
          {/* PDF Viewer */}
          <div style={{ flex: 1, overflow: 'hidden', background: '#f3f4f6' }}>
            {previewDocument.mimeType === 'application/pdf' ? (
              <embed
                src={`${API_BASE_URL}/api/workspace/${previewDocument.userId}/${previewDocument.documentId}/original/${previewDocument.originalFilename}`}
                type="application/pdf"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none'
                }}
              />
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                fontSize: '1.2rem',
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
  </React.StrictMode>
)

