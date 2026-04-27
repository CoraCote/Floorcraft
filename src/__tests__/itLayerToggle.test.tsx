/**
 * M2 — IT-layer toggle store + canvas filter integration.
 *
 * The store owns four booleans (`network`, `av`, `security`, `power`),
 * mirrors each into localStorage on flip, and is consumed by
 * `ElementRenderer` to drop matching elements out of the render set.
 * These tests pin all three responsibilities so a future refactor can't
 * accidentally drop persistence or the AND-of-OFFs filter contract.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useITLayerStore } from '../stores/itLayerStore'
import { categoryForElement } from '../lib/layerCategory'
import type { CanvasElement } from '../types/elements'

function el(type: CanvasElement['type'], id = 't1'): CanvasElement {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: '',
    visible: true,
    style: { fill: '#000', stroke: '#000', strokeWidth: 1, opacity: 1 },
  } as unknown as CanvasElement
}

describe('itLayerStore — defaults + toggle + persist', () => {
  beforeEach(() => {
    localStorage.clear()
    // Reset the store to a fully-visible baseline. Calling `reset()`
    // also rewrites the four localStorage keys to '1' which is exactly
    // what we want for first-run-style assertions below.
    useITLayerStore.getState().reset()
  })

  it('defaults all four sub-layers to visible', () => {
    const v = useITLayerStore.getState().visible
    expect(v.network).toBe(true)
    expect(v.av).toBe(true)
    expect(v.security).toBe(true)
    expect(v.power).toBe(true)
  })

  it('toggle flips a single sub-layer without affecting siblings', () => {
    useITLayerStore.getState().toggle('network')
    const v1 = useITLayerStore.getState().visible
    expect(v1.network).toBe(false)
    expect(v1.av).toBe(true)
    expect(v1.security).toBe(true)
    expect(v1.power).toBe(true)

    useITLayerStore.getState().toggle('network')
    expect(useITLayerStore.getState().visible.network).toBe(true)
  })

  it('persists each sub-layer under its own localStorage key', () => {
    useITLayerStore.getState().toggle('av')
    expect(localStorage.getItem('floocraft.itLayer.av')).toBe('0')
    expect(localStorage.getItem('floocraft.itLayer.network')).toBe('1')
    useITLayerStore.getState().show('av')
    expect(localStorage.getItem('floocraft.itLayer.av')).toBe('1')
  })

  it('hide() / show() commit immediately', () => {
    useITLayerStore.getState().hide('security')
    expect(useITLayerStore.getState().visible.security).toBe(false)
    expect(localStorage.getItem('floocraft.itLayer.security')).toBe('0')
    useITLayerStore.getState().show('security')
    expect(useITLayerStore.getState().visible.security).toBe(true)
  })

  it('reset() restores all four sub-layers to visible', () => {
    useITLayerStore.getState().hide('network')
    useITLayerStore.getState().hide('power')
    useITLayerStore.getState().reset()
    const v = useITLayerStore.getState().visible
    expect(v.network).toBe(true)
    expect(v.av).toBe(true)
    expect(v.security).toBe(true)
    expect(v.power).toBe(true)
  })
})

describe('categoryForElement — IT-device routing', () => {
  it('routes all six device types to the new it-device category', () => {
    expect(categoryForElement(el('access-point'))).toBe('it-device')
    expect(categoryForElement(el('network-jack'))).toBe('it-device')
    expect(categoryForElement(el('display'))).toBe('it-device')
    expect(categoryForElement(el('video-bar'))).toBe('it-device')
    expect(categoryForElement(el('badge-reader'))).toBe('it-device')
    expect(categoryForElement(el('outlet'))).toBe('it-device')
  })

  it('keeps non-IT elements out of the it-device category', () => {
    expect(categoryForElement(el('desk'))).not.toBe('it-device')
    expect(categoryForElement(el('wall'))).not.toBe('it-device')
    expect(categoryForElement(el('sofa'))).not.toBe('it-device')
  })
})
