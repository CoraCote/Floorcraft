/**
 * Wall offset-polygon construction.
 *
 * P0–P2 of the walls work moved walls onto a real geometry backbone (drag,
 * snap, vertex add/remove, bulged segments). Through P2 the renderer still
 * drew each wall as a stroked polyline — visually a "fat line". P3 (this
 * file) builds the architectural polygon that replaces that stroke.
 *
 * # Algorithm
 *
 * Given a wall centerline `points = [v0x, v0y, v1x, v1y, …]` with optional
 * per-segment `bulges` and a uniform `thickness`, we generate a closed ring
 * that is the polyline offset outward by `thickness/2` on one side and
 * inward by `thickness/2` on the other:
 *
 *   1. For each segment we compute a "left" perpendicular unit vector
 *      `n_i` (left of the chord direction in screen coords, y-down). The
 *      "positive" side is `+n_i`, the "negative" side is `-n_i`.
 *   2. At interior vertices, two segments meet. Both adjacent segments'
 *      offset edges need to JOIN. We compute the **miter point**: the
 *      intersection of the two adjacent offset edges (one extended from
 *      each segment).
 *   3. The miter distance grows unbounded as the corner angle approaches
 *      180° (a U-turn). When the projected miter length would exceed
 *      `MITER_LIMIT * thickness/2`, we fall back to a **bevel**: emit two
 *      points (one per adjacent segment's offset endpoint) instead of a
 *      single miter point. This matches the SVG `stroke-linejoin="miter-clip"`
 *      / `bevel` semantics.
 *   4. End vertices (first & last point of an open polyline) have no
 *      adjacent segment to miter with — we just use the perpendicular
 *      offset directly. That naturally produces a flat end cap.
 *   5. The full ring is built by walking forward along the positive offsets
 *      then backward along the negative offsets:
 *         [v0+, v1+, …, vN+, vN-, v(N-1)-, …, v0-]
 *      and closing back to v0+.
 *
 * # Bulged segments
 *
 * For arcs (bulge ≠ 0) the segment is no longer a straight chord; the
 * offset is a concentric arc with radius `r ± thickness/2`. We approximate
 * the arc offset by sampling N points along the arc and computing the
 * perpendicular offset at each sample. The samples interpolate smoothly
 * between the segment endpoints, so the start/end of the offset arc lines
 * up exactly with the adjacent vertex's miter computation — which uses the
 * tangent at the segment endpoint rather than the chord direction.
 *
 * # Why a pure helper
 *
 * Selection, hit-testing, vertex handles, and the door/window painters all
 * keep operating on the centerline `points` array. Only the wall's *fill*
 * surface changes. Keeping the polygon construction in a pure module
 * (no React, no Konva) lets us cover the math with focused unit tests and
 * lets the renderer stay declarative.
 *
 * Coordinate convention: screen coords (y grows downward). The "left
 * normal" of a segment going from (x0,y0) → (x1,y1) is (dy/c, -dx/c),
 * matching `wallPath.ts`'s convention.
 */
import { wallSegments, arcFromBulge, type WallSegment } from './wallPath'

export interface OffsetPolygon {
  /**
   * Outer ring as alternating x,y values. The ring is **not** explicitly
   * closed — the renderer is responsible for closing (Konva's
   * `<Line closed={true}>` does this).
   */
  ring: number[]
}

/**
 * Miter limit, expressed as a multiplier of `thickness/2`. A miter whose
 * projected length exceeds this falls back to a bevel. `4` matches the
 * SVG default and is wide enough that 90° corners (miter length ≈ 1.41 *
 * t/2) and 60° corners (≈ 2 * t/2) miter cleanly, but very acute angles
 * (< ~30°) bevel to avoid runaway spikes.
 */
const MITER_LIMIT = 4

/** Number of samples used to approximate an arc's offset on each side. */
const ARC_SAMPLES = 16

interface Vec2 {
  x: number
  y: number
}

/**
 * Build the offset polygon for a wall.
 *
 * Returns null/empty for degenerate inputs (fewer than 2 vertices). For a
 * zero-length single-segment wall the ring will be a degenerate quad at
 * the same location — callers that care can detect this via the bounds.
 */
