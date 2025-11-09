interface MessageModalProps {
  isOpen: boolean
  title: string
  message: string
  type?: 'info' | 'success' | 'error' | 'warning'
  onClose: () => void
}

export function MessageModal({
  isOpen,
  title,
  message,
  type = 'info',
  onClose
}: MessageModalProps) {
  if (!isOpen) return null

  const getIconAndColor = () => {
    switch (type) {
      case 'success':
        return { icon: '✓', color: '#107c10', bgColor: '#dff6dd' }
      case 'error':
        return { icon: '✗', color: '#d13438', bgColor: '#fde7e9' }
      case 'warning':
        return { icon: '⚠', color: '#ca5010', bgColor: '#fff4ce' }
      default:
        return { icon: 'ℹ', color: '#0078d4', bgColor: '#deecf9' }
    }
  }

  const { icon, color, bgColor } = getIconAndColor()

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '2rem',
        fontFamily: '"Segoe UI", "Segoe UI Web (West European)", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '2px',
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            background: bgColor,
            borderBottom: `2px solid ${color}`,
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: color,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: 'bold',
              flexShrink: 0
            }}
          >
            {icon}
          </div>
          <h3
            style={{
              margin: 0,
              color: '#323130',
              fontSize: '18px',
              fontWeight: 600,
              flex: 1
            }}
          >
            {title}
          </h3>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '24px',
            color: '#323130',
            fontSize: '14px',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            maxHeight: '400px',
            overflowY: 'auto'
          }}
        >
          {message}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            background: '#f3f2f1',
            display: 'flex',
            justifyContent: 'flex-end',
            borderTop: '1px solid #e0e0e0'
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: '#0078d4',
              color: 'white',
              border: 'none',
              padding: '8px 24px',
              borderRadius: '2px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px',
              fontFamily: 'inherit'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#106ebe'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#0078d4'
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
