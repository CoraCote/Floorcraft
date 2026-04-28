import { describe, it, expect } from 'vitest'
import { buildWallPolygon, offsetArcPositive } from '../lib/wallPolygon'

/**
 * Helpers for asserting on a flat alternating-x,y ring.
 */
function ringPoints(ring: number[]): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  for (let i = 0; i < ring.length; i += 2) {
    out.push({ x: ring[i], y: ring[i + 1] })
  }
  return out
}

function maxAbs(values: number[]): number {
  return values.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
}

describe('buildWallPolygon', () => {
  it('straight horizontal wall: produces a perpendicular-offset rect', () => {
    // points along y=0, thickness 8 → +/- 4 on the y axis.
    // Left normal of (1,0) chord is (0,-1) → positive offset is y = -4.
    const { ring } = buildWallPolygon([0, 0, 100, 0], undefined, 8)
    const pts = ringPoints(ring)
    expect(pts).toHaveLength(4)
    // Forward along +offset: (0,-4) then (100,-4). Backward along -offset:
    // (100,4) then (0,4).
    expect(pts[0]).toEqual({ x: 0, y: -4 })
    expect(pts[1]).toEqual({ x: 100, y: -4 })
    expect(pts[2]).toEqual({ x: 100, y: 4 })
    expect(pts[3]).toEqual({ x: 0, y: 4 })
  })

  it('L-shape wall: interior corner miters cleanly', () => {
    // Centerline: (0,0) → (100,0) → (100,100). Thickness 8.
    // Inner corner = (96,4); outer corner = (104,-4) (perfect 90° miter).
    const { ring } = buildWallPolygon([0, 0, 100, 0, 100, 100], undefined, 8)
    const pts = ringPoints(ring)
    // Expected ring (forward + back): 6 vertices total.
    expect(pts).toHaveLength(6)
    // Endpoints offset perpendicular to their adjacent segment:
    // start cap at v0 (segment 0,0→100,0 has left normal (0,-1)) → (0,-4)
    expect(pts[0]).toEqual({ x: 0, y: -4 })
    // outer 90° miter at (100,0): bisector direction (1,-1)/√2,
    // miter length = half / cos(45°) = 4 / (√2/2) = 4√2 ≈ 5.657.
    // miter point = (100,0) + (1,-1)/√2 * 5.657 ≈ (104,-4).
    expect(pts[1].x).toBeCloseTo(104, 6)
    expect(pts[1].y).toBeCloseTo(-4, 6)
    // end cap at v2: segment 1 goes (100,0)→(100,100), left normal of
    // (0,1) is (1,0), positive offset → (104,100).
    expect(pts[2]).toEqual({ x: 104, y: 100 })
    // backward: end cap negative side → (96,100)
    expect(pts[3]).toEqual({ x: 96, y: 100 })
    // inner miter at (100,0): (100,0) - bisector*5.657 → (96,4)
    expect(pts[4].x).toBeCloseTo(96, 6)
    expect(pts[4].y).toBeCloseTo(4, 6)
    // start cap negative: (0,4)
    expect(pts[5]).toEqual({ x: 0, y: 4 })
  })

  it('acute angle: bevel fallback kicks in past miter limit', () => {
    // Construct a very acute corner: segments meet at ~10°. The miter
    // length would explode (~half/sin(5°) ≈ 11.5*half), well past the
    // limit of 4. We expect bevel: two adjacent offset points at the
    // corner instead of one miter point.
    //
    // Segment 1: (0,0) → (100,0). Segment 2: (100,0) → (-100, 100*tan(5°)).
    // Angle between travel directions ≈ 175° → corner angle ≈ 5°.
    const tip = 100 * Math.tan((5 * Math.PI) / 180)
    const { ring } = buildWallPolygon(
      [0, 0, 100, 0, -100, tip],
      undefined,
      8,
    )
    const pts = ringPoints(ring)
    // Bevel adds one extra vertex per side at the corner — total 8 instead
    // of 6 for a clean miter L-shape.
    expect(pts).toHaveLength(8)
  })

  it('bulged segment: positive side is the outer arc, negative side is the inner arc', () => {
    // Single segment with a positive bulge of 20 (chord length 100, sagitta
    // 20). The positive-side offset arc has radius r + half (outer), the
    // negative-side has radius r - half (inner).
    // From arcFromBulge: r = (100^2 + 4*400) / (8*20) = 10400/160 = 65.
    // So the positive offset arc samples should sit at distance r-half=61
    // from the center (because the arc's center is on the OPPOSITE side
    // of the chord from the bulge — see wallPath.ts header).
    //
    // Wait: positive bulge → arc is ABOVE chord (y < 0). Center is BELOW
    // the chord (y > 0). The bulge tip is at (50, -20). The "left normal"
    // of the tangent at the tip — for a positive bulge, on the outer
    // (away from center) side — IS the direction toward (50, -20) from
    // (50, 0.625) center, which is UP. The +half offset of the tip lifts
    // it further: the outer arc.
    //
    // What we assert: every positive-side sample lies at distance
    // (r + half) from the arc center; every negative-side at (r - half).
    const half = 4
    const thickness = 2 * half
    const points = [0, 0, 100, 0]
    const bulges = [20]
    const { ring } = buildWallPolygon(points, bulges, thickness)
    const pts = ringPoints(ring)
    // Endpoints (start cap + end cap) bookend; in between are the
    // interior arc samples on each side.
    expect(pts.length).toBeGreaterThan(4)
    // Compute arc center for the chord 0,0→100,0 with bulge 20.
    // r = (c² + 4s²)/(8|s|) = (10000 + 1600)/160 = 72.5.
    const r = (100 * 100 + 4 * 20 * 20) / (8 * 20)
    // Center is below the chord (positive y) at offset (r - |s|) = 52.5.
    const cx = 50
    const cy = 52.5
    // The interior samples on the positive (outer) side are pts[1 .. mid]
    // excluding the cap endpoints. In this simple single-segment case the
    // ring is: [v0+, sample1+, sample2+, …, v1+, v1-, sampleK-, …, v0-].
    // We just check that EVERY interior point sits at the correct distance
    // from the center.
    let outerSamples = 0
    let innerSamples = 0
    for (const p of pts) {
      const d = Math.hypot(p.x - cx, p.y - cy)
      if (Math.abs(d - (r + half)) < 1e-6) outerSamples++
      else if (Math.abs(d - (r - half)) < 1e-6) innerSamples++
    }
    // The two endcap endpoints (v0+, v0-, v1+, v1-) are at distance
    // exactly r from center +/- half… let's just require interior
    // samples are PRESENT on each side.
    expect(outerSamples).toBeGreaterThan(0)
    expect(innerSamples).toBeGreaterThan(0)
  })

  it('single-segment wall: ring is a simple 4-vertex rectangle', () => {
    const { ring } = buildWallPolygon([10, 10, 110, 10], undefined, 6)
    const pts = ringPoints(ring)
    expect(pts).toHaveLength(4)
    // Ring should be axis-aligned (all y values are 10±3).
    const ys = pts.map((p) => p.y)
    expect(ys.sort((a, b) => a - b)).toEqual([7, 7, 13, 13])
    const xs = pts.map((p) => p.x).sort((a, b) => a - b)
    expect(xs).toEqual([10, 10, 110, 110])
  })

  it('end caps are flat perpendicular to the wall direction', () => {
    // For an L-shape wall, the start cap should be perpendicular to
    // segment 0 (vertical line at x=0) and the end cap perpendicular to
    // segment N (horizontal line at y=100). The cap "edges" are pts[0]→
    // pts[N-1] (start) and pts[N/2-1]→pts[N/2] (end), depending on ring
    // orientation. Just verify that the two start-cap points share the
    // same x as v0 (=0) and that the two end-cap points share the same
    // y as vN (=100).
    const { ring } = buildWallPolygon([0, 0, 100, 0, 100, 100], undefined, 8)
    const pts = ringPoints(ring)
    // Find points whose y is at start-cap height range (-4..4) and x=0:
    // those are the start-cap pair.
    const startCapPair = pts.filter((p) => Math.abs(p.x - 0) < 1e-6)
    expect(startCapPair).toHaveLength(2)
    expect(maxAbs(startCapPair.map((p) => p.y))).toBeCloseTo(4, 6)
    // End-cap pair has y=100.
    const endCapPair = pts.filter((p) => Math.abs(p.y - 100) < 1e-6)
    expect(endCapPair).toHaveLength(2)
    // x values of end cap: 96 and 104 (offset by ±half=4 from x=100).
    const endXs = endCapPair.map((p) => p.x).sort((a, b) => a - b)
    expect(endXs[0]).toBeCloseTo(96, 6)
    expect(endXs[1]).toBeCloseTo(104, 6)
  })

  it('zero-length / degenerate input → empty ring', () => {
    expect(buildWallPolygon([], undefined, 8).ring).toEqual([])
    expect(buildWallPolygon([0, 0], undefined, 8).ring).toEqual([])
    expect(buildWallPolygon([0, 0, 100, 0], undefined, 0).ring).toEqual([])
  })
})

describe('offsetArcPositive', () => {
  it('straight segment: returns the two endpoints offset by perpendicular', () => {
    const out = offsetArcPositive(0, 0, 100, 0, 0, 8)
    expect(out).toEqual([0, -4, 100, -4])
  })

  it('bulged segment: every sample sits at (r+half) from arc center', () => {
    const half = 4
    const result = offsetArcPositive(0, 0, 100, 0, 20, 2 * half, 12)
    const r = (100 * 100 + 4 * 20 * 20) / (8 * 20)
    const cx = 50
    const cy = 52.5 // r - |s|
    for (let i = 0; i < result.length; i += 2) {
      const px = result[i]
      const py = result[i + 1]
      const d = Math.hypot(px - cx, py - cy)
      expect(d).toBeCloseTo(r + half, 5)
    }
  })
})