export function buildWallPolygon(
  points: number[],
  bulges: number[] | undefined,
  thickness: number,
): OffsetPolygon {
  if (points.length < 4 || thickness <= 0) {
    return { ring: [] }
  }

  const segs = wallSegments(points, bulges)
  if (segs.length === 0) return { ring: [] }

  const half = thickness / 2

  // Compute, for each segment, the "left normal" unit vector at its start
  // and at its end. For straight segments these are the same vector
  // (constant chord normal). For arcs, the normal rotates along the arc,
  // so the start/end normals differ — using them at the joins keeps the
  // miter math consistent with the local tangent.
  const startN: Vec2[] = []
  const endN: Vec2[] = []
  for (const seg of segs) {
    const { sn, en } = segmentNormals(seg)
    startN.push(sn)
    endN.push(en)
  }

  // Build the positive-side outline (forward) and negative-side outline
  // (which we'll reverse at the end). Each entry is alternating x,y.
  const pos: number[] = []
  const neg: number[] = []

  // ---- Vertex 0 (start cap) ----
  // No previous segment — just offset by the first segment's start normal.
  pushOffset(pos, neg, segs[0].x0, segs[0].y0, startN[0], half)

  // ---- Interior segments + interior vertices ----
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]

    // If the segment is bulged, sample the arc's offset between its
    // endpoints. We exclude the endpoints themselves: the start endpoint
    // was already added by the previous vertex's join (or the start cap),
    // and the end endpoint will be added by the next vertex's join (or
    // the end cap). That keeps the ring's vertex count predictable.
    if (seg.bulge !== 0) {
      appendArcInterior(pos, neg, seg, half)
    }

    // Interior vertex between this segment and the next.
    if (i < segs.length - 1) {
      const nextSeg = segs[i + 1]
      const inN = endN[i] // normal at the end of this segment
      const outN = startN[i + 1] // normal at the start of next segment
      // The corner vertex (shared between the two segments) is
      // (seg.x1, seg.y1) — by construction equal to (nextSeg.x0,
      // nextSeg.y0).
      pushJoin(
        pos,
        neg,
        seg.x1,
        seg.y1,
        // Tangent at end of this segment (entering the corner) and start
        // of next segment (leaving the corner). For straight segments
        // this is just the chord direction; for arcs we derive it from
        // the perpendicular normal (tangent = (-n.y, n.x) i.e. rotate
        // normal -90° to recover the chord-aligned tangent).
        tangentFromNormal(inN),
        tangentFromNormal(outN),
        inN,
        outN,
        half,
        nextSeg,
      )
    }
  }

  // ---- Vertex N (end cap) ----
  const last = segs[segs.length - 1]
  pushOffset(pos, neg, last.x1, last.y1, endN[segs.length - 1], half)

  // Combine: forward along positive, backward along negative.
  const ring: number[] = []
  for (let i = 0; i < pos.length; i++) ring.push(pos[i])
  for (let i = neg.length - 2; i >= 0; i -= 2) {
    ring.push(neg[i], neg[i + 1])
  }
  return { ring }
}

/**
 * Compute the start- and end-normal of a segment. For a straight segment
 * both normals are the same chord-perpendicular. For an arc the normal
 * rotates with the tangent, so we compute it from the radial direction
 * at each endpoint.
 */
function segmentNormals(seg: WallSegment): { sn: Vec2; en: Vec2 } {
  if (seg.bulge === 0) {
    const dx = seg.x1 - seg.x0
    const dy = seg.y1 - seg.y0
    const c = Math.hypot(dx, dy) || 1
    // Left normal in screen coords (y-down): (dy/c, -dx/c).
    const n: Vec2 = { x: dy / c, y: -dx / c }
    return { sn: n, en: n }
  }
  const arc = arcFromBulge(seg)!
  // For a circle parameterised by angle a, point p(a) = center + r*(cos a,
  // sin a) and tangent dp/da = r*(-sin a, cos a). The left-normal of a
  // tangent (tx, ty) in screen coords (y-down) is (ty, -tx). Substituting:
  //   left_normal = (cos a, sin a) = radial outward unit
  // when angle is increasing (sweep=1, positive bulge). For sweep=0
  // (negative bulge) the travel direction reverses, flipping the
  // left-normal to the OPPOSITE side: -radial outward.
  //
  //   sweep=1 (bulge > 0): left normal of tangent = +radial outward
  //   sweep=0 (bulge < 0): left normal of tangent = -radial outward
  //
  // So the positive offset side (which is the "left of travel direction")
  // is the OUTER side of the arc when bulge > 0, and the INNER side when
  // bulge < 0 — matching the chord's left-normal convention used for
  // straight segments.
  const sign = seg.bulge > 0 ? 1 : -1
  const sx = (seg.x0 - arc.cx) / arc.radius
  const sy = (seg.y0 - arc.cy) / arc.radius
  const ex = (seg.x1 - arc.cx) / arc.radius
  const ey = (seg.y1 - arc.cy) / arc.radius
  return {
    sn: { x: sign * sx, y: sign * sy },
    en: { x: sign * ex, y: sign * ey },
  }
}

