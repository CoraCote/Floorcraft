import { useUIStore } from '../../../stores/uiStore'
import { useSeatingStore } from '../../../stores/seatingStore'
import { parseGuestCSV } from '../../../lib/csv'
import { useState, useCallback } from 'react'

export function CSVImportDialog() {
  const open = useUIStore((s) => s.csvImportOpen)
  const setOpen = useUIStore((s) => s.setCsvImportOpen)
  const addGuests = useSeatingStore((s) => s.addGuests)

  const [csvText, setCsvText] = useState('')
  const [preview, setPreview] = useState<ReturnType<typeof parseGuestCSV> | null>(null)

  const handleParse = useCallback(() => {
    const result = parseGuestCSV(csvText)
    setPreview(result)
  }, [csvText])

  const handleImport = useCallback(() => {
    if (!preview) return
    addGuests(
      preview.rows.map((r) => ({
        name: r.name,
        groupName: r.group || null,
        dietary: r.dietary || null,
        vip: r.vip === true || r.vip === 'true',
        customAttributes: {},
      }))
    )
    setOpen(false)
    setCsvText('')
    setPreview(null)
  }, [preview, addGuests, setOpen])

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
        <h2 className="text-lg font-semibold mb-4">Import Guests from CSV</h2>

        <div className="mb-3">
          <label className="block text-sm text-gray-600 mb-1">Upload CSV file or paste below</label>
          <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="text-sm mb-2" />
          <textarea
            className="w-full h-32 border border-gray-200 rounded-lg p-3 text-sm font-mono focus:outline-none focus:border-blue-400"
            placeholder={`name,group,dietary,vip\nJane Smith,Bride's Family,Vegetarian,true\nJohn Doe,Groom's Friends,,false`}
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
                    <th className="px-2 py-1 text-left">Group</th>
                    <th className="px-2 py-1 text-left">Dietary</th>
                    <th className="px-2 py-1 text-left">VIP</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1">{r.group || '—'}</td>
                      <td className="px-2 py-1">{r.dietary || '—'}</td>
                      <td className="px-2 py-1">{String(r.vip)}</td>
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
                Import {preview.rows.length} guests
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
