import { useUIStore } from '../../../stores/uiStore'
import {
  BarChart3,
  Search,
  GitBranch,
  ArrowLeftRight,
  AlertTriangle,
  Map,
  Download,
  ArrowLeft,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

const REPORT_ICONS: Record<string, React.ElementType> = {
  BarChart3,
  Search,
  GitBranch,
  ArrowLeftRight,
  AlertTriangle,
  Map,
  Download,
}

const REPORTS = [
  { id: 'occupancy', icon: 'BarChart3', title: 'Occupancy Dashboard', desc: 'Floor stats, department breakdown' },
  { id: 'directory', icon: 'Search', title: 'Employee Directory', desc: 'Full searchable list with seat assignments' },
  { id: 'org-chart', icon: 'GitBranch', title: 'Org Chart Overlay', desc: 'Manager \u2192 report lines on floor plan' },
  { id: 'move-planner', icon: 'ArrowLeftRight', title: 'Move Planner', desc: 'Draft seat changes before committing' },
  { id: 'unassigned', icon: 'AlertTriangle', title: 'Unassigned Report', desc: 'Employees without seats + open desks' },
  { id: 'seat-map', icon: 'Map', title: 'Seat Map', desc: 'Color-coded floor plan by department/team' },
  { id: 'export', icon: 'Download', title: 'Export', desc: 'PDF floor plans, CSV roster, JSON data' },
] as const

export function ReportsPanel() {
  const {
    activeReport,
    setActiveReport,
    orgChartOverlayEnabled,
    setOrgChartOverlayEnabled,
    seatMapColorMode,
    setSeatMapColorMode,
    setExportDialogOpen,
  } = useUIStore(
    useShallow((s) => ({
      activeReport: s.activeReport,
      setActiveReport: s.setActiveReport,
      orgChartOverlayEnabled: s.orgChartOverlayEnabled,
      setOrgChartOverlayEnabled: s.setOrgChartOverlayEnabled,
      seatMapColorMode: s.seatMapColorMode,
      setSeatMapColorMode: s.setSeatMapColorMode,
      setExportDialogOpen: s.setExportDialogOpen,
    }))
  )

  const handleReportClick = (reportId: string) => {
    switch (reportId) {
      case 'org-chart':
        setOrgChartOverlayEnabled(!orgChartOverlayEnabled)
        setActiveReport(reportId)
        break
      case 'seat-map':
        setSeatMapColorMode(seatMapColorMode ? null : 'department')
        setActiveReport(reportId)
        break
      case 'export':
        setExportDialogOpen(true)
        break
      default:
        setActiveReport(reportId)
    }
  }

  // Show active report detail view
  if (activeReport) {
    return (
      <div className="flex flex-col h-full">
        <button
          onClick={() => setActiveReport(null)}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft size={14} />
          Back to reports
        </button>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <div className="text-sm font-medium mb-1 capitalize">
              {REPORTS.find((r) => r.id === activeReport)?.title || activeReport}
            </div>
            <div className="text-xs">Report content will be implemented in a later task.</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-gray-500 mb-1">Reports & Tools</div>
      {REPORTS.map((report) => {
        const IconComponent = REPORT_ICONS[report.icon]
        return (
          <button
            key={report.id}
            onClick={() => handleReportClick(report.id)}
            className="flex items-center gap-3 w-full p-3 border border-gray-200 rounded-lg text-left hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
              {IconComponent && <IconComponent size={16} className="text-gray-600" />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800">{report.title}</div>
              <div className="text-[11px] text-gray-400 truncate">{report.desc}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