/**
 * Recover a tangent vector from a left-normal. Left normal of (tx,ty) in
 * screen coords is (ty, -tx); inverse: tangent = (-n.y, n.x).
 */
function tangentFromNormal(n: Vec2): Vec2 {
  return { x: -n.y, y: n.x }
}

/** Append the offset of vertex (vx,vy) along normal n by ±half to pos/neg. */
function pushOffset(
  pos: number[],
  neg: number[],
  vx: number,
  vy: number,
  n: Vec2,
  half: number,
): void {
  pos.push(vx + n.x * half, vy + n.y * half)
  neg.push(vx - n.x * half, vy - n.y * half)
}

/**
 * Compute the miter (or bevel) join at a corner between two segments.
 *
 * The two adjacent offset edges, on each side, meet at the miter point.
 * For a corner with incoming tangent `tIn` and outgoing tangent `tOut`,
 * the half-angle θ between them satisfies sin(θ) = ‖(tIn - tOut)/2‖ when
 * the tangents are unit. The miter length (distance along the bisector
 * from the corner to the miter point) is `half / sin(θ)`. When that
 * exceeds `MITER_LIMIT * half`, we bevel.
 */
function pushJoin(
  pos: number[],
  neg: number[],
  vx: number,
  vy: number,
  tIn: Vec2,
  tOut: Vec2,
  nIn: Vec2,
  nOut: Vec2,
  half: number,
  // Used only to disambiguate which sample side to insert when arcs are
  // involved — currently unused but kept for future bevel-with-arc work.
  _nextSeg: WallSegment,
): void {
  // Bisector of incoming and outgoing tangents (both pointing away from
  // the corner conceptually — but here both point in their travel
  // direction, so we negate tIn to get the "leaving the corner backward"
  // vector and add tOut going forward). The miter direction is
  // perpendicular to the bisector of the two tangents.
  //
  // A more direct formulation: the miter point on the +half side is the
  // intersection of two parallel-offset lines. The standard formula for
  // unit tangents tIn, tOut and unit left-normals nIn, nOut is:
  //   miter_unit = (nIn + nOut) / |nIn + nOut|
  //   miter_len  = half / (miter_unit · nIn)
  // That's the perpendicular distance from the corner to the miter
  // intersection along the bisector of the two normals.

  const sumNx = nIn.x + nOut.x
  const sumNy = nIn.y + nOut.y
  const sumLen = Math.hypot(sumNx, sumNy)

  // Degenerate: tangents perfectly opposed (180° corner) or identical
  // (collinear). For collinear segments, just use either side's offset.
  if (sumLen < 1e-9) {
    // Tangents are anti-parallel (a U-turn): use the perpendicular of
    // the incoming tangent. Bevel always.
    pos.push(vx + nIn.x * half, vy + nIn.y * half)
    pos.push(vx + nOut.x * half, vy + nOut.y * half)
    neg.push(vx - nIn.x * half, vy - nIn.y * half)
    neg.push(vx - nOut.x * half, vy - nOut.y * half)
    return
  }

  const miterUx = sumNx / sumLen
  const miterUy = sumNy / sumLen
  const cosHalfAngle = miterUx * nIn.x + miterUy * nIn.y
  // Guard against cosHalfAngle ≈ 0 (very acute angle), which would blow
  // up the miter length. The bevel branch below handles this anyway.
  const miterLen = cosHalfAngle > 1e-9 ? half / cosHalfAngle : Infinity

  if (miterLen <= MITER_LIMIT * half) {
    // Single miter point on each side.
    pos.push(vx + miterUx * miterLen, vy + miterUy * miterLen)
    neg.push(vx - miterUx * miterLen, vy - miterUy * miterLen)
  } else {
    // Bevel: emit the two adjacent offset endpoints separately. This
    // produces a flat chamfer instead of a runaway miter spike.
    pos.push(vx + nIn.x * half, vy + nIn.y * half)
    pos.push(vx + nOut.x * half, vy + nOut.y * half)
    neg.push(vx - nIn.x * half, vy - nIn.y * half)
    neg.push(vx - nOut.x * half, vy - nOut.y * half)
  }
  // tIn/tOut intentionally unused — they're derivable from nIn/nOut and
  // we keep them in the signature for clarity at the call site.
  void tIn
  void tOut
}

