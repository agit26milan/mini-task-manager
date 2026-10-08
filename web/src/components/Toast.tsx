import { useEffect } from 'react'

export interface ToastState {
  tone: 'ok' | 'quiet' | 'warn'
  title: string
  detail: string
}

interface Props {
  toast: ToastState
  onDismiss: () => void
  duration?: number
}

export function Toast({ toast, onDismiss, duration = 6000 }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [toast, duration, onDismiss])

  return (
    <div className="toast" data-testid="toast" data-tone={toast.tone} role="status" aria-live="polite">
      <span className="title">{toast.title}</span>
      <span className="detail">{toast.detail}</span>
    </div>
  )
}
