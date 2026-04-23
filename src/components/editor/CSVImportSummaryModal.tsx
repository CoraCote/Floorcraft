import { useUIStore } from '../../stores/uiStore'
import { downloadCSV, skippedRowsToCSV, type ImportIssue } from '../../lib/employeeCsv'
import { useCallback, useEffect } from 'react'

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

  useEffect(() => {
    if (!summary) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [summary, handleDone])

  if (!summary) return null

  const { importedCount, skipped, warnings } = summary
  const allIssues: Array<ImportIssue & { kind: 'skipped' | 'warning' }> = [
    ...skipped.map((i) => ({ ...i, kind: 'skipped' as const })),
    ...warnings.map((i) => ({ ...i, kind: 'warning' as const })),
  ].sort((a, b) => a.rowIndex - b.rowIndex)

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-summary-title"
    >
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-xl w-full mx-4">
        <h2 id="csv-summary-title" className="text-lg font-semibold mb-4">
          Import complete
        </h2>
        <div className="flex gap-4 mb-4 text-sm">
          <span className="text-green-700 font-semibold">
            {`${importedCount} imported`}
          </span>
          <span className="text-red-700 font-semibold">
            {`${skipped.length} skipped`}
          </span>
          <span className="text-amber-700 font-semibold">
            {`${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`}
          </span>
        </div>

        {allIssues.length > 0 && (
          <div className="mb-4 max-h-60 overflow-y-auto border border-gray-200 rounded">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1 text-left">Row</th>
                  <th className="px-2 py-1 text-left">Reason</th>
                  <th className="px-2 py-1 text-left">Detail</th>
                </tr>
              </thead>
              <tbody>
                {allIssues.map((i, idx) => (
                  <tr key={idx} className="border-t border-gray-100">
                    <td className="px-2 py-1 whitespace-nowrap">
                      Row {i.rowIndex}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span
                        className={
                          i.kind === 'skipped'
                            ? 'text-red-700'
                            : 'text-amber-700'
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

        <div className="flex gap-2 justify-end">
          {skipped.length > 0 && (
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Download skipped rows (CSV)
            </button>
          )}
          <button
            onClick={handleDone}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
