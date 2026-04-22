import { describe, it, expect, afterEach } from 'vitest'
import type Konva from 'konva'
import { getActiveStage, setActiveStage } from '../lib/stageRegistry'

describe('stageRegistry', () => {
  afterEach(() => {
    setActiveStage(null)
  })

  it('returns null when no stage has been registered', () => {
    expect(getActiveStage()).toBeNull()
  })

  it('returns the stage after it has been registered', () => {
    // We don't need a real Konva stage — the registry just stores a
    // reference and hands it back unchanged. An opaque stand-in is enough.
    const fakeStage = { __brand: 'konva-stage' } as unknown as Konva.Stage
    setActiveStage(fakeStage)
    expect(getActiveStage()).toBe(fakeStage)
  })

  it('clears the reference when set back to null (e.g. canvas unmount)', () => {
    const fakeStage = { __brand: 'konva-stage' } as unknown as Konva.Stage
    setActiveStage(fakeStage)
    expect(getActiveStage()).toBe(fakeStage)
    setActiveStage(null)
    expect(getActiveStage()).toBeNull()
  })

  it('overwrites an earlier registration (e.g. hot remount)', () => {
    const a = { id: 'a' } as unknown as Konva.Stage
    const b = { id: 'b' } as unknown as Konva.Stage
    setActiveStage(a)
    setActiveStage(b)
    expect(getActiveStage()).toBe(b)
  })
})
