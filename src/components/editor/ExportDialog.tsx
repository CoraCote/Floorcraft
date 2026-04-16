import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { exportProjectJson } from '../../lib/exportJson'
import { exportEmployeeCSV } from '../../lib/csv'
import { Image, FileText, Table, FileJson, X } from 'lucide-react'

export function ExportDialog() {
  const open = useUIStore((s) => s.exportDialogOpen)
  const setOpen = useUIStore((s) => s.setExportDialogOpen)
  const project = useProjectStore((s) => s.currentProject)
  const elements = useElementsStore((s) => s.elements)
  const employees = useEmployeeStore((s) => s.employees)
  const settings = useCanvasStore((s) => s.settings)

  if (!open) return null

  const projectName = project?.name || 'floorplan'

  const handleExportJSON = () => {
    exportProjectJson(projectName, settings, elements, employees)
    setOpen(false)
  }

  const handleExportCSV = () => {
    const employeeList = Object.values(employees).map((e) => ({
      name: e.name,
      email: e.email,
      department: e.department || '',
      team: e.team || '',
      title: e.title || '',
      type: e.employmentType,
      seatId: e.seatId || '',
      floorId: e.floorId || '',
      officeDays: e.officeDays.join(', '),
      tags: e.tags.join(', '),
    }))
    const csv = exportEmployeeCSV(employeeList)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = `${projectName}-employees.csv`
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
    { icon: <Table size={20} />, label: 'Employee Roster (CSV)', desc: 'Spreadsheet with seat assignments', onClick: handleExportCSV },
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
