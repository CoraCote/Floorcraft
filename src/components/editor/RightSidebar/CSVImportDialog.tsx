import { useUIStore } from '../../../stores/uiStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { parseEmployeeCSV } from '../../../lib/csv'
import { useState, useCallback } from 'react'

export function CSVImportDialog() {
  const open = useUIStore((s) => s.csvImportOpen)
  const setOpen = useUIStore((s) => s.setCsvImportOpen)
  const addEmployees = useEmployeeStore((s) => s.addEmployees)

  const [csvText, setCsvText] = useState('')
  const [preview, setPreview] = useState<ReturnType<typeof parseEmployeeCSV> | null>(null)

  const handleParse = useCallback(() => {
    const result = parseEmployeeCSV(csvText)
    setPreview(result)
  }, [csvText])

  const handleImport = useCallback(() => {
    if (!preview) return
    addEmployees(
      preview.rows.map((r) => ({
        name: r.name,
        email: r.email || '',
        department: r.department || null,
        team: r.team || null,
        title: r.title || null,
        managerId: null,
        employmentType: (r.type as 'full-time' | 'contractor' | 'part-time' | 'intern') || 'full-time',
        officeDays: r.office_days ? r.office_days.split(',').map((d) => d.trim()) : [],
        startDate: r.start_date || null,
        photoUrl: null,
        tags: r.tags ? r.tags.split(',').map((t) => t.trim()) : [],
        seatId: null,
        floorId: null,
      }))
    )
    setOpen(false)
    setCsvText('')
    setPreview(null)
  }, [preview, addEmployees, setOpen])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string || '')
    }
    reader.readAsText(file)
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Import Employees from CSV</h2>

        <div className="mb-3">
          <label className="block text-sm text-gray-600 mb-1">Upload CSV file or paste below</label>
          <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="text-sm mb-2" />
          <textarea
            className="w-full h-32 border border-gray-200 rounded-lg p-3 text-sm font-mono focus:outline-none focus:border-blue-400"
            placeholder={`name,email,department,team,title,type,office_days,tags\nJane Smith,jane@co.com,Engineering,Frontend,Senior Engineer,full-time,"Mon,Wed,Fri",standing-desk`}
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setPreview(null) }}
          />
        </div>

        {!preview ? (
          <button
            onClick={handleParse}
            disabled={!csvText.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            Preview
          </button>
        ) : (
          <>
            {preview.errors.length > 0 && (
              <div className="mb-3 p-2 bg-red-50 text-red-700 text-xs rounded">
                {preview.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            <div className="mb-3 max-h-40 overflow-y-auto border border-gray-200 rounded">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
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
                    <tr key={i} className="border-t border-gray-100">
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
                <div className="px-2 py-1 text-gray-400 text-center">
                  ...and {preview.rows.length - 10} more
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Import {preview.rows.length} employees
              </button>
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-gray-600 text-sm hover:bg-gray-100 rounded-lg">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
