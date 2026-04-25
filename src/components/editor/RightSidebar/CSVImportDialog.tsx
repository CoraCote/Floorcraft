import { useUIStore } from '../../../stores/uiStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import {
  parseEmployeeCSV,
  CSVTooLargeError,
  validateImportRows,
  importEmployees,
  type EmployeeCSVParseResult,
  type ImportIssue,
} from '../../../lib/employeeCsv'
import type { EmployeeImportRow } from '../../../types/employee'
import { emit } from '../../../lib/audit'
import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button, Modal, ModalBody, ModalFooter } from '../../ui'

type Step = 'upload' | 'preview'

type RowStatus = 'valid' | 'warning' | 'error'

interface RowIssue {
  rowIndex: number
  status: RowStatus
  messages: string[]
}

/**
 * Build a per-row status index from the validator output. Skipped rows
 * (blank name, duplicate email) are Errors; warning rows are Warnings;
 * anything not mentioned is Valid. Messages are aggregated so the user
 * can see every reason a row might be skipped/flagged in one tooltip.
 */
function buildRowIssues(
  rows: EmployeeImportRow[],
  skipped: ImportIssue[],
  warnings: ImportIssue[],
): Map<number, RowIssue> {
  const map = new Map<number, RowIssue>()
  for (let i = 0; i < rows.length; i++) {
    map.set(i + 1, { rowIndex: i + 1, status: 'valid', messages: [] })
  }
  for (const w of warnings) {
    const entry = map.get(w.rowIndex)
    if (!entry) continue
    if (entry.status !== 'error') entry.status = 'warning'
    entry.messages.push(w.message)
  }
  for (const s of skipped) {
    const entry = map.get(s.rowIndex)
    if (!entry) continue
    entry.status = 'error'
    entry.messages.push(s.message)
  }
  return map
}

function StatusBadge({ status }: { status: RowStatus }) {
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300">
        <AlertCircle size={12} aria-hidden="true" />
        <span>Error</span>
      </span>
    )
  }
  if (status === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
        <AlertTriangle size={12} aria-hidden="true" />
        <span>Warning</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300">
      <CheckCircle2 size={12} aria-hidden="true" />
      <span>Valid</span>
    </span>
  )
}

