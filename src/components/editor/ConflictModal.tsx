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
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-modal-title"
    >
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full space-y-3 text-sm">
        <h2 id="conflict-modal-title" className="text-base font-semibold text-gray-900">
          This office was edited by someone else
        </h2>
        <p className="text-gray-600">
          Since you opened it, a teammate saved changes. Choose how to proceed — your
          unsaved edits are still here until you pick Reload.
        </p>
        <div className="flex flex-wrap gap-2 justify-end pt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded"
          >
            Cancel
          </button>
          <button
            onClick={onReload}
            className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-gray-800"
          >
            Reload their version
          </button>
          <button
            onClick={onOverwrite}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded"
          >
            Overwrite theirs
          </button>
        </div>
      </div>
    </div>
  )
}
