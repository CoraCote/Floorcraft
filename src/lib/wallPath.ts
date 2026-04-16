import type { Point } from './geometry'

export interface WallSegment {
  x0: number
  y0: number
  x1: number
  y1: number
  /** Signed perpendicular offset from chord midpoint to arc midpoint. 0 = straight. */
  bulge: number
}

export interface ArcGeometry {
  cx: number
  cy: number
  radius: number
  /** SVG sweep flag (0 or 1). */
  sweep: 0 | 1
  /** SVG large-arc flag (always 0 in v1 — bulge is clamped to ≤ chordLength/2). */
  largeArc: 0
}

/** Split points + bulges into ordered segments. */
export function wallSegments(points: number[], bulges?: number[]): WallSegment[] {
  const n = Math.max(0, Math.floor(points.length / 2) - 1)
  const out: WallSegment[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      x0: points[i * 2],
      y0: points[i * 2 + 1],
      x1: points[i * 2 + 2],
      y1: points[i * 2 + 3],
      bulge: bulges?.[i] ?? 0,
    })
  }
  return out
}

/**
 * Given a segment's chord endpoints and bulge, compute arc center, radius,
 * and SVG sweep flag. Returns null when bulge is exactly 0.
 *
 * Geometry:
 *   - chord length c, sagitta s = bulge
 *   - radius r = (c² + 4s²) / (8|s|)
 *   - perpendicular offset from chord midpoint to center = r - |s|,
 *     on the side opposite the bulge
 *   - "left normal" of chord direction: (-dy/c, dx/c) — points to the
 *     left when walking from (x0,y0) → (x1,y1)
 */
export function arcFromBulge(seg: WallSegment): ArcGeometry | null {
  if (seg.bulge === 0) return null
  const dx = seg.x1 - seg.x0
  const dy = seg.y1 - seg.y0
  const c = Math.hypot(dx, dy)
  if (c === 0) return null
  const s = seg.bulge
  const absS = Math.abs(s)
  const radius = (c * c + 4 * s * s) / (8 * absS)
  // Midpoint of chord.
  const mx = (seg.x0 + seg.x1) / 2
  const my = (seg.y0 + seg.y1) / 2
  // Left-normal unit vector of the chord direction in screen coords
  // (y grows downward). For chord direction (1,0), "left" is up = (0,-1).
  const lnx = dy / c
  const lny = -dx / c
  // The arc midpoint is at mx + lnx*s, my + lny*s. The center lies on the
  // opposite side of the chord from the arc midpoint.
  const offset = radius - absS
  const sign = s > 0 ? -1 : 1
  const cx = mx + lnx * offset * sign
  const cy = my + lny * offset * sign
  // SVG sweep flag in canvas coords (y grows downward). With positive bulge
  // we sweep counter-clockwise in math coords, which reads as sweep=1 in SVG.
  const sweep: 0 | 1 = s > 0 ? 1 : 0
  return { cx, cy, radius, sweep, largeArc: 0 }
}

/** Build an SVG `d` attribute for a wall. */
export function wallPathData(points: number[], bulges?: number[]): string {
  if (points.length < 2) return ''
  const parts: string[] = []
  parts.push(`M ${points[0]} ${points[1]}`)
  const segs = wallSegments(points, bulges)
  for (const seg of segs) {
    if (seg.bulge === 0) {
      parts.push(`L ${seg.x1} ${seg.y1}`)
    } else {
      const arc = arcFromBulge(seg)!
      parts.push(`A ${arc.radius} ${arc.radius} 0 ${arc.largeArc} ${arc.sweep} ${seg.x1} ${seg.y1}`)
    }
  }
  return parts.join(' ')
}

/** Uniformly sample N points along a segment (straight or arc). */
export function sampleArc(seg: WallSegment, samples: number): Point[] {
  const out: Point[] = []
  if (samples <= 0) return out
  if (seg.bulge === 0) {
    for (let i = 0; i < samples; i++) {
      const t = samples === 1 ? 0.5 : i / (samples - 1)
      out.push({ x: seg.x0 + (seg.x1 - seg.x0) * t, y: seg.y0 + (seg.y1 - seg.y0) * t })
    }
    return out
  }
  const arc = arcFromBulge(seg)!
  const a0 = Math.atan2(seg.y0 - arc.cy, seg.x0 - arc.cx)
  const a1 = Math.atan2(seg.y1 - arc.cy, seg.x1 - arc.cx)
  // Walk the short way around the circle in the direction of sweep.
  let delta = a1 - a0
  // Normalize delta to (-2π, 2π], then choose the sign matching sweep.
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  // sweep=1 (canvas) means angles increase (ccw in math coords); flip if needed.
  if (arc.sweep === 1 && delta < 0) delta += 2 * Math.PI
  if (arc.sweep === 0 && delta > 0) delta -= 2 * Math.PI
  for (let i = 0; i < samples; i++) {
    const t = samples === 1 ? 0.5 : i / (samples - 1)
    const a = a0 + delta * t
    out.push({ x: arc.cx + arc.radius * Math.cos(a), y: arc.cy + arc.radius * Math.sin(a) })
  }
  return out
}

