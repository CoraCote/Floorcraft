import { useEffect } from 'react'
import { useToastStore, type ToastTone } from '../../stores/toastStore'

const AUTO_DISMISS_MS = 5000

const toneClasses: Record<ToastTone, string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-900',
  success: 'bg-green-50 border-green-200 text-green-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  error: 'bg-red-50 border-red-200 text-red-900',
}

export function Toaster() {
  const items = useToastStore((s) => s.items)
  const dismiss = useToastStore((s) => s.dismiss)

  useEffect(() => {
    if (items.length === 0) return
    // Each toast auto-dismisses independently. We re-register a timer
    // every render keyed on the ids we see; dismissing one mid-flight
    // just removes it from the list and the timer no-ops.
    const timers = items.map((item) =>
      setTimeout(() => dismiss(item.id), AUTO_DISMISS_MS),
    )
    return () => {
      timers.forEach(clearTimeout)
    }
    // Intentionally re-runs on items identity change.
  }, [items, dismiss])

  if (items.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={`border rounded-lg shadow px-3 py-2 text-sm ${toneClasses[item.tone]}`}
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="font-medium">{item.title}</div>
              {item.body && <div className="text-xs mt-0.5 opacity-80">{item.body}</div>}
            </div>
            <button
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
              className="text-current opacity-50 hover:opacity-100 leading-none"
            >
              ×
            </button>
          </div>
          {item.action && (
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => {
                  item.action!.onClick()
                  dismiss(item.id)
                }}
                className="text-xs font-medium underline hover:no-underline"
              >
                {item.action.label}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
