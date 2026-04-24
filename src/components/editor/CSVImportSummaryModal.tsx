import { useUIStore } from '../../stores/uiStore'
import { downloadCSV, skippedRowsToCSV, type ImportIssue } from '../../lib/employeeCsv'
import { useCallback } from 'react'
import { Button, Modal, ModalBody, ModalFooter } from '../ui'

/**
 * Post-import summary. Blocks the editor until dismissed so users can't
 * accidentally miss that 18 rows didn't land. The modal reads straight
 * from `uiStore.csvImportSummary` rather than props because the import
 * dialog has already closed by the time this shows.
 */
export function CSVImportSummaryModal() {
  const summary = useUIStore((s) => s.csvImportSummary)
  const clear = useUIStore((s) => s.setCsvImportSummary)

  const handleDownload = useCallback(() => {
    if (!summary) return
    const csv = skippedRowsToCSV(summary.skipped)
    const ts = new Date().toISOString().slice(0, 10)
    downloadCSV(`skipped-rows-${ts}.csv`, csv)
  }, [summary])

  const handleDone = useCallback(() => clear(null), [clear])

  if (!summary) return null

  const { importedCount, skipped, warnings } = summary
  const allIssues: Array<ImportIssue & { kind: 'skipped' | 'warning' }> = [
    ...skipped.map((i) => ({ ...i, kind: 'skipped' as const })),
    ...warnings.map((i) => ({ ...i, kind: 'warning' as const })),
  ].sort((a, b) => a.rowIndex - b.rowIndex)

  return (
    <Modal open onClose={handleDone} title="Import complete" size="lg">
      <ModalBody>
        <div className="flex gap-4 mb-4 text-sm">
          <span className="text-green-700 dark:text-green-300 font-semibold">
            {`${importedCount} imported`}
          </span>
          <span className="text-red-700 dark:text-red-300 font-semibold">
            {`${skipped.length} skipped`}
          </span>
          <span className="text-amber-700 dark:text-amber-300 font-semibold">
            {`${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`}
          </span>
        </div>

        {allIssues.length > 0 && (
          <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-2 py-1 text-left">Row</th>
                  <th className="px-2 py-1 text-left">Reason</th>
                  <th className="px-2 py-1 text-left">Detail</th>
                </tr>
              </thead>
              <tbody>
                {allIssues.map((i, idx) => (
                  <tr key={idx} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-2 py-1 whitespace-nowrap">
                      Row {i.rowIndex}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span
                        className={
                          i.kind === 'skipped'
                            ? 'text-red-700 dark:text-red-300'
                            : 'text-amber-700 dark:text-amber-300'
                        }
                      >
                        {i.reason}
                      </span>
                    </td>
                    <td className="px-2 py-1">{i.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {skipped.length > 0 && (
          <Button variant="secondary" onClick={handleDownload}>
            Download skipped rows (CSV)
          </Button>
        )}
        <Button variant="primary" onClick={handleDone}>
          Done
        </Button>
      </ModalFooter>
    </Modal>
  )
}
