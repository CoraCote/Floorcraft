import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Scenario, ScenarioAdjustment, ScenarioBaseSnapshot } from '../lib/scenarios'

/**
 * `ScenarioAdjustment` is a discriminated union, so `Omit<..., 'id'>` drops
 * the id but leaves the union intact — callers pass a full variant minus
 * its id. Similarly `AdjustmentPatch` is an open bag of the non-
 * discriminator fields; the store merges it onto the existing adjustment
 * of a known type, so we carry the union variance rather than trying to
 * narrow to one shape.
 */
export type NewAdjustment =
  | { type: 'add-headcount'; department: string; count: number }
  | { type: 'remove-headcount'; department: string; count: number }
  | { type: 'add-seats'; count: number }

export type AdjustmentPatch = {
  department?: string
  count?: number
}

/**
 * Transient store for what-if capacity scenarios.
 *
 * By design, this store uses neither `persist` nor Supabase — scenarios are
 * scratch space, not a long-lived document. A planner spins one up, plays
 * with adjustments, maybe clones it to compare, and walks away. Saving them
 * would tempt people to treat them as a source of truth, which they aren't
 * (they're projections against whatever the roster / elements stores
 * happened to look like when the snapshot was taken).
 *
 * All CRUD paths are immutable: we always return a new scenario object so
 * `useScenariosStore((s) => s.scenarios[id])` selectors re-render only the
 * scenarios that actually changed.
 */
interface ScenariosState {
  /** Ordered list — the UI renders them in creation order. */
  scenarios: Scenario[]
  /** `null` when no scenario is selected or the list is empty. */
  activeScenarioId: string | null
  /**
   * The "other" scenario pinned for side-by-side compare. `null` means the
   * compare view shows "select another scenario". The compare view
   * silently clears this when the targeted scenario is deleted.
   */
  compareScenarioId: string | null

  createScenario: (base: ScenarioBaseSnapshot, name?: string) => string
  cloneScenario: (id: string) => string | null
  renameScenario: (id: string, name: string) => void
  removeScenario: (id: string) => void
  setActiveScenario: (id: string | null) => void
  setCompareScenario: (id: string | null) => void

  addAdjustment: (id: string, adjustment: NewAdjustment) => void
  updateAdjustment: (
    id: string,
    adjustmentId: string,
    patch: AdjustmentPatch,
  ) => void
  removeAdjustment: (id: string, adjustmentId: string) => void

  /** Testing convenience. Never call from production code. */
  reset: () => void
}

/**
 * Pick a default scenario name that doesn't collide with existing
 * entries. "Scenario A", "Scenario B", …; falls back to "Scenario {n}"
 * past Z so we don't run out of letters in a long session.
 */
function defaultName(existing: Scenario[]): string {
  const used = new Set(existing.map((s) => s.name))
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (const letter of ALPHA) {
    const candidate = `Scenario ${letter}`
    if (!used.has(candidate)) return candidate
  }
  return `Scenario ${existing.length + 1}`
}

export const useScenariosStore = create<ScenariosState>((set, get) => ({
  scenarios: [],
  activeScenarioId: null,
  compareScenarioId: null,

  createScenario: (base, name) => {
    const id = nanoid()
    const scenario: Scenario = {
      id,
      name: name ?? defaultName(get().scenarios),
      baseSnapshot: {
        activeEmployees: base.activeEmployees,
        employeesByDepartment: { ...base.employeesByDepartment },
        totalSeats: base.totalSeats,
        assignedSeats: base.assignedSeats,
      },
      adjustments: [],
    }
    set((s) => ({
      scenarios: [...s.scenarios, scenario],
      activeScenarioId: id,
    }))
    return id
  },

  cloneScenario: (id) => {
    const source = get().scenarios.find((s) => s.id === id)
    if (!source) return null
    const newId = nanoid()
    const copy: Scenario = {
      id: newId,
      name: `${source.name} (copy)`,
      baseSnapshot: {
        ...source.baseSnapshot,
        employeesByDepartment: { ...source.baseSnapshot.employeesByDepartment },
      },
      // Re-id each adjustment so later edits to the clone don't share
      // identity with the original. Scenario adjustments are keyed on id
      // in the UI, and sharing keys across two scenarios would let an
      // edit on one flash into the other on the compare view.
      adjustments: source.adjustments.map((a) => ({ ...a, id: nanoid() })),
    }
    set((s) => ({
      scenarios: [...s.scenarios, copy],
      activeScenarioId: newId,
    }))
    return newId
  },

  renameScenario: (id, name) => {
    set((s) => ({
      scenarios: s.scenarios.map((sc) =>
        sc.id === id ? { ...sc, name } : sc,
      ),
    }))
  },

  removeScenario: (id) => {
    set((s) => {
      const remaining = s.scenarios.filter((sc) => sc.id !== id)
      let active = s.activeScenarioId
      if (active === id) active = remaining[0]?.id ?? null
      let compare = s.compareScenarioId
      if (compare === id) compare = null
      return {
        scenarios: remaining,
        activeScenarioId: active,
        compareScenarioId: compare,
      }
    })
  },

  setActiveScenario: (id) => set({ activeScenarioId: id }),
  setCompareScenario: (id) => set({ compareScenarioId: id }),

  addAdjustment: (id, adjustment) => {
    const withId = { ...adjustment, id: nanoid() } as ScenarioAdjustment
    set((s) => ({
      scenarios: s.scenarios.map((sc) =>
        sc.id === id
          ? { ...sc, adjustments: [...sc.adjustments, withId] }
          : sc,
      ),
    }))
  },

  updateAdjustment: (id, adjustmentId, patch) => {
    set((s) => ({
      scenarios: s.scenarios.map((sc) => {
        if (sc.id !== id) return sc
        return {
          ...sc,
          adjustments: sc.adjustments.map((a) =>
            // Type-preserving spread: `patch` can only touch the
            // discriminated-union's non-id/non-type fields, so the union
            // narrowing is safe to carry through.
            a.id === adjustmentId ? ({ ...a, ...patch } as ScenarioAdjustment) : a,
          ),
        }
      }),
    }))
  },

  removeAdjustment: (id, adjustmentId) => {
    set((s) => ({
      scenarios: s.scenarios.map((sc) =>
        sc.id === id
          ? {
              ...sc,
              adjustments: sc.adjustments.filter((a) => a.id !== adjustmentId),
            }
          : sc,
      ),
    }))
  },

  reset: () => set({ scenarios: [], activeScenarioId: null, compareScenarioId: null }),
}))
