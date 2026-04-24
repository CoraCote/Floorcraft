import { useEffect, useRef } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { Button, Modal, ModalBody, ModalFooter } from '../ui'

/**
 * Minimal confirmation dialog. Used anywhere an action destroys data we
 * can't easily recover (bulk delete, row delete). Deliberately small — one
 * title, one body, two buttons.
 *
 * Registers as a modal on the UI store so global keyboard shortcuts stand
 * down while it's open. Escape cancels; Enter confirms the danger action
 * (matches native OS confirm dialogs).
 *
 * Backdrop click does NOT cancel — destructive actions shouldn't be one
 * stray click away from being confirmed.
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

  return (
    <Modal open onClose={onCancel} title={title} preventBackdropClose>
      <ModalBody className="text-sm text-gray-600 dark:text-gray-300">{body}</ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          ref={confirmBtnRef}
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
