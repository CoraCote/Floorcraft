import { useMemo } from 'react'
import { projectScenario, type Scenario } from '../../../lib/scenarios'
import { useScenariosStore } from '../../../stores/scenariosStore'

/**
 * Side-by-side comparison view — two scenarios' projections rendered in
 * two columns so a planner can tell, at a glance, which scheme lands at
 * a healthier occupancy. Deliberately read-only: editing happens in the
 * detail pane, and the compare tab exists to make tradeoffs visible.
 *
 * If the user hasn't pinned a second scenario yet, the right column
 * shows a picker.
 */
export interface ScenarioCompareViewProps {
  primary: Scenario
  /** The user's pinned "B" scenario, or null if not yet chosen. */
  other: Scenario | null
  /** All scenarios, for the "pick a scenario to compare" dropdown. */
  allScenarios: readonly Scenario[]
}

export function ScenarioCompareView({ primary, other, allScenarios }: ScenarioCompareViewProps) {
  const setCompareScenario = useScenariosStore((s) => s.setCompareScenario)

  const projA = useMemo(
    () => projectScenario(primary.baseSnapshot, primary.adjustments),
    [primary.baseSnapshot, primary.adjustments],
  )
  const projB = useMemo(
    () =>
      other
        ? projectScenario(other.baseSnapshot, other.adjustments)
        : null,
    [other],
  )

  const candidates = allScenarios.filter((s) => s.id !== primary.id)

  return (
    <section className="flex-1 p-6 overflow-y-auto">
      <header className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-semibold">Compare scenarios</h2>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ScenarioColumn
          title={primary.name}
          projection={projA}
          adjustments={primary.adjustments.length}
        />
        {other && projB ? (
          <ScenarioColumn
            title={other.name}
            projection={projB}
            adjustments={other.adjustments.length}
          />
        ) : (
          <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded p-6 flex flex-col items-center justify-center gap-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">Pick a scenario to compare</p>
            <select
              aria-label="Compare against"
              className="text-sm px-2 py-1 border border-gray-200 dark:border-gray-800 rounded"
              value=""
              onChange={(e) => setCompareScenario(e.target.value || null)}
            >
              <option value="">Select…</option>
              {candidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Quick-delta strip under the columns when both are chosen. */}
      {other && projB && (
        <section className="mt-6 border border-gray-200 dark:border-gray-800 rounded p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            {primary.name} vs. {other.name}
          </h3>
          <ul className="text-sm space-y-1">
            <DeltaLine
              label="Active employees"
              a={projA.activeEmployees}
              b={projB.activeEmployees}
            />
            <DeltaLine label="Total seats" a={projA.totalSeats} b={projB.totalSeats} />
            <DeltaLine
              label="Occupancy"
              a={projA.occupancyRatio}
              b={projB.occupancyRatio}
              formatter={(v) => `${Math.round(v * 100)}%`}
            />
          </ul>
          <button
            type="button"
            onClick={() => setCompareScenario(null)}
            className="mt-3 text-xs text-gray-500 dark:text-gray-400 underline hover:text-gray-700 dark:hover:text-gray-200"
          >
            Clear comparison
          </button>
        </section>
      )}
    </section>
  )
}

function ScenarioColumn({
  title,
  projection,
  adjustments,
}: {
  title: string
  projection: ReturnType<typeof projectScenario>
  adjustments: number
}) {
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded p-4">
      <header className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {adjustments} adjustment{adjustments === 1 ? '' : 's'}
        </div>
      </header>
      <dl className="text-sm space-y-1">
        <Row label="Active employees" value={projection.activeEmployees} />
        <Row label="Total seats" value={projection.totalSeats} />
        <Row
          label="Occupancy"
          value={`${Math.round(projection.occupancyRatio * 100)}%`}
        />
      </dl>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

function DeltaLine({
  label,
  a,
  b,
  formatter,
}: {
  label: string
  a: number
  b: number
  formatter?: (v: number) => string
}) {
  const fmt = formatter ?? ((v: number) => v.toString())
  const diff = b - a
  const diffColor =
    diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-rose-700' : 'text-gray-400 dark:text-gray-500'
  const sign = diff > 0 ? '+' : ''
  const diffText = formatter ? `${sign}${Math.round(diff * 100)}pp` : `${sign}${diff}`
  return (
    <li className="flex justify-between">
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
      <span className="tabular-nums">
        {fmt(a)} → {fmt(b)} <span className={diffColor}>({diffText})</span>
      </span>
    </li>
  )
}
