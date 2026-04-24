import { Button, Modal, ModalBody, ModalFooter } from '../ui'

/**
 * Shown by `ProjectShell` when `useOfficeSync` raises a conflict (a
 * teammate saved after we opened the office). Three choices:
 *
 *  - Cancel  — dismiss the modal, keep editing; next save will try again
 *              against the old version and re-raise this same modal.
 *  - Reload  — drop local edits, reload the page so we re-fetch the
 *              teammate's version.
 *  - Overwrite — call `saveOfficeForce` to clobber the remote version
 *                with our in-memory payload.
 *
 * The wording is deliberately human: users shouldn't need to know what
 * "updated_at" means to make a safe choice.
 */
export function ConflictModal({
  onReload,
  onOverwrite,
  onCancel,
}: {
  onReload: () => void
  onOverwrite: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      open
      onClose={onCancel}
      title="This office was edited by someone else"
    >
      <ModalBody className="space-y-3 text-sm">
        <p className="text-gray-600 dark:text-gray-300">
          Since you opened it, a teammate saved changes. Choose how to proceed — your
          unsaved edits are still here until you pick Reload.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={onReload}>
          Reload their version
        </Button>
        <Button variant="danger" onClick={onOverwrite}>
          Overwrite theirs
        </Button>
      </ModalFooter>
    </Modal>
  )
}
