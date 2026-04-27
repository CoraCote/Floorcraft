import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BarChart2, Users } from 'lucide-react'
import { useFloorStore } from '../../stores/floorStore'
import { useVisibleEmployees } from '../../hooks/useVisibleEmployees'
import { useAllFloorElements } from '../../hooks/useActiveFloorElements'
import { useCan } from '../../hooks/useCan'
import {
  floorUtilization,
  departmentHeadcount,
  unassignedEmployees,
} from '../../lib/reports/calculations'
import { utilizationCsv, headcountCsv, unassignedCsv, downloadCsv } from '../../lib/reports/csvExport'
import { computeReportsStats } from '../../lib/reportsStats'
import { UtilizationBar } from './UtilizationBar'
import { ChurnHeatmap } from './ChurnHeatmap'
import { OccupancyDashboard } from './OccupancyDashboard'

/**
 * Wave 13C: refresh the Reports surface to match the JSON-Crack/Linear
 * chrome the rest of the editor uses. The page is still a single
 * components-all-in-one view (sibling reports like Move Planner and
 * Employee Directory are invoked from the editor shell and keep their
 * own routing), but the sections now sit under a sticky in-page tab bar
 * fronted by a KPI stat strip so the room-level numbers are visible
 * without scrolling. Picking a tab just toggles which section renders;
 * no routing changes.
 */

type ReportTab = 'occupancy' | 'utilization' | 'departments' | 'unassigned' | 'churn'

interface TabDef {
  id: ReportTab
  label: string
}

const TABS: TabDef[] = [
  { id: 'occupancy', label: 'Occupancy' },
  { id: 'utilization', label: 'Floor utilization' },
  { id: 'departments', label: 'Departments' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'churn', label: 'Churn heatmap' },
]

