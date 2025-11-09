interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div
      onClick={onCancel}
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
          maxWidth: '450px',
          width: '100%',
          boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e0e0e0'
          }}
        >
          <h3
            style={{
              margin: 0,
              color: '#323130',
              fontSize: '18px',
              fontWeight: 600
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
            whiteSpace: 'pre-wrap'
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
            gap: '12px',
            borderTop: '1px solid #e0e0e0'
          }}
        >
          <button
            onClick={onCancel}
            style={{
              background: 'white',
              color: '#323130',
              border: '1px solid #8a8886',
              padding: '8px 24px',
              borderRadius: '2px',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '14px',
              fontFamily: 'inherit'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f3f2f1'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white'
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: '#d13438',
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
              e.currentTarget.style.background = '#a4262c'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#d13438'
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
