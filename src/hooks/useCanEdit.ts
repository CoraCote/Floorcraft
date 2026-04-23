import { useCan } from './useCan'

/**
 * Legacy shim. Returns true if the viewer can edit either the map or
 * the roster. New code should call `useCan('editMap')` or
 * `useCan('editRoster')` directly so hr-editor vs space-planner gating
 * is correct. Kept only to avoid a mass rewrite of surfaces that span
 * both map and roster (e.g. undo/redo).
 */
export function useCanEdit(): boolean {
  const canMap = useCan('editMap')
  const canRoster = useCan('editRoster')
  return canMap || canRoster
}