/** Unit tangent vector at parametric position t ∈ [0,1] along a segment. */
export function tangentAt(seg: WallSegment, t: number): Point {
  if (seg.bulge === 0) {
    const dx = seg.x1 - seg.x0
    const dy = seg.y1 - seg.y0
    const c = Math.hypot(dx, dy) || 1
    return { x: dx / c, y: dy / c }
  }
  const arc = arcFromBulge(seg)!
  const a0 = Math.atan2(seg.y0 - arc.cy, seg.x0 - arc.cx)
  const a1 = Math.atan2(seg.y1 - arc.cy, seg.x1 - arc.cx)
  let delta = a1 - a0
  if (arc.sweep === 1 && delta < 0) delta += 2 * Math.PI
  if (arc.sweep === 0 && delta > 0) delta -= 2 * Math.PI
  const a = a0 + delta * t
  // Tangent is perpendicular to the radial, direction follows sweep sign.
  const sign = delta >= 0 ? 1 : -1
  return { x: -Math.sin(a) * sign, y: Math.cos(a) * sign }
}

/** Midpoint of a segment: arc midpoint if bulged, chord midpoint if straight. */
export function segmentMidpoint(seg: WallSegment): Point {
  const mx = (seg.x0 + seg.x1) / 2
  const my = (seg.y0 + seg.y1) / 2
  if (seg.bulge === 0) return { x: mx, y: my }
  const dx = seg.x1 - seg.x0
  const dy = seg.y1 - seg.y0
  const c = Math.hypot(dx, dy) || 1
  // Left-normal unit vector in screen coords (y-down).
  const lnx = dy / c
  const lny = -dx / c
  return { x: mx + lnx * seg.bulge, y: my + lny * seg.bulge }
}

/**
 * Map a parametric `positionOnWall ∈ [0, 1]` to a specific STRAIGHT segment.
 * Positions falling on arc segments return null. Parameter is measured
 * against the concatenated length of straight segments only.
 */
export function locateOnStraightSegments(
  points: number[],
  bulges: number[] | undefined,
  positionOnWall: number,
): { segmentIndex: number; tInSegment: number } | null {
  const segs = wallSegments(points, bulges)
  // Lengths of every segment (straight = chord, arc = anything non-zero).
  let totalStraight = 0
  for (const s of segs) {
    if (s.bulge === 0) totalStraight += Math.hypot(s.x1 - s.x0, s.y1 - s.y0)
  }
  if (totalStraight === 0) return null
  const target = positionOnWall * totalStraight
  const EPS = 1e-9
  // Find index of the last straight segment so we can attribute target ==
  // totalStraight to its endpoint (t=1) rather than rolling past.
  let lastStraight = -1
  for (let i = 0; i < segs.length; i++) if (segs[i].bulge === 0) lastStraight = i
  let cursor = 0
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s.bulge !== 0) continue
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0)
    const end = cursor + len
    // Target strictly inside this segment: standard case.
    if (target >= cursor - EPS && target < end - EPS) {
      const tInSegment = len === 0 ? 0 : (target - cursor) / len
      return { segmentIndex: i, tInSegment: Math.max(0, Math.min(1, tInSegment)) }
    }
    // Target exactly at this segment's end-boundary.
    if (Math.abs(target - end) <= EPS) {
      // If this is the final straight segment, return its endpoint.
      if (i === lastStraight) {
        return { segmentIndex: i, tInSegment: 1 }
      }
      // Otherwise, look at the next segment. If it's straight, roll into it
      // at t=0. If it's an arc, the boundary coincides with the arc start
      // and we reject.
      const next = segs[i + 1]
      if (next && next.bulge === 0) {
        return { segmentIndex: i + 1, tInSegment: 0 }
      }
      return null
    }
    cursor = end
  }
  return null
}
