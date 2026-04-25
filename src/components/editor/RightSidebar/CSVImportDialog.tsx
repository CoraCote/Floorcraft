import { useUIStore } from '../../../stores/uiStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import {
  parseEmployeeCSV,
  CSVTooLargeError,
  validateImportRows,
  importEmployees,
  buildEmployeeImportTemplate,
  downloadCSV,
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
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  UploadCloud,
  FileText,
  Download,
} from 'lucide-react'
import { Button, Modal, ModalBody, ModalFooter } from '../../ui'

type Step = 'upload' | 'preview'

type RowStatus = 'valid' | 'warning' | 'error'

type FilterValue = 'all' | 'valid' | 'warning' | 'error'

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

/**
 * Drag-and-drop file zone with three visual states (idle / drag-over /
 * file-loaded). Uses a ref-counted depth tracker for drag-enter/leave so
 * crossing child element boundaries inside the zone doesn't flicker the
 * "drag-over" state. The hidden <input type="file"> is wired through a
 * ref so a click on the zone (or Enter/Space when focused) opens the
 * native picker.
 */
interface DropZoneProps {
  fileName: string | null
  rowCount: number | null
  onFile: (file: File) => void
  onClear: () => void
}

function DropZone({ fileName, rowCount, onFile, onClear }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const dragDepthRef = useRef(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const openPicker = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openPicker()
      }
    },
    [openPicker],
  )

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragDepthRef.current += 1
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragDepthRef.current -= 1
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0
      setDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // dragover MUST preventDefault for drop to fire on the same element.
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      dragDepthRef.current = 0
      setDragOver(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) onFile(file)
    },
    [onFile],
  )

  const baseCls =
    'relative w-full min-h-[120px] flex items-center justify-center text-center px-4 py-6 border-2 border-dashed rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400'
  const stateCls = dragOver
    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
    : fileName
      ? 'border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-900/10'
      : 'border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40'

  const ariaLabel = fileName
    ? `CSV ready: ${fileName}. Click to replace, or drop a new file.`
    : 'Drop your CSV here, or click to browse'

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className={`${baseCls} ${stateCls}`}
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-testid="csv-drop-zone"
      data-state={dragOver ? 'drag-over' : fileName ? 'file-loaded' : 'idle'}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,text/csv"
        className="sr-only"
        // Stop click bubble: the parent zone's onClick *also* opens the
        // picker, so a click on the input would re-trigger openPicker
        // and (in some browsers) cycle the dialog open/close.
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          // Reset so re-selecting the same file fires onChange.
          e.target.value = ''
        }}
      />
      {dragOver ? (
        <div className="text-sm font-medium text-blue-700 dark:text-blue-200">
          Release to upload
        </div>
      ) : fileName ? (
        <div className="flex items-center gap-3">
          <FileText size={28} className="text-green-700 dark:text-green-400" aria-hidden="true" />
          <div className="text-left">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {fileName}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {rowCount !== null ? `${rowCount} row${rowCount === 1 ? '' : 's'}` : 'Loaded — click Continue to preview'}
            </div>
          </div>
          <button
            type="button"
            className="ml-2 text-xs text-blue-600 dark:text-blue-400 underline hover:no-underline"
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
          >
            Replace
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-gray-600 dark:text-gray-300">
          <UploadCloud size={28} aria-hidden="true" />
          <div className="text-sm font-medium">
            Drop your CSV here, or click to browse
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            First row should be column headers
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Status filter pill bar above the preview table. Counts come from the
 * row-issues map so they update when the user inline-edits a row and
 * the validator re-runs.
 */
interface FilterBarProps {
  value: FilterValue
  counts: { all: number; valid: number; warning: number; error: number }
  onChange: (value: FilterValue) => void
}

function FilterBar({ value, counts, onChange }: FilterBarProps) {
  const pill = (k: FilterValue, label: string, count: number) => {
    const active = value === k
    const cls = active
      ? 'bg-blue-600 text-white border-blue-600'
      : 'bg-transparent text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
    return (
      <button
        key={k}
        type="button"
        aria-pressed={active}
        className={`px-2.5 py-1 text-xs rounded-full border ${cls}`}
        onClick={() => onChange(k)}
      >
        {`${label} (${count})`}
      </button>
    )
  }
  return (
    <div role="group" aria-label="Row filter" className="flex items-center gap-1.5 flex-wrap">
      {pill('all', 'All', counts.all)}
      {pill('valid', 'Valid', counts.valid)}
      {pill('warning', 'Warnings', counts.warning)}
      {pill('error', 'Errors', counts.error)}
    </div>
  )
}

export function CSVImportDialog() {
  const open = useUIStore((s) => s.csvImportOpen)
  const setOpen = useUIStore((s) => s.setCsvImportOpen)
  const addEmployee = useEmployeeStore((s) => s.addEmployee)
  const updateEmployee = useEmployeeStore((s) => s.updateEmployee)

  const [step, setStep] = useState<Step>('upload')
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<EmployeeCSVParseResult | null>(null)
  // Mutable copy of preview rows so inline edits persist across re-renders
  // without rebuilding the whole parse result. Kept aligned with
  // preview.rows by length; we only mutate `name`/`email` cells.
  const [editedRows, setEditedRows] = useState<EmployeeImportRow[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<FilterValue>('all')
  // Inline edit state. `editingRow` holds the 1-based row index being
  // edited; `editingField` is which cell ('name' or 'email');
  // `editingValue` is the in-flight string. Escape reverts; Enter or
  // blur commits.
  const [editingRow, setEditingRow] = useState<number | null>(null)
  const [editingField, setEditingField] = useState<'name' | 'email' | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [aliasBannerDismissed, setAliasBannerDismissed] = useState(false)

  const continueBtnRef = useRef<HTMLButtonElement | null>(null)

  // Reset all internal state whenever the dialog is closed externally so a
  // subsequent open() starts fresh. Keeping this in an effect rather than
  // a close-button handler means callers (PeoplePanel, RosterPage) don't
  // need to know about the two-step internals.
  useEffect(() => {
    if (!open) {
      setStep('upload')
      setCsvText('')
      setFileName(null)
      setPreview(null)
      setEditedRows(null)
      setParseError(null)
      setSelected(new Set())
      setFilter('all')
      setEditingRow(null)
      setEditingField(null)
      setEditingValue('')
      setAliasBannerDismissed(false)
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

  // Working row set: editedRows when present, otherwise the original
  // parse output. The validator re-runs whenever this changes so inline
  // edits update badges live.
  const workingRows = useMemo(() => {
    if (editedRows) return editedRows
    return preview?.rows ?? []
  }, [editedRows, preview])

  const validation = useMemo(() => {
    if (!preview) return null
    return validateImportRows(workingRows, existingReduced)
  }, [preview, workingRows, existingReduced])

  const rowIssues = useMemo(() => {
    if (!preview || !validation) return new Map<number, RowIssue>()
    return buildRowIssues(workingRows, validation.skipped, validation.warnings)
  }, [preview, validation, workingRows])

  // Whether the file has a `floor` column. The parser doesn't surface
  // floor as a typed field today, but we still want to display it if a
  // user's spreadsheet includes it — fall back to raw row dictionary
  // access via the EmployeeImportRow index signature.
  const hasFloorColumn = useMemo(() => {
    if (!preview) return false
    return preview.headers.some((h) => h.toLowerCase() === 'floor')
  }, [preview])

  // Row-status counts for the filter bar pills.
  const filterCounts = useMemo(() => {
    let valid = 0
    let warning = 0
    let error = 0
    for (const issue of rowIssues.values()) {
      if (issue.status === 'valid') valid++
      else if (issue.status === 'warning') warning++
      else error++
    }
    return { all: rowIssues.size, valid, warning, error }
  }, [rowIssues])

  // Visible (filtered) row indices, 1-based, in original order. Used by
  // the bulk-select buttons so they operate on the current filter.
  const visibleIndices = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < workingRows.length; i++) {
      const idx = i + 1
      const issue = rowIssues.get(idx)
      const status = issue?.status ?? 'valid'
      if (filter === 'all' || status === filter) {
        out.push(idx)
      }
    }
    return out
  }, [workingRows, rowIssues, filter])

  const handleContinue = useCallback(() => {
    setParseError(null)
    try {
      const result = parseEmployeeCSV(csvText)
      setPreview(result)
      setEditedRows(result.rows.map((r) => ({ ...r })))

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
      setFilter('all')
      setStep('preview')
    } catch (err) {
      if (err instanceof CSVTooLargeError) {
        setParseError(err.message)
      } else {
        setParseError(err instanceof Error ? err.message : String(err))
      }
      setPreview(null)
      setEditedRows(null)
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
    setEditedRows(null)
    setSelected(new Set())
    setParseError(null)
    setFilter('all')
  }, [])

  const handleImport = useCallback(() => {
    if (!preview) return

    // Filter the (possibly edited) parsed rows down to just what the
    // user selected, then hand the filtered list back to the real
    // validator so the skipped/warning buckets in the summary modal
    // only reflect what the user chose to import. We can't just reuse
    // the full-set validation because unselected errors shouldn't be
    // counted as "skipped" — they were consciously excluded, not
    // rejected.
    const sourceRows = editedRows ?? preview.rows
    const chosenRows: EmployeeImportRow[] = []
    sourceRows.forEach((r, idx) => {
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
  }, [preview, editedRows, selected, existingReduced, addEmployee, updateEmployee, setOpen])

  // Bulk selection helpers — operate on the CURRENTLY-FILTERED set so
  // the filter bar can be used to scope a bulk action (e.g. "show
  // errors → select all → Import" to deliberately import error rows).
  const selectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const idx of visibleIndices) next.add(idx)
      return next
    })
  }, [visibleIndices])

  const clearSelection = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const idx of visibleIndices) next.delete(idx)
      return next
    })
  }, [visibleIndices])

  const selectAllValid = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const idx of visibleIndices) {
        const issue = rowIssues.get(idx)
        if ((issue?.status ?? 'valid') !== 'error') next.add(idx)
        else next.delete(idx)
      }
      return next
    })
  }, [visibleIndices, rowIssues])

  const toggleRow = useCallback((rowIndex: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      return next
    })
  }, [])

  const handleFile = useCallback((file: File) => {
    setFileName(file.name)
    setParseError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvText((ev.target?.result as string) || '')
    }
    reader.readAsText(file)
  }, [])

  const handleClearFile = useCallback(() => {
    setFileName(null)
    setCsvText('')
    setParseError(null)
  }, [])

  const handleDownloadTemplate = useCallback(() => {
    const csv = buildEmployeeImportTemplate()
    downloadCSV('floorcraft-employee-import-template.csv', csv)
  }, [])

  // Inline edit commit/cancel helpers.
  const beginEdit = useCallback(
    (rowIndex: number, field: 'name' | 'email', currentValue: string) => {
      setEditingRow(rowIndex)
      setEditingField(field)
      setEditingValue(currentValue)
    },
    [],
  )

  const cancelEdit = useCallback(() => {
    setEditingRow(null)
    setEditingField(null)
    setEditingValue('')
  }, [])

  const commitEdit = useCallback(() => {
    if (editingRow === null || editingField === null) return
    setEditedRows((prev) => {
      if (!prev) return prev
      const next = prev.slice()
      const i = editingRow - 1
      if (i < 0 || i >= next.length) return prev
      next[i] = { ...next[i], [editingField]: editingValue }
      return next
    })
    setEditingRow(null)
    setEditingField(null)
    setEditingValue('')
  }, [editingRow, editingField, editingValue])

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
  const totalRows = workingRows.length

  // Whether to show the headers-matched banner. Aliases applied OR
  // first/last concatenation triggered → worth surfacing.
  const showAliasBanner =
    !!preview &&
    !aliasBannerDismissed &&
    (Object.keys(preview.headerAliases).length > 0 ||
      preview.firstLastConcatenated)

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Import Employees from CSV" size="lg">
      {step === 'upload' && (
        <>
          <ModalBody>
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm text-gray-600 dark:text-gray-300">
                  Upload a CSV file
                </label>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Download size={12} aria-hidden="true" />
                  Download template
                </button>
              </div>
              <DropZone
                fileName={fileName}
                rowCount={null}
                onFile={handleFile}
                onClear={handleClearFile}
              />
              <details className="mt-3">
                <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
                  Or paste CSV directly
                </summary>
                <textarea
                  className="mt-2 w-full h-32 border border-gray-200 dark:border-gray-800 rounded-lg p-3 text-sm font-mono focus:outline-none focus:border-blue-400"
                  placeholder={`name,email,department,team,title,type,office_days,tags\nJane Smith,jane@co.com,Engineering,Frontend,Senior Engineer,full-time,"Mon,Wed,Fri",standing-desk`}
                  value={csvText}
                  onChange={(e) => {
                    setCsvText(e.target.value)
                    setParseError(null)
                  }}
                  aria-invalid={!!parseError}
                  aria-describedby={parseError ? 'csv-parse-error' : undefined}
                />
              </details>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Common HRIS exports work as-is — column names like
                {' '}<code className="font-mono">First Name</code>,{' '}
                <code className="font-mono">Email Address</code>,{' '}
                <code className="font-mono">Job Title</code>, and{' '}
                <code className="font-mono">Reports To</code> are recognised.
              </p>
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

            {showAliasBanner && (
              <div
                role="status"
                data-testid="alias-banner"
                className="mb-3 px-3 py-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 text-xs text-blue-900 dark:text-blue-100 flex items-start justify-between gap-2"
              >
                <div className="flex-1">
                  <div className="font-medium mb-0.5">Headers matched</div>
                  <div className="text-blue-800 dark:text-blue-200">
                    {Object.keys(preview.headerAliases).length > 0 && (
                      <span>
                        {Object.entries(preview.headerAliases)
                          .map(([orig, canon]) => `"${orig}" → ${canon}`)
                          .join(', ')}
                      </span>
                    )}
                    {preview.firstLastConcatenated && (
                      <span>
                        {Object.keys(preview.headerAliases).length > 0 ? '. ' : ''}
                        Combined first_name + last_name into name.
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-blue-700 dark:text-blue-300 hover:underline shrink-0"
                  onClick={() => setAliasBannerDismissed(true)}
                  aria-label="Dismiss headers matched notice"
                >
                  Dismiss
                </button>
              </div>
            )}

            {workingRows.length === 0 ? (
              <div
                role="status"
                className="py-10 text-center text-sm text-gray-500 dark:text-gray-400"
              >
                No data detected
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <FilterBar value={filter} counts={filterCounts} onChange={setFilter} />
                  <span
                    className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    aria-live="polite"
                  >
                    {`${selectedCount} of ${totalRows} selected`}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-2 flex-wrap">
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
                      {workingRows.map((r, i) => {
                        const rowIndex = i + 1
                        const issue = rowIssues.get(rowIndex)
                        const status: RowStatus = issue?.status ?? 'valid'
                        // Filter: hide rows whose status doesn't match.
                        if (filter !== 'all' && status !== filter) return null
                        const checked = selected.has(rowIndex)
                        const rowCls =
                          status === 'error'
                            ? 'bg-red-50 dark:bg-red-900/20'
                            : status === 'warning'
                              ? 'bg-amber-50 dark:bg-amber-900/20'
                              : ''
                        const tooltip = issue?.messages.join('; ') || undefined
                        const isEditingName =
                          editingRow === rowIndex && editingField === 'name'
                        const isEditingEmail =
                          editingRow === rowIndex && editingField === 'email'
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
                            <td className="px-2 py-1">
                              {isEditingName ? (
                                <input
                                  autoFocus
                                  type="text"
                                  className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs bg-white dark:bg-gray-900"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={commitEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      commitEdit()
                                    } else if (e.key === 'Escape') {
                                      // Modal's Escape listener is at the
                                      // window level. Use the native
                                      // stopImmediatePropagation so the
                                      // dialog doesn't close when the user
                                      // is just cancelling an inline edit.
                                      e.preventDefault()
                                      e.nativeEvent.stopImmediatePropagation()
                                      cancelEdit()
                                    }
                                  }}
                                  aria-label={`Edit name for row ${rowIndex}`}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="text-left w-full hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-1 py-0.5 -mx-1"
                                  onClick={() => beginEdit(rowIndex, 'name', r.name || '')}
                                  aria-label={`Edit name "${r.name || 'blank'}" for row ${rowIndex}`}
                                >
                                  {r.name || '—'}
                                </button>
                              )}
                            </td>
                            <td className="px-2 py-1">
                              {isEditingEmail ? (
                                <input
                                  autoFocus
                                  type="text"
                                  className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs bg-white dark:bg-gray-900"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={commitEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      commitEdit()
                                    } else if (e.key === 'Escape') {
                                      // Modal's Escape listener is at the
                                      // window level. Use the native
                                      // stopImmediatePropagation so the
                                      // dialog doesn't close when the user
                                      // is just cancelling an inline edit.
                                      e.preventDefault()
                                      e.nativeEvent.stopImmediatePropagation()
                                      cancelEdit()
                                    }
                                  }}
                                  aria-label={`Edit email for row ${rowIndex}`}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="text-left w-full hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-1 py-0.5 -mx-1"
                                  onClick={() => beginEdit(rowIndex, 'email', r.email || '')}
                                  aria-label={`Edit email "${r.email || 'blank'}" for row ${rowIndex}`}
                                >
                                  {r.email || '—'}
                                </button>
                              )}
                            </td>
                            <td className="px-2 py-1">{r.department || '—'}</td>
                            <td className="px-2 py-1">{r.status || '—'}</td>
                            {hasFloorColumn && (
                              <td className="px-2 py-1">{r.floor || '—'}</td>
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
