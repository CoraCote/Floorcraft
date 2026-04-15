import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useSeatingStore } from '../../stores/seatingStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { exportProjectJson } from '../../lib/exportJson'
import { exportGuestsCSV } from '../../lib/csv'
import { isTableElement } from '../../types/elements'
import { Image, FileText, Table, FileJson, X } from 'lucide-react'

export function ExportDialog() {
  const open = useUIStore((s) => s.exportDialogOpen)
  const setOpen = useUIStore((s) => s.setExportDialogOpen)
  const project = useProjectStore((s) => s.currentProject)
  const elements = useElementsStore((s) => s.elements)
  const guests = useSeatingStore((s) => s.guests)
  const settings = useCanvasStore((s) => s.settings)

  if (!open) return null

  const projectName = project?.name || 'floorplan'

  const handleExportJSON = () => {
    exportProjectJson(projectName, settings, elements, guests)
    setOpen(false)
  }

  const handleExportCSV = () => {
    const guestList = Object.values(guests).map((g) => {
      let tableName = ''
      let seatName = ''
      if (g.seatElementId) {
        for (const el of Object.values(elements)) {
          if (isTableElement(el)) {
            const seat = el.seats.find((s) => s.id === g.seatElementId)
            if (seat) {
              tableName = el.label
              seatName = `Seat ${el.seats.indexOf(seat) + 1}`
              break
            }
          }
        }
      }
      return {
        name: g.name,
        group: g.groupName || '',
        table: tableName,
        seat: seatName,
        dietary: g.dietary || '',
        vip: g.vip,
      }
    })
    const csv = exportGuestsCSV(guestList)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = `${projectName}-guests.csv`
    link.href = url
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  const exports = [
    { icon: <Image size={20} />, label: 'PNG Image', desc: 'Standard or high-res image', onClick: () => { setOpen(false) } },
    { icon: <FileText size={20} />, label: 'PDF Document', desc: 'Print-ready at 300dpi', onClick: () => { setOpen(false) } },
    { icon: <Table size={20} />, label: 'Guest List (CSV)', desc: 'Spreadsheet with assignments', onClick: handleExportCSV },
    { icon: <FileJson size={20} />, label: 'Project Backup (JSON)', desc: 'Full project data for import', onClick: handleExportJSON },
  ]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Export</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-2">
          {exports.map((exp) => (
            <button
              key={exp.label}
              onClick={exp.onClick}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 border border-gray-100 text-left transition-colors"
            >
              <div className="text-gray-500">{exp.icon}</div>
              <div>
                <div className="text-sm font-medium text-gray-800">{exp.label}</div>
                <div className="text-xs text-gray-400">{exp.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
