import { useMemo, useState } from 'react'
import {
  projectScenario,
  baselineProjection,
  type Scenario,
  type ScenarioAdjustment,
} from '../../../lib/scenarios'
import { useScenariosStore } from '../../../stores/scenariosStore'
import { ScenarioAdjustmentRow } from './ScenarioAdjustmentRow'

/**
 * Right-hand detail pane. Shows the active scenario's editable header,
 * adjustment list, add-adjustment menu, and computed projection tiles.
 * The left sidebar (`ScenariosPage`) supplies the `scenario` prop; we
 * read/write through the store for mutations so other listeners (the
 * sidebar list, the compare view) stay in sync.
 */
export interface ScenarioDetailPaneProps {
  scenario: Scenario
  /**
   * Viewer-role proxy — true when the current user may edit the scenario.
   * False puts every input into read-only mode and hides the "add" menu /
   * delete button. A non-editor planner can still *see* the projection;
   * they just can't change it.
   */
  editable: boolean
  onClone: () => void
  onRemove: () => void
}

export function ScenarioDetailPane({
  scenario,
  editable,
  onClone,
  onRemove,
}: ScenarioDetailPaneProps) {
  const renameScenario = useScenariosStore((s) => s.renameScenario)
  const addAdjustment = useScenariosStore((s) => s.addAdjustment)
  const updateAdjustment = useScenariosStore((s) => s.updateAdjustment)
  const removeAdjustment = useScenariosStore((s) => s.removeAdjustment)
  const [menuOpen, setMenuOpen] = useState(false)

  const baseline = useMemo(
    () => baselineProjection(scenario.baseSnapshot),
    [scenario.baseSnapshot],
  )
  const projected = useMemo(
    () => projectScenario(scenario.baseSnapshot, scenario.adjustments),
    [scenario.baseSnapshot, scenario.adjustments],
  )

  // Departments a planner might reasonably pick for the next adjustment:
  // whatever the snapshot had plus any departments later adjustments
  // invented, deduped and sorted for display.
  const knownDepartments = useMemo(() => {
    const set = new Set<string>(Object.keys(scenario.baseSnapshot.employeesByDepartment))
    for (const a of scenario.adjustments) {
      if (a.type !== 'add-seats') set.add(a.department || '')
    }
    return Array.from(set).filter((d) => d.length > 0).sort()
  }, [scenario.baseSnapshot.employeesByDepartment, scenario.adjustments])

  const deltaHeadcount = projected.activeEmployees - baseline.activeEmployees
  const deltaSeats = projected.totalSeats - baseline.totalSeats
  const deltaOccupancy = projected.occupancyRatio - baseline.occupancyRatio

  function handleAdd(type: ScenarioAdjustment['type']) {
    setMenuOpen(false)
    // Seed sensible defaults — the first known department for a headcount
    // adjustment, an empty string otherwise so the planner is forced to
    // type it. Count starts at a small positive number so the projection
    // immediately reflects a delta.
    if (type === 'add-seats') {
      addAdjustment(scenario.id, { type: 'add-seats', count: 10 })
      return
    }
    const dept = knownDepartments[0] ?? ''
    addAdjustment(scenario.id, { type, department: dept, count: 1 })
  }

  return (
    <section className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto">
      {/* Header — name + action buttons. */}
      <header className="flex items-center gap-3">
        <input
          type="text"
          value={scenario.name}
          disabled={!editable}
          onChange={(e) => renameScenario(scenario.id, e.target.value)}
          aria-label="Scenario name"
          className="flex-1 text-xl font-semibold bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 focus:outline-none disabled:text-gray-700"
        />
        <button
          type="button"
          onClick={onClone}
          className="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-800 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50"
        >
          Clone scenario
        </button>
        {editable && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs px-3 py-1.5 border border-rose-200 text-rose-700 rounded hover:bg-rose-50"
          >
            Delete scenario
          </button>
        )}
      </header>

      {/* Projection tiles. Four columns: current / projected / delta / hint. */}
      <section
        aria-label="Scenario projection"
        className="grid grid-cols-1 md:grid-cols-3 gap-3"
      >
        <MetricTile
          testId="metric-active-employees"
          label="Active employees"
          current={baseline.activeEmployees}
          projected={projected.activeEmployees}
          delta={deltaHeadcount}
        />
        <MetricTile
          testId="metric-total-seats"
          label="Total seats"
          current={baseline.totalSeats}
          projected={projected.totalSeats}
          delta={deltaSeats}
        />
        <MetricTile
          testId="metric-occupancy"
          label="Projected occupancy"
          current={baseline.occupancyRatio}
          projected={projected.occupancyRatio}
          delta={deltaOccupancy}
          formatter={(v) => `${Math.round(v * 100)}%`}
          deltaFormatter={(v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}pp`}
        />
      </section>

      {/* Adjustment list. */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Adjustments
          </h3>
          {editable && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-800 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                + Add adjustment
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded shadow-md z-10"
                >
                  <MenuItem onClick={() => handleAdd('add-headcount')}>
                    Add headcount
                  </MenuItem>
                  <MenuItem onClick={() => handleAdd('remove-headcount')}>
                    Remove headcount
                  </MenuItem>
                  <MenuItem onClick={() => handleAdd('add-seats')}>
                    Add seats (new floor)
                  </MenuItem>
                </div>
              )}
            </div>
          )}
        </div>
        {scenario.adjustments.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No adjustments yet. The projection matches today's numbers.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {scenario.adjustments.map((adj) => (
              <ScenarioAdjustmentRow
                key={adj.id}
                adjustment={adj}
                departments={knownDepartments}
                editable={editable}
                onChange={(patch) => updateAdjustment(scenario.id, adj.id, patch)}
                onRemove={() => removeAdjustment(scenario.id, adj.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Per-department breakdown — a low-noise table that helps planners
          see where the headcount changes landed. */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          By department
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-200 dark:border-gray-800">
              <th className="py-2">Department</th>
              <th className="text-right">Today</th>
              <th className="text-right">Projected</th>
              <th className="text-right">Delta</th>
            </tr>
          </thead>
          <tbody>
            {allDepartments(baseline.employeesByDepartment, projected.employeesByDepartment).map(
              (dept) => {
                const cur = baseline.employeesByDepartment[dept] ?? 0
                const proj = projected.employeesByDepartment[dept] ?? 0
                const d = proj - cur
                return (
                  <tr key={dept} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2">{dept}</td>
                    <td className="text-right tabular-nums">{cur}</td>
                    <td className="text-right tabular-nums">{proj}</td>
                    <td
                      className={`text-right tabular-nums ${
                        d > 0 ? 'text-emerald-700' : d < 0 ? 'text-rose-700' : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {d > 0 ? '+' : ''}
                      {d}
                    </td>
                  </tr>
                )
              },
            )}
          </tbody>
        </table>
      </section>
    </section>
  )
}

function allDepartments(
  a: Record<string, number>,
  b: Record<string, number>,
): string[] {
  const set = new Set<string>([...Object.keys(a), ...Object.keys(b)])
  return Array.from(set).sort()
}

function MetricTile({
  label,
  current,
  projected,
  delta,
  formatter,
  deltaFormatter,
  testId,
}: {
  label: string
  current: number
  projected: number
  delta: number
  formatter?: (v: number) => string
  deltaFormatter?: (v: number) => string
  testId?: string
}) {
  const fmt = formatter ?? ((v: number) => v.toString())
  const dfmt = deltaFormatter ?? ((v: number) => (v >= 0 ? `+${v}` : `${v}`))
  const deltaColor =
    delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-rose-700' : 'text-gray-400 dark:text-gray-500'
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded p-3" data-testid={testId}>
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="text-2xl font-semibold tabular-nums">{fmt(projected)}</span>
        <span className={`text-sm tabular-nums ${deltaColor}`}>{dfmt(delta)}</span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">Today: {fmt(current)}</div>
    </div>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full text-left text-sm px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50"
    >
      {children}
    </button>
  )
}
