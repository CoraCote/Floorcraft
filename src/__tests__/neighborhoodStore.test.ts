import { describe, it, expect, beforeEach } from 'vitest'
import { useNeighborhoodStore } from '../stores/neighborhoodStore'
import type { Neighborhood } from '../types/neighborhood'

function makeNb(overrides: Partial<Neighborhood> = {}): Neighborhood {
  return {
    id: 'n1',
    name: 'Engineering Pod A',
    color: '#3B82F6',
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    floorId: 'floor-1',
    department: null,
    team: null,
    notes: null,
    ...overrides,
  }
}

beforeEach(() => {
  useNeighborhoodStore.getState().clearAll()
  // Clear temporal history too so undo tests start from a clean slate.
  useNeighborhoodStore.temporal.getState().clear()
})

describe('neighborhoodStore', () => {
  it('addNeighborhood inserts into the map by id', () => {
    useNeighborhoodStore.getState().addNeighborhood(makeNb())
    const state = useNeighborhoodStore.getState().neighborhoods
    expect(Object.keys(state)).toEqual(['n1'])
    expect(state.n1.name).toBe('Engineering Pod A')
  })

  it('updateNeighborhood patches an existing neighborhood', () => {
    const store = useNeighborhoodStore.getState()
    store.addNeighborhood(makeNb())
    store.updateNeighborhood('n1', { name: 'Renamed Pod', department: 'Engineering' })
    const out = useNeighborhoodStore.getState().neighborhoods.n1
    expect(out.name).toBe('Renamed Pod')
    expect(out.department).toBe('Engineering')
    // Unpatched fields stay intact.
    expect(out.color).toBe('#3B82F6')
  })

  it('updateNeighborhood on a missing id is a no-op', () => {
    const before = useNeighborhoodStore.getState().neighborhoods
    useNeighborhoodStore.getState().updateNeighborhood('ghost', { name: 'x' })
    expect(useNeighborhoodStore.getState().neighborhoods).toEqual(before)
  })

  it('deleteNeighborhood removes the entry', () => {
    const store = useNeighborhoodStore.getState()
    store.addNeighborhood(makeNb())
    store.addNeighborhood(makeNb({ id: 'n2' }))
    store.deleteNeighborhood('n1')
    const out = useNeighborhoodStore.getState().neighborhoods
    expect(Object.keys(out)).toEqual(['n2'])
  })

  it('clearAll empties the map', () => {
    const store = useNeighborhoodStore.getState()
    store.addNeighborhood(makeNb())
    store.addNeighborhood(makeNb({ id: 'n2' }))
    store.clearAll()
    expect(useNeighborhoodStore.getState().neighborhoods).toEqual({})
  })

  it('undo walks back the last add', () => {
    const store = useNeighborhoodStore.getState()
    store.addNeighborhood(makeNb())
    expect(Object.keys(useNeighborhoodStore.getState().neighborhoods)).toEqual(['n1'])
    useNeighborhoodStore.temporal.getState().undo()
    expect(useNeighborhoodStore.getState().neighborhoods).toEqual({})
  })

  it('redo replays an undone add', () => {
    const store = useNeighborhoodStore.getState()
    store.addNeighborhood(makeNb())
    useNeighborhoodStore.temporal.getState().undo()
    expect(useNeighborhoodStore.getState().neighborhoods).toEqual({})
    useNeighborhoodStore.temporal.getState().redo()
    expect(Object.keys(useNeighborhoodStore.getState().neighborhoods)).toEqual(['n1'])
  })

  it('undo walks back an update to the prior value', () => {
    const store = useNeighborhoodStore.getState()
    store.addNeighborhood(makeNb())
    store.updateNeighborhood('n1', { name: 'After' })
    expect(useNeighborhoodStore.getState().neighborhoods.n1.name).toBe('After')
    useNeighborhoodStore.temporal.getState().undo()
    expect(useNeighborhoodStore.getState().neighborhoods.n1.name).toBe('Engineering Pod A')
  })

  it('undo walks back a delete', () => {
    const store = useNeighborhoodStore.getState()
    store.addNeighborhood(makeNb())
    store.deleteNeighborhood('n1')
    expect(useNeighborhoodStore.getState().neighborhoods).toEqual({})
    useNeighborhoodStore.temporal.getState().undo()
    expect(useNeighborhoodStore.getState().neighborhoods.n1).toBeTruthy()
  })
})
