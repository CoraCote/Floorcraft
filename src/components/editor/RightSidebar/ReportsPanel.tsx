import { useParams, Link } from 'react-router-dom'
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
  ExternalLink,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { OccupancyDashboard } from '../../reports/OccupancyDashboard'
import { UnassignedReport } from '../../reports/UnassignedReport'
import { MovePlanner } from '../../reports/MovePlanner'
import { PanelHeader } from './PanelHeader'
import { PanelSection } from './PanelSection'

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

/**
 * Each report entry knows which "group" it belongs to — Wave 17D splits
 * the flat menu into two PanelSections so the user has a clearer mental
 * model: panels you drill into vs. canvas overlays you toggle on top of
 * the existing plan.
 */
type ReportGroup = 'reports' | 'overlays' | 'export'

interface ReportDef {
  readonly id: string
  readonly icon: string
  readonly title: string
  readonly desc: string
  readonly group: ReportGroup
}

const REPORTS: readonly ReportDef[] = [
  { id: 'occupancy', icon: 'BarChart3', title: 'Occupancy Dashboard', desc: 'Floor stats, department breakdown', group: 'reports' },
  { id: 'directory', icon: 'Search', title: 'Employee Directory', desc: 'Full searchable list with seat assignments', group: 'reports' },
  { id: 'move-planner', icon: 'ArrowLeftRight', title: 'Move Planner', desc: 'Draft seat changes before committing', group: 'reports' },
  { id: 'unassigned', icon: 'AlertTriangle', title: 'Unassigned Report', desc: 'Employees without seats + open desks', group: 'reports' },
  { id: 'org-chart', icon: 'GitBranch', title: 'Org Chart Overlay', desc: 'Manager → report lines on floor plan', group: 'overlays' },
  { id: 'seat-map', icon: 'Map', title: 'Seat Map', desc: 'Color-coded floor plan by department/team', group: 'overlays' },
  { id: 'equipment-overlay', icon: 'Cpu', title: 'Equipment Needs Overlay', desc: 'Color desks by whether seated equipment needs are met', group: 'overlays' },
  { id: 'export', icon: 'Download', title: 'Export', desc: 'PDF floor plans, CSV roster, JSON data', group: 'export' },
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
  // The sidebar panel always mounts inside a team/office route, so both
  // params are guaranteed present. We still guard the href construction
  // so a future route-free mount (tests, storybook) doesn't throw.
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  const fullReportsHref =
    teamSlug && officeSlug ? `/t/${teamSlug}/o/${officeSlug}/reports` : null

  const isActive = (reportId: string): boolean =>
    (reportId === 'org-chart' && orgChartOverlayEnabled) ||
    (reportId === 'seat-map' && seatMapColorMode !== null) ||
    (reportId === 'move-planner' && movePlannerActive) ||
    (reportId === 'equipment-overlay' && equipmentOverlay)

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
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 mb-3"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Back to reports
          </button>
          <PanelHeader title={reportTitle} />
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
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 mb-3"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to reports
        </button>
        <PanelHeader title={reportTitle} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400 dark:text-gray-500">
            {activeReport === 'org-chart' && (
              <div className="text-xs leading-relaxed">
                Org chart lines are now visible on the canvas.
                <br />
                Manager-to-report connections are shown as dashed lines.
              </div>
            )}
            {activeReport === 'seat-map' && (
              <div className="text-xs leading-relaxed">
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
              <div className="text-xs leading-relaxed">
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

  const openFullAction = fullReportsHref ? (
    <Link
      to={fullReportsHref}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 hover:underline"
      title="Open the full Reports page"
    >
      Open full reports
      <ExternalLink size={11} aria-hidden="true" />
    </Link>
  ) : null

  const reports = REPORTS.filter((r) => r.group === 'reports')
  const overlays = REPORTS.filter((r) => r.group === 'overlays')
  const exports = REPORTS.filter((r) => r.group === 'export')

  return (
    <div className="flex flex-col gap-4">
      <PanelHeader title="Reports" actions={openFullAction} />

      <PanelSection title="Reports" subtitle="Drill into dashboards and ad-hoc lists">
        <div className="flex flex-col gap-2">
          {reports.map((report) => (
            <ReportButton
              key={report.id}
              report={report}
              active={isActive(report.id)}
              onClick={() => handleReportClick(report.id)}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Canvas overlays" subtitle="Layer data on top of the floor plan">
        <div className="flex flex-col gap-2">
          {overlays.map((report) => (
            <ReportButton
              key={report.id}
              report={report}
              active={isActive(report.id)}
              onClick={() => handleReportClick(report.id)}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Export" subtitle="Download the plan or the roster">
        <div className="flex flex-col gap-2">
          {exports.map((report) => (
            <ReportButton
              key={report.id}
              report={report}
              active={isActive(report.id)}
              onClick={() => handleReportClick(report.id)}
            />
          ))}
        </div>
      </PanelSection>
    </div>
  )
}

/**
 * Single row in the Reports panel — the icon tile + title + description +
 * active indicator. Extracted in Wave 17D so the three PanelSection groups
 * all render with the same chrome without duplicating the class strings.
 */
function ReportButton({
  report,
  active,
  onClick,
}: {
  report: ReportDef
  active: boolean
  onClick: () => void
}) {
  const IconComponent = REPORT_ICONS[report.icon]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 w-full p-3 border rounded-lg text-left transition-colors ${
        active
          ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/70 hover:bg-blue-100 dark:hover:bg-blue-900/40'
          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-700'
      }`}
    >
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
          active ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-800'
        }`}
      >
        {IconComponent && (
          <IconComponent
            size={16}
            aria-hidden="true"
            className={active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
          {report.title}
          {active && <CheckCircle size={12} className="text-blue-500 dark:text-blue-400" aria-hidden="true" />}
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{report.desc}</div>
      </div>
    </button>
  )
}