export function CSVImportDialog() {
  const open = useUIStore((s) => s.csvImportOpen)
  const setOpen = useUIStore((s) => s.setCsvImportOpen)
  const addEmployee = useEmployeeStore((s) => s.addEmployee)
  const updateEmployee = useEmployeeStore((s) => s.updateEmployee)

  const [step, setStep] = useState<Step>('upload')
  const [csvText, setCsvText] = useState('')
  const [preview, setPreview] = useState<EmployeeCSVParseResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const continueBtnRef = useRef<HTMLButtonElement | null>(null)

  // Reset all internal state whenever the dialog is closed externally so a
  // subsequent open() starts fresh. Keeping this in an effect rather than
  // a close-button handler means callers (PeoplePanel, RosterPage) don't
  // need to know about the two-step internals.
  useEffect(() => {
    if (!open) {
      setStep('upload')
      setCsvText('')
      setPreview(null)
      setParseError(null)
      setSelected(new Set())
    }
  }, [open])

  // Existing-employee snapshot is captured once per preview build. It's
  // used both for per-row issue display (preview step) and for the final
  // commit. Captured at Continue time so the preview reflects what the
  // user would see if they Imported right now.
  const existingReduced = useMemo(() => {
    const existing = useEmployeeStore.getState().employees
    const out: Record<string, { id: string; name: string; email: string | null }> = {}
    for (const [id, e] of Object.entries(existing)) {
      out[id] = { id, name: e.name, email: e.email || null }
    }
    return out
    // Recompute only when we enter the preview step. Using `step` as the
    // dep intentionally — the store snapshot is a side-effecty read and
    // shouldn't subscribe to every employee edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const validation = useMemo(() => {
    if (!preview) return null
    return validateImportRows(preview.rows, existingReduced)
  }, [preview, existingReduced])

  const rowIssues = useMemo(() => {
    if (!preview || !validation) return new Map<number, RowIssue>()
    return buildRowIssues(preview.rows, validation.skipped, validation.warnings)
  }, [preview, validation])

  // Whether the file has a `floor` column. The parser doesn't surface
  // floor as a typed field today, but we still want to display it if a
  // user's spreadsheet includes it — fall back to raw row dictionary
  // access via the EmployeeImportRow index signature.
  const hasFloorColumn = useMemo(() => {
    if (!preview) return false
    return preview.headers.some((h) => h.toLowerCase() === 'floor')
  }, [preview])

  const handleContinue = useCallback(() => {
    setParseError(null)
    try {
      const result = parseEmployeeCSV(csvText)
      setPreview(result)

      // Default selection: valid + warning rows checked; error rows
      // unchecked. The user can toggle errors on at their own risk.
      // Uses a fresh validator run against the current store snapshot
      // rather than the `validation` memo, which only settles once
      // `step` flips to 'preview'.
      const snapshot = snapshotExistingReduced()
      const { skipped, warnings } = validateImportRows(result.rows, snapshot)
      const issues = buildRowIssues(result.rows, skipped, warnings)
      const next = new Set<number>()
      for (const [idx, issue] of issues) {
        if (issue.status !== 'error') next.add(idx)
      }
      setSelected(next)
      setStep('preview')
    } catch (err) {
      if (err instanceof CSVTooLargeError) {
        setParseError(err.message)
      } else {
        setParseError(err instanceof Error ? err.message : String(err))
      }
      setPreview(null)
    }
  }, [csvText])

  // Snapshot the store's employees into the shape the validator and
  // importer both expect. Kept as a plain helper because the handlers
  // below call it imperatively; the `existingReduced` memo handles the
  // render-time variant.
  function snapshotExistingReduced() {
    const existing = useEmployeeStore.getState().employees
    const reduced: Record<string, { id: string; name: string; email: string | null }> = {}
    for (const [id, e] of Object.entries(existing)) {
      reduced[id] = { id, name: e.name, email: e.email || null }
    }
    return reduced
  }

  const handleBack = useCallback(() => {
    // Keep csvText so the user doesn't have to re-upload. Preview and
    // selection reset so Continue recomputes against the (possibly
    // edited) text.
    setStep('upload')
    setPreview(null)
    setSelected(new Set())
    setParseError(null)
  }, [])

  const handleImport = useCallback(() => {
    if (!preview) return

    // Filter the parsed rows down to just what the user selected, then
    // hand the filtered list back to the real validator so the skipped/
    // warning buckets in the summary modal only reflect what the user
    // chose to import. We can't just reuse the full-set validation
    // because unselected errors shouldn't be counted as "skipped" —
    // they were consciously excluded, not rejected.
    const chosenRows: EmployeeImportRow[] = []
    preview.rows.forEach((r, idx) => {
      if (selected.has(idx + 1)) chosenRows.push(r)
    })

    const { valid, skipped, warnings } = validateImportRows(chosenRows, existingReduced)
    const { imported } = importEmployees({
      valid,
      existing: existingReduced,
      addEmployee: addEmployee as never,
      updateEmployee,
    })

    useUIStore.getState().setCsvImportSummary({
      importedCount: imported.length,
      skipped,
      warnings,
    })
    void emit('csv.import', 'csv', null, { count: imported.length })
    setOpen(false)
  }, [preview, selected, existingReduced, addEmployee, updateEmployee, setOpen])

  // Bulk selection helpers.
  const selectAll = useCallback(() => {
    if (!preview) return
    const next = new Set<number>()
    for (let i = 1; i <= preview.rows.length; i++) next.add(i)
    setSelected(next)
  }, [preview])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
  }, [])

  const selectAllValid = useCallback(() => {
    const next = new Set<number>()
    for (const [idx, issue] of rowIssues) {
      if (issue.status !== 'error') next.add(idx)
    }
    setSelected(next)
  }, [rowIssues])

  const toggleRow = useCallback((rowIndex: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      return next
    })
  }, [])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvText((ev.target?.result as string) || '')
    }
    reader.readAsText(file)
  }, [])

  // Move focus into the preview when we enter it so keyboard users don't
  // have to tab back through the upload controls.
  useEffect(() => {
    if (step !== 'preview') return
    // Defer to let the DOM settle before focusing.
    const raf = requestAnimationFrame(() => {
      continueBtnRef.current?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [step])

  const selectedCount = selected.size
  const totalRows = preview?.rows.length ?? 0

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Import Employees from CSV" size="lg">
      {step === 'upload' && (
        <>
          <ModalBody>
            <div className="mb-3">
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                Upload CSV file or paste below
              </label>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="text-sm mb-2"
              />
              <textarea
                className="w-full h-32 border border-gray-200 dark:border-gray-800 rounded-lg p-3 text-sm font-mono focus:outline-none focus:border-blue-400"
                placeholder={`name,email,department,team,title,type,office_days,tags\nJane Smith,jane@co.com,Engineering,Frontend,Senior Engineer,full-time,"Mon,Wed,Fri",standing-desk`}
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value)
                  setParseError(null)
                }}
                aria-invalid={!!parseError}
                aria-describedby={parseError ? 'csv-parse-error' : undefined}
              />
            </div>

            {parseError && (
              <p
                id="csv-parse-error"
                role="alert"
                className="text-xs text-red-600 dark:text-red-400 mt-1 mb-3"
              >
                {parseError}
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleContinue}
              disabled={!csvText.trim()}
            >
              Continue
            </Button>
          </ModalFooter>
        </>
      )}

      {step === 'preview' && preview && (
        <>
          <ModalBody>
            {preview.errors.length > 0 && (
              <div
                role="alert"
                className="mb-3 text-xs text-red-600 dark:text-red-400"
              >
                {preview.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}

            {preview.rows.length === 0 ? (
              <div
                role="status"
                className="py-10 text-center text-sm text-gray-500 dark:text-gray-400"
              >
                No data detected
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      ref={continueBtnRef}
                      variant="secondary"
                      onClick={selectAllValid}
                    >
                      Select all valid
                    </Button>
                    <Button variant="ghost" onClick={selectAll}>
                      Select all
                    </Button>
                    <Button variant="ghost" onClick={clearSelection}>
                      Clear selection
                    </Button>
                  </div>
                  <span
                    className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    aria-live="polite"
                  >
                    {`${selectedCount} of ${totalRows} selected`}
                  </span>
                </div>

                <div className="max-h-72 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded">
                  <table role="table" className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left w-8" aria-label="Include"></th>
                        <th className="px-2 py-1 text-left w-10">#</th>
                        <th className="px-2 py-1 text-left">Name</th>
                        <th className="px-2 py-1 text-left">Email</th>
                        <th className="px-2 py-1 text-left">Department</th>
                        <th className="px-2 py-1 text-left">Status</th>
                        {hasFloorColumn && (
                          <th className="px-2 py-1 text-left">Floor</th>
                        )}
                        <th className="px-2 py-1 text-left">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, i) => {
                        const rowIndex = i + 1
                        const issue = rowIssues.get(rowIndex)
                        const status: RowStatus = issue?.status ?? 'valid'
                        const checked = selected.has(rowIndex)
                        const rowCls =
                          status === 'error'
                            ? 'bg-red-50 dark:bg-red-900/20'
                            : status === 'warning'
                              ? 'bg-amber-50 dark:bg-amber-900/20'
                              : ''
                        const tooltip = issue?.messages.join('; ') || undefined
                        return (
                          <tr
                            key={i}
                            className={`border-t border-gray-100 dark:border-gray-800 ${rowCls}`}
                            title={tooltip}
                          >
                            <td className="px-2 py-1">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleRow(rowIndex)}
                                aria-label={
                                  checked
                                    ? `Skip row ${rowIndex}`
                                    : `Include row ${rowIndex}`
                                }
                              />
                            </td>
                            <td className="px-2 py-1 text-gray-500">{rowIndex}</td>
                            <td className="px-2 py-1">{r.name || '\u2014'}</td>
                            <td className="px-2 py-1">{r.email || '\u2014'}</td>
                            <td className="px-2 py-1">{r.department || '\u2014'}</td>
                            <td className="px-2 py-1">{r.status || '\u2014'}</td>
                            {hasFloorColumn && (
                              <td className="px-2 py-1">{r.floor || '\u2014'}</td>
                            )}
                            <td className="px-2 py-1">
                              <StatusBadge status={status} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={handleBack}>
              Back
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={selectedCount === 0}
            >
              {`Import ${selectedCount} ${selectedCount === 1 ? 'row' : 'rows'}`}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  )
}
