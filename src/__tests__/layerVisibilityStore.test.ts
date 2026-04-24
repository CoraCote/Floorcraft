import { describe, it, expect, beforeEach } from 'vitest'
import {
  useLayerVisibilityStore,
  LAYER_CATEGORIES,
} from '../stores/layerVisibilityStore'

beforeEach(() => {
  useLayerVisibilityStore.getState().reset()
})

describe('useLayerVisibilityStore', () => {
  it('starts with every category visible', () => {
    const { visible } = useLayerVisibilityStore.getState()
    for (const c of LAYER_CATEGORIES) expect(visible[c]).toBe(true)
  })

  it('toggle flips a category between visible / hidden', () => {
    const { toggle } = useLayerVisibilityStore.getState()
    toggle('walls')
    expect(useLayerVisibilityStore.getState().visible.walls).toBe(false)
    toggle('walls')
    expect(useLayerVisibilityStore.getState().visible.walls).toBe(true)
  })

  it('hide sets a single category false without touching others', () => {
    const { hide } = useLayerVisibilityStore.getState()
    hide('seating')
    const v = useLayerVisibilityStore.getState().visible
    expect(v.seating).toBe(false)
    expect(v.walls).toBe(true)
    expect(v.rooms).toBe(true)
    expect(v.furniture).toBe(true)
    expect(v.annotations).toBe(true)
  })

  it('show forces a category visible even if it was hidden', () => {
    const { hide, show } = useLayerVisibilityStore.getState()
    hide('annotations')
    expect(useLayerVisibilityStore.getState().visible.annotations).toBe(false)
    show('annotations')
    expect(useLayerVisibilityStore.getState().visible.annotations).toBe(true)
  })

  it('reset restores every category to visible', () => {
    const { hide, reset } = useLayerVisibilityStore.getState()
    hide('walls')
    hide('seating')
    reset()
    const v = useLayerVisibilityStore.getState().visible
    for (const c of LAYER_CATEGORIES) expect(v[c]).toBe(true)
  })
})
