import { useEffect, useRef } from 'react'
import { useUIStore } from '../../stores/uiStore'

/**
 * Minimal confirmation dialog. Used anywhere an action destroys data we
 * can't easily recover (bulk delete, row delete). Deliberately small — one
 * title, one body, two buttons.
 *
 * Registers as a modal on the UI store so global keyboard shortcuts stand
 * down while it's open. Escape and backdrop click cancel; Enter confirms
 * the danger action (matches native OS confirm dialogs).
 *
 * `tone="danger"` colors the primary button red. `tone="primary"` is the
 * default neutral blue for confirmations that aren't destructive.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  onCancel,
}: {
  title: string
  body: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}) {
  const registerModalOpen = useUIStore((s) => s.registerModalOpen)
  const registerModalClose = useUIStore((s) => s.registerModalClose)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    registerModalOpen()
    return () => registerModalClose()
  }, [registerModalOpen, registerModalClose])

  // Autofocus the confirm button so Enter triggers it, but the user still
  // has to acknowledge the choice (it's not a one-key-dismiss trap — Tab
  // reaches Cancel, Escape cancels).
  useEffect(() => {
    confirmBtnRef.current?.focus()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
  }

  const primaryClass =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-blue-600 hover:bg-blue-700 text-white'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onKeyDown={onKeyDown}
    >
      <div
        className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full space-y-3 text-sm"
        // Stop clicks on the panel from bubbling to the backdrop — we
        // intentionally don't wire a backdrop-click dismiss here: destructive
        // actions shouldn't be one stray click away from being confirmed.
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold text-gray-900"
        >
          {title}
        </h2>
        <div className="text-gray-600">{body}</div>
        <div className="flex flex-wrap gap-2 justify-end pt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            className={`px-3 py-1.5 rounded ${primaryClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
