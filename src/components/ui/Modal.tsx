import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

type Size = 'sm' | 'md' | 'lg'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  size?: Size
  preventBackdropClose?: boolean
  'aria-labelledby'?: string
  children: ReactNode
}

const SIZE_CLASS: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
}

export function Modal({
  open,
  onClose,
  title,
  size = 'md',
  preventBackdropClose = false,
  'aria-labelledby': ariaLabelledByProp,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const fallbackTitleId = useId()
  const resolvedLabelledBy = ariaLabelledByProp ?? (title ? fallbackTitleId : undefined)

  // Escape listener — only installed while the modal is open so we don't
  // swallow keys from other layers when closed.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Autofocus the panel on open so screen readers land inside the dialog
  // and the Escape handler hears keypresses even when nothing else was
  // focused beforehand.
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
  }, [open])

  if (!open) return null

  function onBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (preventBackdropClose) return
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // Wave 20A: pad the backdrop so a narrow viewport never lets the
  // dialog kiss the screen edge — `p-3 sm:p-4` gives a minimum 12px
  // gutter at 375px while staying generous on tablet+. The dialog
  // itself caps height at `90vh` and scrolls its body so a long form
  // (CSV import preview, share modal) can't overflow off-screen.
  const panel = (
    <div
      className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 flex items-center justify-center p-3 sm:p-4"
      onMouseDown={onBackdropClick}
      data-testid="modal-backdrop"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={resolvedLabelledBy}
        tabIndex={-1}
        className={cn(
          'bg-white dark:bg-gray-900 rounded-lg shadow-lg dark:shadow-xl dark:shadow-black/40 w-full outline-none max-h-[90vh] overflow-y-auto',
          SIZE_CLASS[size],
        )}
      >
        {title ? (
          <ModalHeader titleId={resolvedLabelledBy} onClose={onClose}>
            {title}
          </ModalHeader>
        ) : null}
        {children}
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}

interface ModalHeaderProps {
  children: ReactNode
  onClose?: () => void
  titleId?: string
  className?: string
}

export function ModalHeader({ children, onClose, titleId, className }: ModalHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-800',
        className,
      )}
    >
      <h2 id={titleId} className="text-base font-semibold text-gray-900 dark:text-gray-100">
        {children}
      </h2>
      {onClose ? (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus-visible:ring-blue-500"
        >
          <X size={16} />
        </button>
      ) : null}
    </div>
  )
}

interface ModalBodyProps {
  children: ReactNode
  className?: string
}

export function ModalBody({ children, className }: ModalBodyProps) {
  return <div className={cn('p-4 sm:p-6', className)}>{children}</div>
}

interface ModalFooterProps {
  children: ReactNode
  className?: string
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div className={cn('flex flex-wrap justify-end gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-800', className)}>
      {children}
    </div>
  )
}
