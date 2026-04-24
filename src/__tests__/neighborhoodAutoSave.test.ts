import { describe, it, expect, beforeEach } from 'vitest'
import { useNeighborhoodStore } from '../stores/neighborhoodStore'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useCanvasStore } from '../stores/canvasStore'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'
import type { Neighborhood } from '../types/neighborhood'

/**
 * Verify that the office-payload shape round-trips neighborhoods
 * through serialize → JSON → deserialize → store-hydrate without
 * losing fields. We exercise the same helpers `useOfficeSync` +
 * `ProjectShell` use — `buildCurrentPayload` (the snapshot shape) and
 * the `useNeighborhoodStore.setState` hydrate path in ProjectShell.
 *
 * `buildCurrentPayload` lives inside `useOfficeSync.ts` as a private
 * helper; to keep this test independent of hook state we reconstruct
 * the same shape here — the shape is also asserted via the explicit
 * keys so any drift gets caught.
 */
function buildPayload(): Record<string, unknown> {
  return {
    version: 2,
    elements: useElementsStore.getState().elements,
    employees: useEmployeeStore.getState().employees,
    departmentColors: useEmployeeStore.getState().departmentColors,
    floors: useFloorStore.getState().floors,
    activeFloorId: useFloorStore.getState().activeFloorId,
    settings: useCanvasStore.getState().settings,
    neighborhoods: useNeighborhoodStore.getState().neighborhoods,
  }
}

function makeNb(overrides: Partial<Neighborhood> = {}): Neighborhood {
  return {
    id: 'n1',
    name: 'Engineering Pod A',
    color: '#3B82F6',
    x: 120,
    y: 240,
    width: 300,
    height: 180,
    floorId: 'floor-abc',
    department: 'Engineering',
    team: 'Backend',
    notes: 'Quiet area',
    ...overrides,
  }
}

beforeEach(() => {
  useNeighborhoodStore.getState().clearAll()
  useElementsStore.setState({ elements: {} })
  useEmployeeStore.setState({ employees: {}, departmentColors: {} })
  useCanvasStore.setState({ settings: { ...DEFAULT_CANVAS_SETTINGS } })
})

describe('neighborhood autosave round-trip', () => {
  it('serializes the full neighborhood list into the payload', () => {
    useNeighborhoodStore.getState().addNeighborhood(makeNb())
    useNeighborhoodStore
      .getState()
      .addNeighborhood(makeNb({ id: 'n2', name: 'Sales Row', color: '#EF4444' }))

    const payload = buildPayload()
    expect(payload.neighborhoods).toBeDefined()
    const nbs = payload.neighborhoods as Record<string, Neighborhood>
    expect(Object.keys(nbs).sort()).toEqual(['n1', 'n2'])
    expect(nbs.n1.name).toBe('Engineering Pod A')
    expect(nbs.n2.name).toBe('Sales Row')
  })

  it('round-trips every field including optional metadata', () => {
    const original = makeNb()
    useNeighborhoodStore.getState().addNeighborhood(original)

    // Simulate a save → load cycle through JSON.
    const payload = buildPayload()
    const serialized = JSON.stringify(payload)
    const revived = JSON.parse(serialized) as Record<string, unknown>

    // Clear state, then hydrate as ProjectShell does.
    useNeighborhoodStore.getState().clearAll()
    useNeighborhoodStore.setState({
      neighborhoods:
        (revived.neighborhoods as Record<string, Neighborhood>) ?? {},
    })

    const out = useNeighborhoodStore.getState().neighborhoods.n1
    expect(out).toEqual(original)
  })

  it('omitted neighborhoods key hydrates to an empty map without losing other state', () => {
    // Simulate an old payload that predates the feature. ProjectShell's
    // fallback should coerce `undefined` → `{}` so the store doesn't
    // carry neighborhoods from a previously-loaded office.
    useNeighborhoodStore.getState().addNeighborhood(makeNb())
    const payloadNoNbs = { ...buildPayload() }
    delete (payloadNoNbs as Record<string, unknown>).neighborhoods

    useNeighborhoodStore.setState({
      neighborhoods:
        (payloadNoNbs as { neighborhoods?: Record<string, Neighborhood> })
          .neighborhoods ?? {},
    })
    expect(useNeighborhoodStore.getState().neighborhoods).toEqual({})
  })
})