export function ReportsPage() {
  const canView = useCan('viewReports')
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  const floors = useFloorStore((s) => s.floors)
  // Headcount still counts accurately (redaction preserves id/seatId/
  // department/status), but the unassigned table renders initials + blank
  // email so a viewer-role report consumer sees the same GDPR-safe view
  // as on the roster.
  const employees = useVisibleEmployees()
  const floorsWithElements = useAllFloorElements()

  const utilRows = useMemo(() => floorUtilization(floors), [floors])
  const deptRows = useMemo(() => departmentHeadcount(employees), [employees])
  const unassignedRows = useMemo(() => unassignedEmployees(employees), [employees])
  const stats = useMemo(
    () => computeReportsStats(employees, floorsWithElements),
    [employees, floorsWithElements],
  )

  const [activeTab, setActiveTab] = useState<ReportTab>('occupancy')
  const tabRefs = useRef<Record<ReportTab, HTMLButtonElement | null>>({
    occupancy: null,
    utilization: null,
    departments: null,
    unassigned: null,
    churn: null,
  })

  if (!canView) {
    return (
      <div className="p-6 text-gray-600 dark:text-gray-300">
        Reports are restricted to editors and admins. Ask a team admin if you need access.
      </div>
    )
  }

  const floorCompareHref =
    teamSlug && officeSlug
      ? `/t/${teamSlug}/o/${officeSlug}/reports/floor-compare`
      : null

  const scenariosHref =
    teamSlug && officeSlug
      ? `/t/${teamSlug}/o/${officeSlug}/reports/scenarios`
      : null

  const isEmpty = stats.totalEmployees === 0 && stats.floorCount === 0

  if (isEmpty) {
    return <EmptyState teamSlug={teamSlug} officeSlug={officeSlug} />
  }

  // Roving tabindex: only the selected tab is in the tab order; arrow
  // keys cycle between tabs. Copies the FloorSwitcher pattern so the
  // editor's two primary tab strips share one mental model.
  const onTablistKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (
      e.key !== 'ArrowLeft' &&
      e.key !== 'ArrowRight' &&
      e.key !== 'Home' &&
      e.key !== 'End'
    )
      return
    e.preventDefault()
    const idx = TABS.findIndex((t) => t.id === activeTab)
    if (idx < 0) return
    let next = idx
    if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length
    else if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    const nextId = TABS[next].id
    setActiveTab(nextId)
    tabRefs.current[nextId]?.focus()
  }

  return (
    <div className="p-3 sm:p-6 max-w-5xl">
      {/* KPI strip. Matches the card idiom used by FileMenu and
          PropertiesPanel sections: white/gray-900 surface, gray border,
          tabular-nums for the big value so alignment stays tidy. */}
      <StatStrip stats={stats} />

      {/* Cross-links to sibling report pages that live on their own
          routes. Kept above the tabs because they're navigations to a
          different page, not a view switch. */}
      {(scenariosHref || floorCompareHref) && (
        <nav aria-label="Reports navigation" className="flex flex-wrap items-center gap-2 mt-4">
          {scenariosHref && (
            <Link
              to={scenariosHref}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              Capacity scenarios →
            </Link>
          )}
          {floorCompareHref && (
            <Link
              to={floorCompareHref}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <BarChart2 size={14} />
              Floor compare
            </Link>
          )}
        </nav>
      )}

      {/* Sticky tab bar. Pinned to the top of the scroll container so
          section headers stay reachable as the user scrolls through a
          long churn table. Same blue-underline treatment as
          FloorSwitcher. */}
      <div
        role="tablist"
        aria-label="Reports sections"
        onKeyDown={onTablistKeyDown}
        className="sticky top-0 z-10 flex items-center gap-1 mt-5 mb-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-x-auto whitespace-nowrap"
      >
        {TABS.map((tab) => {
          const selected = tab.id === activeTab
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el
              }}
              type="button"
              role="tab"
              id={`reports-tab-${tab.id}`}
              aria-controls={`reports-panel-${tab.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                selected
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                  : 'text-gray-600 dark:text-gray-300 border-b-2 border-transparent hover:text-gray-800 dark:hover:text-gray-100'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`reports-panel-${activeTab}`}
        aria-labelledby={`reports-tab-${activeTab}`}
      >
        {activeTab === 'occupancy' && (
          <Card title="Occupancy dashboard">
            <OccupancyDashboard />
          </Card>
        )}

        {activeTab === 'utilization' && (
          <Card
            title="Floor utilization"
            onExport={() => downloadCsv('floor-utilization.csv', utilizationCsv(utilRows))}
          >
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[460px]">
              <thead>
                <tr className="text-left border-b border-gray-200 dark:border-gray-800">
                  <th className="py-2">Floor</th>
                  <th>Assigned</th>
                  <th>Capacity</th>
                  <th className="w-1/3">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {utilRows.map((r) => (
                  <tr key={r.floorId} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2">{r.floorName}</td>
                    <td className="tabular-nums">{r.assigned}</td>
                    <td className="tabular-nums">{r.capacity}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <UtilizationBar percent={r.percent} />
                        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums w-12 text-right">
                          {r.percent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        )}

        {activeTab === 'departments' && (
          <Card
            title="Department headcount"
            onExport={() => downloadCsv('department-headcount.csv', headcountCsv(deptRows))}
          >
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-left border-b border-gray-200 dark:border-gray-800">
                  <th className="py-2">Department</th>
                  <th>Count</th>
                  <th>Assigned</th>
                  <th>Assignment rate</th>
                </tr>
              </thead>
              <tbody>
                {deptRows.map((r) => (
                  <tr key={r.department} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2">{r.department}</td>
                    <td className="tabular-nums">{r.count}</td>
                    <td className="tabular-nums">{r.assigned}</td>
                    <td className="tabular-nums">{r.assignmentRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        )}

        {activeTab === 'unassigned' && (
          <Card
            title={`Unassigned (${unassignedRows.length})`}
            onExport={() => downloadCsv('unassigned.csv', unassignedCsv(unassignedRows))}
          >
            {unassignedRows.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Everyone active has a seat.</p>
            ) : (
              <ul className="text-sm divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto">
                {unassignedRows.map((r) => (
                  <li key={r.id} className="py-1.5 flex items-center justify-between">
                    <span>{r.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{r.department ?? '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {activeTab === 'churn' && (
          <Card title="Seat change activity (13 weeks)">
            <ChurnHeatmap />
          </Card>
        )}
      </div>
    </div>
  )
}

function StatStrip({
  stats,
}: {
  stats: ReturnType<typeof computeReportsStats>
}) {
  // Derived secondary lines. We keep them cheap — "X% of seats",
  // "Y of total" — so the strip stays a render-free pure-format
  // operation. Nothing here reaches back into stores.
  const occupiedOfSeats =
    stats.totalSeats > 0
      ? `${Math.round((stats.occupancyPct * stats.totalSeats) / 100)} / ${stats.totalSeats} occupied`
      : 'No seats placed'
  const unassignedOfTotal =
    stats.totalEmployees > 0
      ? `${stats.totalEmployees - stats.unassigned} seated`
      : 'No employees'
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
      aria-label="Reports summary"
    >
      <StatCard label="Employees" value={stats.totalEmployees} />
      <StatCard label="Seats" value={stats.totalSeats} secondary={occupiedOfSeats} />
      <StatCard
        label="Occupancy"
        value={`${stats.occupancyPct}%`}
        secondary={stats.totalSeats > 0 ? `${stats.totalSeats} seats` : undefined}
      />
      <StatCard label="Unassigned" value={stats.unassigned} secondary={unassignedOfTotal} />
      <StatCard label="Floors" value={stats.floorCount} />
      <StatCard label="Departments" value={stats.departmentCount} />
    </div>
  )
}

function StatCard({
  label,
  value,
  secondary,
}: {
  label: string
  value: string | number
  secondary?: string
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
        {value}
      </div>
      {secondary ? (
        <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">{secondary}</div>
      ) : null}
    </div>
  )
}

function EmptyState({
  teamSlug,
  officeSlug,
}: {
  teamSlug?: string
  officeSlug?: string
}) {
  const rosterHref =
    teamSlug && officeSlug ? `/t/${teamSlug}/o/${officeSlug}/roster` : null
  return (
    <div className="p-3 sm:p-6 max-w-5xl">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-10 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 mb-4">
          <Users size={22} aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Nothing to report yet
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          Import your roster and lay out a floor to unlock occupancy,
          utilization, and churn metrics.
        </p>
        {rosterHref ? (
          <Link
            to={rosterHref}
            className="inline-flex items-center gap-1.5 mt-4 text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            Go to roster
          </Link>
        ) : null}
      </div>
    </div>
  )
}

function Card({
  title,
  onExport,
  children,
}: {
  title: string
  onExport?: () => void
  children: React.ReactNode
}) {
  return (
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {title}
        </h2>
        {onExport ? (
          <button
            onClick={onExport}
            className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-800 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            Export CSV
          </button>
        ) : null}
      </div>
      {children}
    </section>
  )
}
