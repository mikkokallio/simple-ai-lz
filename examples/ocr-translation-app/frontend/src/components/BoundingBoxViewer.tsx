import { useRef, useEffect, useState } from 'react'

// Runtime configuration - match main.tsx pattern
declare global {
  interface Window {
    ENV?: {
      BACKEND_URL?: string
    }
  }
}

const API_BASE_URL = window.ENV?.BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://aca-ocr-trans-backend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io')

interface Polygon {
  x: number
  y: number
}

interface Line {
  content: string
  source: string | Polygon[]
  spans?: Array<{ offset: number; length: number }>
}

interface Word {
  content: string
  source: string | Polygon[]
  confidence?: number
}

interface Page {
  pageNumber?: number
  angle?: number
  width?: number
  height?: number
  unit?: string
  lines?: Line[]
  words?: Word[]
}

interface BoundingBoxViewerProps {
  pages: Page[]
  documentId: string | null
  userId: string | null
}

function parsePolygon(source: string | Polygon[]): Polygon[] {
  if (Array.isArray(source)) {
    return source
  }
  // Source is a string like "polygon:0.1,0.2,0.3,0.4..."
  if (typeof source === 'string' && source.startsWith('polygon:')) {
    const coords = source.substring(8).split(',').map(Number)
    const points: Polygon[] = []
    for (let i = 0; i < coords.length; i += 2) {
      points.push({ x: coords[i], y: coords[i + 1] })
    }
    return points
  }
  return []
}

export function BoundingBoxViewer({ pages, documentId, userId }: BoundingBoxViewerProps) {
  const [selectedPage, setSelectedPage] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load document metadata to get original filename
  useEffect(() => {
    if (!documentId || !userId) return

    const loadDocumentMetadata = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/workspace/${documentId}`)
        const data = await response.json()
        
        if (data.status === 'success' && data.metadata) {
          const filename = data.metadata.originalFilename
          const url = `${API_BASE_URL}/api/workspace/${userId}/${documentId}/original/${encodeURIComponent(filename)}`
          setImageUrl(url)
        } else {
          setError('Could not load document metadata')
        }
      } catch (err) {
        console.error('Error loading document metadata:', err)
        setError('Failed to load document')
      }
    }

    loadDocumentMetadata()
  }, [documentId, userId])

  // Draw bounding boxes on canvas
  useEffect(() => {
    if (!imageUrl || !imageLoaded || !canvasRef.current || !pages[selectedPage]) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      // Set canvas size to match image
      canvas.width = img.width
      canvas.height = img.height

      // Draw image
      ctx.drawImage(img, 0, 0)

      const page = pages[selectedPage]
      if (!page.lines) return

      // Draw bounding boxes for each line
      page.lines.forEach((line, idx) => {
        const sourcePolygon = parsePolygon(line.source)
        if (sourcePolygon.length < 3) return

        // Convert normalized coordinates to pixel coordinates
        const polygon = sourcePolygon.map(point => ({
          x: point.x * img.width,
          y: point.y * img.height
        }))

        // Draw polygon
        ctx.beginPath()
        ctx.moveTo(polygon[0].x, polygon[0].y)
        for (let i = 1; i < polygon.length; i++) {
          ctx.lineTo(polygon[i].x, polygon[i].y)
        }
        ctx.closePath()

        // Style based on line index (cycle through colors)
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ff00ff', '#00ffff', '#ffff00']
        ctx.strokeStyle = colors[idx % colors.length]
        ctx.lineWidth = 2
        ctx.stroke()

        // Draw line number label
        ctx.fillStyle = colors[idx % colors.length]
        ctx.font = 'bold 12px Arial'
        ctx.fillText(`${idx + 1}`, polygon[0].x, polygon[0].y - 5)
      })
    }

    img.src = imageUrl
  }, [imageUrl, imageLoaded, selectedPage, pages])

  if (!documentId || !userId) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        color: '#605e5c',
        fontSize: '14px'
      }}>
        Document information not available for bounding box visualization
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        color: '#d13438',
        fontSize: '14px'
      }}>
        {error}
      </div>
    )
  }

  if (!pages || pages.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        color: '#605e5c',
        fontSize: '14px'
      }}>
        No bounding box data available
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {/* Page Selector */}
      {pages.length > 1 && (
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          padding: '12px',
          background: '#f3f2f1',
          borderRadius: '2px'
        }}>
          {pages.map((_page, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedPage(idx)}
              style={{
                padding: '8px 16px',
                background: selectedPage === idx ? '#0078d4' : 'white',
                color: selectedPage === idx ? 'white' : '#323130',
                border: '1px solid #e0e0e0',
                borderRadius: '2px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: selectedPage === idx ? 600 : 400
              }}
            >
              Page {idx + 1}
            </button>
          ))}
        </div>
      )}

      {/* Canvas Container */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        background: '#faf9f8',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '20px'
      }}>
        {!imageLoaded && imageUrl && (
          <div style={{ color: '#605e5c', fontSize: '14px', padding: '40px' }}>
            Loading image...
            <img 
              src={imageUrl}
              alt="Loading"
              style={{ display: 'none' }}
              onLoad={() => setImageLoaded(true)}
              onError={() => setError('Failed to load image')}
            />
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{
            maxWidth: '100%',
            height: 'auto',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            display: imageLoaded ? 'block' : 'none'
          }}
        />
      </div>

      {/* Legend */}
      {pages[selectedPage]?.lines && pages[selectedPage].lines.length > 0 && (
        <div style={{
          padding: '16px',
          background: '#f3f2f1',
          borderRadius: '2px',
          maxHeight: '200px',
          overflow: 'auto'
        }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
            Text Lines ({pages[selectedPage].lines.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pages[selectedPage].lines.map((line, idx) => {
              const colors = ['#ff0000', '#00ff00', '#0000ff', '#ff00ff', '#00ffff', '#ffff00']
              return (
                <div
                  key={idx}
                  style={{
                    padding: '8px',
                    background: 'white',
                    borderRadius: '2px',
                    borderLeft: `3px solid ${colors[idx % colors.length]}`,
                    fontSize: '13px'
                  }}
                >
                  <span style={{ fontWeight: 600, marginRight: '8px', color: colors[idx % colors.length] }}>
                    {idx + 1}:
                  </span>
                  {line.content}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
