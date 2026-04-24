import { useMemo } from 'react'
import { useNeighborhoodStore } from '../../../stores/neighborhoodStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useAllFloorElements } from '../../../hooks/useActiveFloorElements'
import type { CanvasElement } from '../../../types/elements'
import {
  computeNeighborhoodMetrics,
  type NeighborhoodHealth,
} from '../../../lib/neighborhoodMetrics'
import { focusElements } from '../../../lib/focusElements'

/**
 * "Neighborhood utilization" section in the insights panel.
 *
 * One row per neighborhood: colour swatch, name, `{assigned}/{capacity}`,
 * health pill, and a % progress bar. Clicking a row calls
 * `focusElements()` on the assignable elements inside that neighborhood
 * so the canvas selects and pans to the zone.
 *
 * PII safety: this list only shows counts (`assigned/capacity`) and
 * names of neighborhoods — never employee names — so no redaction gate
 * is required. The upstream `UtilizationWidgets` follows the same
 * pattern.
 *
 * Renders nothing when there are no neighborhoods on any floor. The
 * matching canvas overlay behaves the same way, keeping a fresh office
 * free of empty widgets.
 */
export function NeighborhoodUtilizationList() {
  const neighborhoodsMap = useNeighborhoodStore((s) => s.neighborhoods)
  const employees = useEmployeeStore((s) => s.employees)
  const floorsWithElements = useAllFloorElements()

  // Merge every floor's elements into one map so a neighborhood on a
  // non-active floor still gets an accurate headcount. Containment
  // math is axis-aligned per-floor via `floorId` on the neighborhood,
  // so we trust the neighborhood's own floor filter implicitly.
  const elements = useMemo(
    () =>
      floorsWithElements.reduce(
        (acc, f) => Object.assign(acc, f.elements),
        {} as Record<string, CanvasElement>,
      ),
    [floorsWithElements],
  )

  const rows = useMemo(() => {
    const list = Object.values(neighborhoodsMap)
    if (list.length === 0) return []
    return computeNeighborhoodMetrics(list, elements, employees)
  }, [neighborhoodsMap, elements, employees])

  if (rows.length === 0) return null

  return (
    <div
      className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-2"
      aria-label="Neighborhood utilization"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        Neighborhood utilization
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((m) => {
          const pct =
            m.totalSeats > 0 ? Math.round(m.occupancyRatio * 100) : 0
          const tone = HEALTH_TONES[m.health]
          return (
            <li key={m.neighborhoodId}>
              <button
                type="button"
                onClick={() => focusElements(m.elementIds)}
                disabled={m.elementIds.length === 0}
                aria-label={`Focus ${m.name}`}
                className="w-full flex items-center gap-2 text-xs text-left rounded px-1 py-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: m.color }}
                />
                <span className="truncate font-medium text-gray-800 dark:text-gray-100 min-w-0">
                  {m.name}
                </span>
                <span className="ml-auto text-gray-500 dark:text-gray-400 whitespace-nowrap text-[11px]">
                  {m.assignedSeats}/{m.totalSeats}
                </span>
                <span
                  className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${tone.pill}`}
                  aria-label={`health ${m.health}`}
                />
              </button>
              <div
                className="h-1 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden mx-1 mb-0.5"
                aria-hidden
              >
                <div
                  className={`h-full ${tone.bar}`}
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const HEALTH_TONES: Record<NeighborhoodHealth, { pill: string; bar: string }> =
  {
    healthy: { pill: 'bg-green-400', bar: 'bg-green-400' },
    warn: { pill: 'bg-amber-400', bar: 'bg-amber-400' },
    critical: { pill: 'bg-red-400', bar: 'bg-red-400' },
    unknown: { pill: 'bg-gray-300', bar: 'bg-gray-300' },
  }
