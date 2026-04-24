import type { ScenarioAdjustment } from '../../../lib/scenarios'
import type { AdjustmentPatch } from '../../../stores/scenariosStore'

/**
 * One editable row in the adjustment list. Renders a type-specific pair
 * of controls (department + count, or just count for `add-seats`) plus a
 * delete button. All edits flow up through the callbacks — this component
 * has no state of its own, which keeps the detail pane's projection
 * recomputation straightforward (a single source of truth in the store).
 */
export interface ScenarioAdjustmentRowProps {
  adjustment: ScenarioAdjustment
  /**
   * All department names the scenario knows about (baseline + anything
   * adjustments have conjured). Used to populate the dropdown so planners
   * don't have to re-type names each time — but the dropdown is still a
   * free-text input underneath via a datalist so new departments can be
   * added without a separate flow.
   */
  departments: readonly string[]
  editable: boolean
  onChange: (patch: AdjustmentPatch) => void
  onRemove: () => void
}

export function ScenarioAdjustmentRow({
  adjustment,
  departments,
  editable,
  onChange,
  onRemove,
}: ScenarioAdjustmentRowProps) {
  const isSeatsRow = adjustment.type === 'add-seats'
  const label =
    adjustment.type === 'add-headcount'
      ? 'Hire'
      : adjustment.type === 'remove-headcount'
        ? 'Remove'
        : 'Add seats'

  // Shared datalist id — rendered once in the detail pane would be
  // cleaner, but datalist is globally addressable and Safari is happy
  // with multiple identical ones so this keeps the row self-contained.
  const datalistId = `scenario-dept-list-${adjustment.id}`

  return (
    <div
      className="flex items-center gap-2 text-sm border border-gray-200 rounded px-2 py-1.5"
      data-testid="scenario-adjustment-row"
    >
      <span
        className={`inline-block text-xs font-semibold uppercase tracking-wide w-20 ${
          adjustment.type === 'remove-headcount'
            ? 'text-rose-700'
            : 'text-emerald-700'
        }`}
      >
        {label}
      </span>

      {adjustment.type !== 'add-seats' && (
        <>
          <input
            type="text"
            aria-label="Department"
            className="flex-1 px-2 py-1 border border-gray-200 rounded disabled:bg-gray-50 disabled:text-gray-500"
            list={datalistId}
            value={adjustment.department}
            disabled={!editable}
            onChange={(e) => onChange({ department: e.target.value })}
            placeholder="Department"
          />
          <datalist id={datalistId}>
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </>
      )}

      <input
        type="number"
        min={0}
        step={1}
        aria-label={isSeatsRow ? 'Seat count' : 'Headcount'}
        className="w-24 px-2 py-1 border border-gray-200 rounded tabular-nums disabled:bg-gray-50 disabled:text-gray-500"
        value={adjustment.count}
        disabled={!editable}
        onChange={(e) => {
          // Guard against NaN when the input is cleared — treat empty as
          // zero so the projection stays well-defined.
          const raw = e.target.value
          const parsed = raw === '' ? 0 : Number(raw)
          onChange({ count: Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0 })
        }}
      />

      {isSeatsRow && (
        <span className="text-xs text-gray-500">seats</span>
      )}

      {editable && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove adjustment"
          className="ml-auto text-gray-400 hover:text-rose-600 text-lg leading-none px-1"
          title="Remove"
        >
          ×
        </button>
      )}
    </div>
  )
}
