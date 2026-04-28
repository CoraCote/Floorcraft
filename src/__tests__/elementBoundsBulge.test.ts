import { describe, it, expect } from 'vitest'
import { elementBounds } from '../lib/elementBounds'
import { segmentBounds, wallSegments } from '../lib/wallPath'
import type { WallElement } from '../types/elements'

/**
 * Bulge-aware AABB tests. The straight-wall code path is covered in
 * `elementBounds.test.ts`; this file exercises curved walls so a bulge
 * that pushes geometry beyond the chord rectangle stops getting clipped
 * by selection / fit-to-screen / marquee bounds.
 */

function wall(points: number[], bulges?: number[]): WallElement {
  return {
    id: 'w1',
    type: 'wall',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: '',
    visible: true,
    style: { fill: 'transparent', stroke: '#000', strokeWidth: 4, opacity: 1 },
    points,
    bulges,
    thickness: 4,
    wallType: 'solid',
  }
}

describe('segmentBounds', () => {
  it('returns chord min/max for a straight segment', () => {
    const [seg] = wallSegments([0, 0, 100, 50])
    expect(segmentBounds(seg)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 50,
    })
  })

  it('extends upward by sagitta for a positive horizontal-chord bulge', () => {
    // Horizontal chord from (0,0) → (100,0) with bulge = +20 lifts the
    // arc up (screen coords y-down: positive bulge = "above" the chord).
    const [seg] = wallSegments([0, 0, 100, 0], [20])
    const b = segmentBounds(seg)
    expect(b.minX).toBeCloseTo(0, 6)
    expect(b.maxX).toBeCloseTo(100, 6)
    expect(b.maxY).toBeCloseTo(0, 6) // chord stays at y=0
    expect(b.minY).toBeCloseTo(-20, 6) // arc midpoint at y=-20
  })

  it('extends downward by sagitta for a negative horizontal-chord bulge', () => {
    const [seg] = wallSegments([0, 0, 100, 0], [-20])
    const b = segmentBounds(seg)
    expect(b.minY).toBeCloseTo(0, 6)
    expect(b.maxY).toBeCloseTo(20, 6)
  })

  it('adds the half-circle cardinal extreme for a maxed-out positive bulge', () => {
    // bulge = chord/2 = 50 ⇒ exact semicircle, radius 50, centered at
    // (50, 0). Arc sweeps through the top of the circle, so the AABB
    // should span y ∈ [-50, 0].
    const [seg] = wallSegments([0, 0, 100, 0], [50])
    const b = segmentBounds(seg)
    expect(b.minX).toBeCloseTo(0, 6)
    expect(b.maxX).toBeCloseTo(100, 6)
    expect(b.minY).toBeCloseTo(-50, 6)
    expect(b.maxY).toBeCloseTo(0, 6)
  })

  it('handles a vertical chord with positive bulge (arc to the right)', () => {
    // Vertical chord (0,0)→(0,100), positive bulge. In our sign
    // convention left-normal of (dx=0, dy=100) is (dy/c,-dx/c) = (1,0),
    // so positive bulge moves the arc to the +x side. Sagitta = 30.
    const [seg] = wallSegments([0, 0, 0, 100], [30])
    const b = segmentBounds(seg)
    expect(b.minY).toBeCloseTo(0, 6)
    expect(b.maxY).toBeCloseTo(100, 6)
    expect(b.minX).toBeCloseTo(0, 6)
    expect(b.maxX).toBeCloseTo(30, 6)
  })

  it('handles a diagonal chord — arc midpoint falls outside the chord box', () => {
    // Chord (0,0)→(100,100). Left-normal is (dy/c,-dx/c) = (1/√2,-1/√2),
    // so positive bulge pushes the arc up-and-to-the-right. With a small
    // bulge the arc midpoint (50 + lnx·s, 50 + lny·s) shifts but stays
    // inside the chord box on x; on y it goes below 0. We check both
    // endpoints survive and the AABB grew on the correct axis.
    const [seg] = wallSegments([0, 0, 100, 100], [20])
    const b = segmentBounds(seg)
    // Endpoints survive.
    expect(b.minX).toBeLessThanOrEqual(0)
    expect(b.maxX).toBeGreaterThanOrEqual(100)
    expect(b.minY).toBeLessThanOrEqual(0)
    expect(b.maxY).toBeGreaterThanOrEqual(100)
    // The bulge is small (sagitta 20, chord 141.4) so the arc itself
    // doesn't reach a cardinal of the underlying circle — the AABB
    // should be just slightly larger than the chord box on the
    // upper-right side and unchanged on the others.
    expect(b.minX).toBe(0)
    expect(b.minY).toBe(0)
  })

  it('returns chord box for a zero-length chord with non-zero bulge', () => {
    // Defensive case — degenerate input shouldn't NaN out the bounds.
    const [seg] = wallSegments([10, 10, 10, 10], [5])
    expect(segmentBounds(seg)).toEqual({
      minX: 10,
      minY: 10,
      maxX: 10,
      maxY: 10,
    })
  })
})

describe('elementBounds (wall, bulge-aware)', () => {
  it('matches the chord box when no bulges are present', () => {
    const b = elementBounds(wall([0, 0, 100, 0, 100, 50]))
    expect(b).toEqual({ x: 0, y: 0, width: 100, height: 50 })
  })

  it('stretches upward when a horizontal segment bulges up', () => {
    // Two-vertex wall, single bulged segment. Old (chord-only) bounds
    // would report height 0; new bounds capture the sagitta.
    const b = elementBounds(wall([0, 0, 100, 0], [20]))
    expect(b).not.toBeNull()
    expect(b!.x).toBeCloseTo(0, 6)
    expect(b!.y).toBeCloseTo(-20, 6)
    expect(b!.width).toBeCloseTo(100, 6)
    expect(b!.height).toBeCloseTo(20, 6)
  })

  it('unions per-segment bounds for a multi-segment wall mixing straight + arc', () => {
    // Three vertices: straight (0,0)→(100,0), then bulged (100,0)→(100,50).
    // Vertical second segment with positive bulge pushes arc to +x by sagitta=15.
    const b = elementBounds(
      wall([0, 0, 100, 0, 100, 50], [0, 15]),
    )
    expect(b).not.toBeNull()
    expect(b!.x).toBeCloseTo(0, 6)
    expect(b!.y).toBeCloseTo(0, 6)
    // Width grows from chord max (100) to chord+sagitta (115).
    expect(b!.width).toBeCloseTo(115, 6)
    expect(b!.height).toBeCloseTo(50, 6)
  })

  it('captures the full semicircle envelope on a maxed-out bulge', () => {
    // Single semicircle. Old bounds said height=0; new bounds say 50.
    const b = elementBounds(wall([0, 0, 100, 0], [50]))
    expect(b!.height).toBeCloseTo(50, 6)
    expect(b!.y).toBeCloseTo(-50, 6)
  })

  it('falls back to the point itself for a single-vertex wall', () => {
    // Edge case: not a real wall, but the tooling occasionally creates
    // a one-point shell while drawing — return a coordinate so callers
    // anchored to bounds (e.g. selection-pulse origin) don't crash.
    expect(elementBounds(wall([42, 17]))).toEqual({
      x: 42,
      y: 17,
      width: 0,
      height: 0,
    })
  })

  it('still returns null for a totally empty wall', () => {
    expect(elementBounds(wall([]))).toBeNull()
  })
})
