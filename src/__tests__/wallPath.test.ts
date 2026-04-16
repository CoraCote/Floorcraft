import { describe, it, expect } from 'vitest'
import {
  wallSegments,
  arcFromBulge,
  wallPathData,
  sampleArc,
  tangentAt,
  segmentMidpoint,
  locateOnStraightSegments,
} from '../lib/wallPath'

describe('wallSegments', () => {
  it('bulges=undefined → all straight segments', () => {
    const segs = wallSegments([0, 0, 100, 0, 100, 100], undefined)
    expect(segs).toHaveLength(2)
    expect(segs.every((s) => s.bulge === 0)).toBe(true)
  })

  it('sparse bulges array is padded with zeros', () => {
    const segs = wallSegments([0, 0, 100, 0, 100, 100], [10])
    expect(segs).toHaveLength(2)
    expect(segs[0].bulge).toBe(10)
    expect(segs[1].bulge).toBe(0)
  })
})

describe('arcFromBulge', () => {
  it('returns null when bulge is 0', () => {
    const seg = { x0: 0, y0: 0, x1: 100, y1: 0, bulge: 0 }
    expect(arcFromBulge(seg)).toBeNull()
  })

  it('chord length 100, bulge 25 → radius 62.5, center above chord', () => {
    const seg = { x0: 0, y0: 0, x1: 100, y1: 0, bulge: 25 }
    const arc = arcFromBulge(seg)!
    expect(arc.radius).toBeCloseTo(62.5, 6)
    // Left normal of horizontal chord (going right) points UP in screen coords
    // (negative y). Center sits at chordMidpoint - perpUnit * (r - |bulge|)
    // along the bulge direction.
    expect(arc.cx).toBeCloseTo(50, 6)
    expect(arc.cy).toBeCloseTo(37.5, 6) // 0 - (62.5 - 25) flipped
    expect(arc.sweep).toBe(1)
  })

  it('sign flip: negating bulge flips center to other side and flips sweep', () => {
    const pos = arcFromBulge({ x0: 0, y0: 0, x1: 100, y1: 0, bulge: 25 })!
    const neg = arcFromBulge({ x0: 0, y0: 0, x1: 100, y1: 0, bulge: -25 })!
    expect(neg.cy).toBeCloseTo(-pos.cy + 0, 6) // mirror across the chord
    expect(neg.sweep).toBe(1 - pos.sweep)
  })
})

describe('wallPathData', () => {
  it('all-zero bulges produces only M and L commands', () => {
    const d = wallPathData([0, 0, 100, 0, 100, 100], [0, 0])
    expect(d).toMatch(/^M\s*0\s+0\s+L\s*100\s+0\s+L\s*100\s+100\s*$/)
  })

  it('one arc segment produces an A command', () => {
    const d = wallPathData([0, 0, 100, 0, 100, 100], [25, 0])
    expect(d).toContain('A')
    expect(d.startsWith('M')).toBe(true)
  })
})

describe('sampleArc', () => {
  it('16 samples all lie on the computed circle', () => {
    const seg = { x0: 0, y0: 0, x1: 100, y1: 0, bulge: 25 }
    const arc = arcFromBulge(seg)!
    const pts = sampleArc(seg, 16)
    expect(pts).toHaveLength(16)
    for (const p of pts) {
      const d = Math.hypot(p.x - arc.cx, p.y - arc.cy)
      expect(d).toBeCloseTo(arc.radius, 1)
    }
  })
})

describe('tangentAt', () => {
  it('straight segment tangent is chord direction, any t', () => {
    const seg = { x0: 0, y0: 0, x1: 100, y1: 0, bulge: 0 }
    const t0 = tangentAt(seg, 0)
    const t1 = tangentAt(seg, 1)
    expect(t0.x).toBeCloseTo(1, 6)
    expect(t0.y).toBeCloseTo(0, 6)
    expect(t1.x).toBeCloseTo(1, 6)
    expect(t1.y).toBeCloseTo(0, 6)
  })

  it('arc tangent at t=0.5 is perpendicular to radius', () => {
    const seg = { x0: 0, y0: 0, x1: 100, y1: 0, bulge: 25 }
    const arc = arcFromBulge(seg)!
    const mid = segmentMidpoint(seg)
    const t = tangentAt(seg, 0.5)
    const radial = { x: mid.x - arc.cx, y: mid.y - arc.cy }
    const dot = t.x * radial.x + t.y * radial.y
    expect(dot).toBeCloseTo(0, 4)
  })
})

describe('segmentMidpoint', () => {
  it('straight segment → chord midpoint', () => {
    const m = segmentMidpoint({ x0: 0, y0: 0, x1: 100, y1: 0, bulge: 0 })
    expect(m.x).toBeCloseTo(50, 6)
    expect(m.y).toBeCloseTo(0, 6)
  })

  it('arc segment midpoint lies |bulge| px perpendicular to chord', () => {
    const seg = { x0: 0, y0: 0, x1: 100, y1: 0, bulge: 25 }
    const m = segmentMidpoint(seg)
    expect(m.x).toBeCloseTo(50, 6)
    // left normal of chord (0,0)→(100,0) is (0,-1) in screen coords
    expect(m.y).toBeCloseTo(-25, 6)
  })
})

describe('locateOnStraightSegments', () => {
  it('all-straight wall → expected index for 0, 0.5, 1', () => {
    const pts = [0, 0, 100, 0, 200, 0]
    expect(locateOnStraightSegments(pts, undefined, 0)).toEqual({ segmentIndex: 0, tInSegment: 0 })
    expect(locateOnStraightSegments(pts, undefined, 0.5)).toEqual({ segmentIndex: 1, tInSegment: 0 })
    expect(locateOnStraightSegments(pts, undefined, 1)).toEqual({ segmentIndex: 1, tInSegment: 1 })
  })

  it('middle arc segment → null for positions in the arc', () => {
    // Wall = 3 segments: straight (100), arc (100), straight (100)
    const pts = [0, 0, 100, 0, 200, 0, 300, 0]
    const bulges = [0, 20, 0]
    // total straight length = 200 (segments 0 and 2). position 0.5 would map
    // to the 100-px boundary, which is the start of the arc → rejected.
    expect(locateOnStraightSegments(pts, bulges, 0.5)).toBeNull()
  })

  it('straight portion on either side of arc → valid index', () => {
    const pts = [0, 0, 100, 0, 200, 0, 300, 0]
    const bulges = [0, 20, 0]
    // 0.25 falls in first straight segment
    const a = locateOnStraightSegments(pts, bulges, 0.25)
    expect(a).not.toBeNull()
    expect(a!.segmentIndex).toBe(0)
    // 0.75 falls in third segment (index 2)
    const b = locateOnStraightSegments(pts, bulges, 0.75)
    expect(b).not.toBeNull()
    expect(b!.segmentIndex).toBe(2)
  })
})
