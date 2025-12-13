import clsx from 'clsx'
import type { Toast as ToastType } from '../../stores/uiStore'

interface ToastProps {
  toast: ToastType
  onDismiss: (id: string) => void
}

const iconMap = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
}

const styleMap = {
  success: 'bg-success/20 border-success/30 text-success',
  error: 'bg-error/20 border-error/30 text-error',
  warning: 'bg-warning/20 border-warning/30 text-warning',
  info: 'bg-accent-primary/20 border-accent-primary/30 text-accent-primary',
}

export function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm',
        'animate-slide-in shadow-lg',
        styleMap[toast.type]
      )}
    >
      <span className="text-lg font-bold">{iconMap[toast.type]}</span>
      <p className="flex-1 text-sm font-medium text-text-primary">
        {toast.message}
      </p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-text-muted hover:text-text-primary transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
