import { useState } from 'react'
import { Button, Modal, ModalBody, ModalFooter } from '../ui'
import { usePdfPagePickerStore } from '../../stores/pdfPagePickerStore'

/**
 * Drafting Studio dialog that asks "which page of this PDF do you want
 * to trace over?" when an operator drops a multi-page PDF onto the
 * canvas. Single-page PDFs skip this dialog entirely; the
 * `insertPdfUnderlay` helper only opens the store when `numPages > 1`.
 *
 * Mount once in `MapView`. The store handles open/close + the
 * `Promise` that resumes the rasterization flow with the chosen page
 * (or `null` on cancel). State here is purely the in-flight number
 * input — fresh mount per open via the conditional render in
 * `MapView`, so no reset logic.
 */
export function PdfPagePickerDialog() {
  const numPages = usePdfPagePickerStore((s) => s.numPages)
  const pick = usePdfPagePickerStore((s) => s.pick)
  if (numPages === null) return null
  return <Inner numPages={numPages} onPick={pick} />
}

function Inner({
  numPages,
  onPick,
}: {
  numPages: number
  onPick: (page: number | null) => void
}) {
  const [page, setPage] = useState(1)
  const clamped = Math.min(Math.max(1, Math.floor(page) || 1), numPages)
  return (
    <Modal
      open
      onClose={() => onPick(null)}
      title={`Pick a page to trace`}
      size="sm"
    >
      <ModalBody>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          This PDF has {numPages} pages. Which one is your floor plan?
        </p>
        <label
          htmlFor="pdf-page-picker"
          className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1"
        >
          Page number
        </label>
        <input
          id="pdf-page-picker"
          type="number"
          min={1}
          max={numPages}
          step={1}
          autoFocus
          value={page}
          onChange={(e) => setPage(Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onPick(clamped)
            }
          }}
          className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
        />
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
          1 to {numPages}. Only one page imports at a time — drop the same
          PDF again to import another.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" type="button" onClick={() => onPick(null)}>
          Cancel
        </Button>
        <Button variant="primary" type="button" onClick={() => onPick(clamped)}>
          Insert page {clamped}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
