import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useElementsStore } from '../../stores/elementsStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useNeighborhoodStore } from '../../stores/neighborhoodStore'
import { analyzePlan, type PlanHealth } from '../../lib/planHealth'
import { PlanHealthDrawer } from './PlanHealthDrawer'

/**
 * Compact aggregate-status pill for the TopBar that summarizes structural
 * issues across the active office. Inspired by JSON Crack's "Valid" pill —
 * but smarter: clicking opens a drawer that lists every issue with a
 * "Jump to" action.
 *
 * Three visual states + matching icons:
 *   green  / CheckCircle2   "Plan healthy"  (no errors AND no warnings)
 *   amber  / AlertTriangle  "<n> warning(s)"  (warnings only)
 *   red    / AlertCircle    "<n> issue(s)"   (errors + warnings combined)
 *
 * The analyzer is invoked via `useMemo` so we only re-analyze when one of
 * the underlying snapshots changes — not on every TopBar render.
 */
export function PlanHealthPill() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Pull the snapshots the analyzer needs. We deliberately read live
  // `useElementsStore.elements` for the active floor (that map mirrors the
  // currently-edited content) and merge it with the per-floor snapshots in
  // floorStore for inactive floors. This matches the rest of the editor
  // (FloorSwitcher, focusElements) and avoids stale data after a floor
  // switch.
  const { floors, activeFloorId } = useFloorStore(
    useShallow((s) => ({
      floors: s.floors,
      activeFloorId: s.activeFloorId,
    })),
  )
  const activeElements = useElementsStore((s) => s.elements)
  const employees = useEmployeeStore((s) => s.employees)
  const neighborhoods = useNeighborhoodStore((s) => s.neighborhoods)

  const health: PlanHealth = useMemo(() => {
    const floorIds: string[] = []
    const elementsByFloorMap: Record<string, Record<string, (typeof activeElements)[string]>> = {}
    for (const f of floors) {
      floorIds.push(f.id)
      elementsByFloorMap[f.id] =
        f.id === activeFloorId ? activeElements : f.elements
    }

    // Bucket neighborhoods by floorId so the analyzer can look them up by
    // floor without re-scanning the whole map.
    const neighborhoodsByFloor: Record<string, Record<string, (typeof neighborhoods)[string]>> = {}
    for (const f of floors) neighborhoodsByFloor[f.id] = {}
    for (const id in neighborhoods) {
      const n = neighborhoods[id]
      if (n.floorId in neighborhoodsByFloor) {
        neighborhoodsByFloor[n.floorId][id] = n
      }
    }

    return analyzePlan({
      elementsByFloor: elementsByFloorMap,
      neighborhoodsByFloor,
      employees,
      floorIds,
      activeFloorId,
    })
  }, [floors, activeFloorId, activeElements, employees, neighborhoods])

  const total = health.errorCount + health.warningCount + health.infoCount
  const hasError = health.errorCount > 0
  const hasWarning = health.warningCount > 0

  let pillClass: string
  let Icon: typeof AlertCircle
  let label: string
  let ariaLabel: string

  if (hasError) {
    pillClass =
      'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
    Icon = AlertCircle
    const issues = health.errorCount + health.warningCount
    label = `${issues} issue${issues === 1 ? '' : 's'}`
    ariaLabel = `Plan health: ${issues} issue${issues === 1 ? '' : 's'} (${health.errorCount} error${health.errorCount === 1 ? '' : 's'})`
  } else if (hasWarning) {
    pillClass =
      'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
    Icon = AlertTriangle
    label = `${health.warningCount} warning${health.warningCount === 1 ? '' : 's'}`
    ariaLabel = `Plan health: ${label}`
  } else {
    pillClass =
      'border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300'
    Icon = CheckCircle2
    label = total === 0 ? 'Plan healthy' : `${health.infoCount} info`
    ariaLabel =
      total === 0
        ? 'Plan healthy: no structural issues detected'
        : `Plan health: ${health.infoCount} informational note${health.infoCount === 1 ? '' : 's'}`
  }

  return (
    <>
      <button
        onClick={() => setDrawerOpen(true)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${pillClass}`}
        aria-label={ariaLabel}
        data-testid="plan-health-pill"
      >
        <Icon size={14} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {drawerOpen && (
        <PlanHealthDrawer
          health={health}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  )
}