/**
 * Append the interior samples of an arc's offset to pos/neg. We sample
 * `ARC_SAMPLES` evenly along the arc and offset each sample by
 * `thickness/2` along the local outward normal. The first/last samples
 * (at t=0 and t=1) are excluded — those endpoints are emitted by the
 * surrounding vertex code (start cap / interior join / end cap).
 *
 * The "outward normal" at a point on the circle is the radial unit
 * vector from the arc center. The positive side is +half along the
 * left-normal-of-tangent, which equals -radial for sweep=1 and +radial
 * for sweep=0 (see segmentNormals comments).
 */
function appendArcInterior(
  pos: number[],
  neg: number[],
  seg: WallSegment,
  half: number,
): void {
  const arc = arcFromBulge(seg)!
  const a0 = Math.atan2(seg.y0 - arc.cy, seg.x0 - arc.cx)
  const a1 = Math.atan2(seg.y1 - arc.cy, seg.x1 - arc.cx)
  let delta = a1 - a0
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  if (arc.sweep === 1 && delta < 0) delta += 2 * Math.PI
  if (arc.sweep === 0 && delta > 0) delta -= 2 * Math.PI

  const sign = seg.bulge > 0 ? 1 : -1 // see segmentNormals
  for (let i = 1; i < ARC_SAMPLES - 1; i++) {
    const t = i / (ARC_SAMPLES - 1)
    const a = a0 + delta * t
    const cx = Math.cos(a)
    const cy = Math.sin(a)
    const px = arc.cx + arc.radius * cx
    const py = arc.cy + arc.radius * cy
    // Left-normal of tangent equals sign * radial.
    const nx = sign * cx
    const ny = sign * cy
    pos.push(px + nx * half, py + ny * half)
    neg.push(px - nx * half, py - ny * half)
  }
}

/**
 * Approximate the offset of a bulged segment along the **positive** side.
 * Returns alternating x,y values from t=0 to t=1 inclusive. Exposed for
 * tests and any caller that needs just one side of the arc offset.
 *
 * Renderer prefers `buildWallPolygon` which already handles arc segments
 * internally; this helper is kept as a unit-test seam.
 */
export function offsetArcPositive(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  bulge: number,
  thickness: number,
  samples: number = ARC_SAMPLES,
): number[] {
  const seg: WallSegment = { x0: ax, y0: ay, x1: bx, y1: by, bulge }
  const half = thickness / 2
  if (bulge === 0) {
    const dx = bx - ax
    const dy = by - ay
    const c = Math.hypot(dx, dy) || 1
    const nx = dy / c
    const ny = -dx / c
    return [ax + nx * half, ay + ny * half, bx + nx * half, by + ny * half]
  }
  const arc = arcFromBulge(seg)!
  const a0 = Math.atan2(ay - arc.cy, ax - arc.cx)
  const a1 = Math.atan2(by - arc.cy, bx - arc.cx)
  let delta = a1 - a0
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  if (arc.sweep === 1 && delta < 0) delta += 2 * Math.PI
  if (arc.sweep === 0 && delta > 0) delta -= 2 * Math.PI
  const sign = bulge > 0 ? 1 : -1
  const out: number[] = []
  const n = Math.max(2, samples)
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const a = a0 + delta * t
    const cx = Math.cos(a)
    const cy = Math.sin(a)
    const px = arc.cx + arc.radius * cx
    const py = arc.cy + arc.radius * cy
    out.push(px + sign * cx * half, py + sign * cy * half)
  }
  return out
}
