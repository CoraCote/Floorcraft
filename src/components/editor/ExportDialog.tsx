import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useFloorStore } from '../../stores/floorStore'
import { useToastStore } from '../../stores/toastStore'
import { exportProjectJson } from '../../lib/exportJson'
import { exportEmployeeCSV } from '../../lib/employeeCsv'
import { exportPdf } from '../../lib/exportPdf'
import { exportPng } from '../../lib/exportPng'
import { getActiveStage } from '../../lib/stageRegistry'
import { useCan } from '../../hooks/useCan'
import { redactEmployeeMap } from '../../lib/redactEmployee'
import { FileText, Table, FileJson, Image as ImageIcon, X } from 'lucide-react'
import { useEffect } from 'react'

export function ExportDialog() {
  const open = useUIStore((s) => s.exportDialogOpen)
  const setOpen = useUIStore((s) => s.setExportDialogOpen)
  const project = useProjectStore((s) => s.currentProject)
  const elements = useElementsStore((s) => s.elements)
  const rawEmployees = useEmployeeStore((s) => s.employees)
  const settings = useCanvasStore((s) => s.settings)
  const floors = useFloorStore((s) => s.floors)
  const canViewPII = useCan('viewPII')
  // CSV export of the roster: when the viewer lacks `viewPII` the CSV
  // must mirror the on-screen redaction — name collapses to initials,
  // email/manager/dates/tags blank out. Headcount-level aggregates are
  // still useful for space planning, so we emit the redacted projection
  // rather than blocking the export entirely.
  const employees = canViewPII ? rawEmployees : redactEmployeeMap(rawEmployees)
  // Export failures are async outcomes (PDF render blew up, canvas
  // unmounted) — no single field is at fault — so they surface via the
  // global Toaster per docs/ERROR_DISPLAY_CONVENTION.md, not inline here.
  const pushToast = useToastStore((s) => s.push)

  const close = () => {
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
    // `close` closes over stable setters, so the effect only needs to
    // re-subscribe when `open` flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const projectName = project?.name || 'floorplan'

  const handleExportJSON = () => {
    exportProjectJson(projectName, settings, elements, employees, floors)
    close()
  }

  const handleExportCSV = () => {
    const floorMap: Record<string, string> = {}
    for (const f of floors) {
      floorMap[f.id] = f.name
    }
    const employeeList = Object.values(employees).map((e) => ({
      name: e.name,
      email: e.email,
      department: e.department || '',
      team: e.team || '',
      title: e.title || '',
      floor: e.floorId ? (floorMap[e.floorId] || '') : '',
      desk: e.seatId || '',
      manager: e.managerId ? (employees[e.managerId]?.name || '') : '',
      type: e.employmentType,
      office_days: e.officeDays.join(', '),
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
    close()
  }

  const handleExportPdf = () => {
    const stage = getActiveStage()
    if (!stage) {
      pushToast({
        tone: 'error',
        title: 'Export failed',
        body: 'Open a floor plan to export. The canvas isn\u2019t loaded right now.',
      })
      return
    }
    try {
      exportPdf(stage, {
        paperSize: 'a4',
        orientation: 'landscape',
        dpi: 300,
        fileName: `${projectName}.pdf`,
        title: project?.name,
      })
      close()
    } catch (err) {
      console.error('PDF export failed', err)
      pushToast({
        tone: 'error',
        title: 'Export failed',
        body: 'Could not generate the PDF. Try again, or export PNG instead.',
      })
    }
  }

  const handleExportPng = () => {
    const stage = getActiveStage()
    if (!stage) {
      pushToast({
        tone: 'error',
        title: 'Export failed',
        body: 'Open a floor plan to export. The canvas isn\u2019t loaded right now.',
      })
      return
    }
    try {
      exportPng(stage, { pixelRatio: 2, fileName: `${projectName}.png` })
      close()
    } catch (err) {
      console.error('PNG export failed', err)
      pushToast({
        tone: 'error',
        title: 'Export failed',
        body: 'Could not generate the PNG.',
      })
    }
  }

  const exports = [
    { icon: <FileText size={20} />, label: 'PDF Floor Plan', desc: 'Print-ready A4 landscape at 300dpi', onClick: handleExportPdf },
    { icon: <ImageIcon size={20} />, label: 'PNG Image', desc: 'High-resolution PNG snapshot of the canvas', onClick: handleExportPng },
    { icon: <Table size={20} />, label: 'CSV Employee Roster', desc: 'Spreadsheet with seat assignments', onClick: handleExportCSV },
    { icon: <FileJson size={20} />, label: 'JSON Project Data', desc: 'Full project data including floors and employees', onClick: handleExportJSON },
  ]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={close}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Export</h2>
          <button onClick={close} className="text-gray-400 hover:text-gray-600" aria-label="Close export dialog"><X size={18} /></button>
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
