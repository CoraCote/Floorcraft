import { useUIStore } from '../../../stores/uiStore'
import { useOverlaysStore } from '../../../stores/overlaysStore'
import {
  BarChart3,
  Search,
  GitBranch,
  ArrowLeftRight,
  AlertTriangle,
  Map,
  Download,
  ArrowLeft,
  CheckCircle,
  Cpu,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { OccupancyDashboard } from '../../reports/OccupancyDashboard'
import { UnassignedReport } from '../../reports/UnassignedReport'
import { MovePlanner } from '../../reports/MovePlanner'

const REPORT_ICONS: Record<string, React.ElementType> = {
  BarChart3,
  Search,
  GitBranch,
  ArrowLeftRight,
  AlertTriangle,
  Map,
  Download,
  Cpu,
}

const REPORTS = [
  { id: 'occupancy', icon: 'BarChart3', title: 'Occupancy Dashboard', desc: 'Floor stats, department breakdown' },
  { id: 'directory', icon: 'Search', title: 'Employee Directory', desc: 'Full searchable list with seat assignments' },
  { id: 'org-chart', icon: 'GitBranch', title: 'Org Chart Overlay', desc: 'Manager \u2192 report lines on floor plan' },
  { id: 'move-planner', icon: 'ArrowLeftRight', title: 'Move Planner', desc: 'Draft seat changes before committing' },
  { id: 'unassigned', icon: 'AlertTriangle', title: 'Unassigned Report', desc: 'Employees without seats + open desks' },
  { id: 'seat-map', icon: 'Map', title: 'Seat Map', desc: 'Color-coded floor plan by department/team' },
  { id: 'equipment-overlay', icon: 'Cpu', title: 'Equipment Needs Overlay', desc: 'Color desks by whether seated equipment needs are met' },
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
    movePlannerActive,
    setMovePlannerActive,
    setExportDialogOpen,
    setEmployeeDirectoryOpen,
  } = useUIStore(
    useShallow((s) => ({
      activeReport: s.activeReport,
      setActiveReport: s.setActiveReport,
      orgChartOverlayEnabled: s.orgChartOverlayEnabled,
      setOrgChartOverlayEnabled: s.setOrgChartOverlayEnabled,
      seatMapColorMode: s.seatMapColorMode,
      setSeatMapColorMode: s.setSeatMapColorMode,
      movePlannerActive: s.movePlannerActive,
      setMovePlannerActive: s.setMovePlannerActive,
      setExportDialogOpen: s.setExportDialogOpen,
      setEmployeeDirectoryOpen: s.setEmployeeDirectoryOpen,
    }))
  )
  // Equipment-needs overlay flag lives on `overlaysStore`, not uiStore —
  // see that file for the rationale. Pulled as its own hook call so the
  // render only re-runs when THIS flag changes rather than on every
  // uiStore mutation.
  const equipmentOverlay = useOverlaysStore((s) => s.equipment)
  const toggleEquipmentOverlay = useOverlaysStore((s) => s.toggleEquipment)

  const handleReportClick = (reportId: string) => {
    switch (reportId) {
      case 'directory':
        setEmployeeDirectoryOpen(true)
        setActiveReport(reportId)
        break
      case 'org-chart':
        setOrgChartOverlayEnabled(!orgChartOverlayEnabled)
        setActiveReport(orgChartOverlayEnabled ? null : reportId)
        break
      case 'seat-map':
        if (seatMapColorMode) {
          setSeatMapColorMode(null)
          setActiveReport(null)
        } else {
          setSeatMapColorMode('department')
          setActiveReport(reportId)
        }
        break
      case 'move-planner':
        setMovePlannerActive(!movePlannerActive)
        setActiveReport(movePlannerActive ? null : reportId)
        break
      case 'equipment-overlay':
        // Pure toggle — overlay is purely visual, doesn't own the
        // active-report slot so the user can stack it with another view.
        toggleEquipmentOverlay()
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
    const reportTitle = REPORTS.find((r) => r.id === activeReport)?.title || activeReport

    // Inline panels
    if (activeReport === 'occupancy' || activeReport === 'unassigned' || activeReport === 'move-planner') {
      return (
        <div className="flex flex-col h-full">
          <button
            onClick={() => {
              if (activeReport === 'move-planner') setMovePlannerActive(false)
              setActiveReport(null)
            }}
            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 mb-4"
          >
            <ArrowLeft size={14} />
            Back to reports
          </button>
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">{reportTitle}</div>
          <div className="flex-1 overflow-y-auto">
            {activeReport === 'occupancy' && <OccupancyDashboard />}
            {activeReport === 'unassigned' && <UnassignedReport />}
            {activeReport === 'move-planner' && <MovePlanner />}
          </div>
        </div>
      )
    }

    // Toggle-based reports (org-chart, seat-map) and directory show as active cards
    // but don't render inline content — they render as overlays
    return (
      <div className="flex flex-col h-full">
        <button
          onClick={() => {
            if (activeReport === 'org-chart') setOrgChartOverlayEnabled(false)
            if (activeReport === 'seat-map') setSeatMapColorMode(null)
            setActiveReport(null)
          }}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 mb-4"
        >
          <ArrowLeft size={14} />
          Back to reports
        </button>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400 dark:text-gray-500">
            <div className="text-sm font-medium mb-1">{reportTitle}</div>
            {activeReport === 'org-chart' && (
              <div className="text-xs">
                Org chart lines are now visible on the canvas.
                <br />
                Manager-to-report connections are shown as dashed lines.
              </div>
            )}
            {activeReport === 'seat-map' && (
              <div className="text-xs">
                Seat map color overlay is active on the canvas.
                <div className="mt-3 flex flex-col gap-1.5">
                  {(['department', 'team', 'employment-type', 'office-days'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setSeatMapColorMode(mode)}
                      className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                        seatMapColorMode === mode
                          ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 text-blue-700 dark:text-blue-300'
                          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      {mode === 'employment-type'
                        ? 'Employment Type'
                        : mode === 'office-days'
                          ? 'Office Days'
                          : mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeReport === 'directory' && (
              <div className="text-xs">
                The employee directory is open as a modal overlay.
                <br />
                <button
                  onClick={() => setEmployeeDirectoryOpen(true)}
                  className="mt-2 text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Reopen directory
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Reports & Tools</div>
      {REPORTS.map((report) => {
        const IconComponent = REPORT_ICONS[report.icon]
        const isActive =
          (report.id === 'org-chart' && orgChartOverlayEnabled) ||
          (report.id === 'seat-map' && seatMapColorMode !== null) ||
          (report.id === 'move-planner' && movePlannerActive) ||
          (report.id === 'equipment-overlay' && equipmentOverlay)

        return (
          <button
            key={report.id}
            onClick={() => handleReportClick(report.id)}
            className={`flex items-center gap-3 w-full p-3 border rounded-lg text-left transition-colors ${
              isActive
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:border-gray-300'
            }`}
          >
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                isActive ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-800'
              }`}
            >
              {IconComponent && (
                <IconComponent
                  size={16}
                  className={isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                {report.title}
                {isActive && <CheckCircle size={12} className="text-blue-500 dark:text-blue-400" />}
              </div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{report.desc}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
