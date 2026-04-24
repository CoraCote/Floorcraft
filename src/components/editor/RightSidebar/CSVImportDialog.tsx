import { useUIStore } from '../../../stores/uiStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import {
  parseEmployeeCSV,
  CSVTooLargeError,
  validateImportRows,
  importEmployees,
} from '../../../lib/employeeCsv'
import { emit } from '../../../lib/audit'
import { useState, useCallback } from 'react'
import { Button, Modal, ModalBody, ModalFooter } from '../../ui'

export function CSVImportDialog() {
  const open = useUIStore((s) => s.csvImportOpen)
  const setOpen = useUIStore((s) => s.setCsvImportOpen)
  const addEmployee = useEmployeeStore((s) => s.addEmployee)
  const updateEmployee = useEmployeeStore((s) => s.updateEmployee)

  const [csvText, setCsvText] = useState('')
  const [preview, setPreview] = useState<ReturnType<typeof parseEmployeeCSV> | null>(null)
  const [sizeError, setSizeError] = useState<string | null>(null)

  const handleParse = useCallback(() => {
    setSizeError(null)
    try {
      const result = parseEmployeeCSV(csvText)
      setPreview(result)
    } catch (err) {
      // CSVTooLargeError is the only documented throw from parseEmployeeCSV;
      // everything else is reported via result.errors. If something else
      // ever throws we want to surface it too rather than silently swallow.
      if (err instanceof CSVTooLargeError) {
        setSizeError(err.message)
      } else {
        setSizeError(err instanceof Error ? err.message : String(err))
      }
      setPreview(null)
    }
  }, [csvText])

  const handleImport = useCallback(() => {
    if (!preview) return

    const existing = useEmployeeStore.getState().employees
    // Reduce to the shape validateImportRows expects (id, name, email).
    const existingReduced: Record<
      string,
      { id: string; name: string; email: string | null }
    > = {}
    for (const [id, e] of Object.entries(existing)) {
      existingReduced[id] = { id, name: e.name, email: e.email || null }
    }

    const { valid, skipped, warnings } = validateImportRows(preview.rows, existingReduced)
    const { imported } = importEmployees({
      valid,
      existing: existingReduced,
      addEmployee: addEmployee as never,
      updateEmployee,
    })

    // Hand off to the summary modal and close ourselves. The summary modal
    // is mounted by ProjectShell and reads from uiStore.csvImportSummary.
    useUIStore.getState().setCsvImportSummary({
      importedCount: imported.length,
      skipped,
      warnings,
    })
    void emit('csv.import', 'csv', null, { count: imported.length })
    setOpen(false)
    setCsvText('')
    setPreview(null)
  }, [preview, addEmployee, updateEmployee, setOpen])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string || '')
    }
    reader.readAsText(file)
  }, [])

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Import Employees from CSV" size="lg">
      <ModalBody>
        <div className="mb-3">
          <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Upload CSV file or paste below</label>
          <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="text-sm mb-2" />
          <textarea
            className="w-full h-32 border border-gray-200 dark:border-gray-800 rounded-lg p-3 text-sm font-mono focus:outline-none focus:border-blue-400"
            placeholder={`name,email,department,team,title,type,office_days,tags\nJane Smith,jane@co.com,Engineering,Frontend,Senior Engineer,full-time,"Mon,Wed,Fri",standing-desk`}
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setPreview(null) }}
            aria-invalid={!!sizeError}
            aria-describedby={sizeError ? 'csv-size-error' : undefined}
          />
        </div>

        {sizeError && (
          <p
            id="csv-size-error"
            role="alert"
            className="text-xs text-red-600 dark:text-red-400 mt-1 mb-3"
          >
            {sizeError}
          </p>
        )}
        {preview && preview.errors.length > 0 && (
          <div
            role="alert"
            className="mb-3 text-xs text-red-600 dark:text-red-400"
          >
            {preview.errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
        {preview && (
          <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-2 py-1 text-left">Name</th>
                  <th className="px-2 py-1 text-left">Email</th>
                  <th className="px-2 py-1 text-left">Dept</th>
                  <th className="px-2 py-1 text-left">Team</th>
                  <th className="px-2 py-1 text-left">Title</th>
                  <th className="px-2 py-1 text-left">Type</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-2 py-1">{r.name}</td>
                    <td className="px-2 py-1">{r.email || '\u2014'}</td>
                    <td className="px-2 py-1">{r.department || '\u2014'}</td>
                    <td className="px-2 py-1">{r.team || '\u2014'}</td>
                    <td className="px-2 py-1">{r.title || '\u2014'}</td>
                    <td className="px-2 py-1">{r.type || '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows.length > 10 && (
              <div className="px-2 py-1 text-gray-400 dark:text-gray-500 text-center">
                ...and {preview.rows.length - 10} more
              </div>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {!preview ? (
          <Button
            variant="primary"
            onClick={handleParse}
            disabled={!csvText.trim()}
          >
            Preview
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleImport}>
              Import {preview.rows.length} employees
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  )
}
