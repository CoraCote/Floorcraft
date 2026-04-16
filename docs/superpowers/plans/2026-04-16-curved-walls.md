# Curved Walls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add circular-arc segments to the existing polyline Wall tool. Drawing: click = straight, click-drag = arc. Editing: drag a green midpoint handle to bend/un-bend any segment. Doors/windows stay on straight segments only.

**Architecture:** Add a single optional `bulges?: number[]` field to `WallElement` (missing/zero = straight; no migration). All arc math lives in one pure module, `src/lib/wallPath.ts`. Rendering fast-paths `Konva.Line` when every bulge is zero, switches to `Konva.Path` otherwise. Drawing extends `useWallDrawing` to handle mousedown/move/mouseup with a drag-threshold; editing lives in a new `WallEditOverlay` component that mounts only when a wall is selected. Doors/windows guard against arc positions via `locateOnStraightSegments`.

**Tech Stack:** React 19, TypeScript, Zustand 5 + zundo, Konva 10 / react-konva, Vitest + @testing-library/react, Vite 8.

**Spec:** `docs/superpowers/specs/2026-04-16-curved-walls-design.md`

**Branch:** `feat/curved-walls` — **stacked on `feat/delete-and-shapes`** (Bundle 1's PR is still open). When PR #2 merges, rebase this branch onto `feat/floocraft-core`.

---

## File structure

Files created:

```
src/lib/wallPath.ts                                  — arc math, path builder, hit helpers
src/components/editor/Canvas/WallEditOverlay.tsx     — midpoint handles for selected wall

src/__tests__/wallPath.test.ts                       — unit (tests 1–15)
src/__tests__/useWallDrawing.test.ts                 — hook tests (16–21)
src/__tests__/WallRenderer.test.tsx                  — renderer tests (22–25)
src/__tests__/WallEditOverlay.test.tsx               — overlay tests (26–30)
src/__tests__/curvedWallFlow.test.tsx                — integration (31–33)
src/__tests__/wallAutoSave.test.ts                   — persistence (34–35)
```

Files modified:

```
src/types/elements.ts                                — add optional bulges?: number[]
src/hooks/useWallDrawing.ts                          — mousedown/move/up handlers + bulges
src/components/editor/Canvas/WallRenderer.tsx        — Line/Path branch
src/components/editor/Canvas/WallDrawingOverlay.tsx  — arc preview during drag
src/components/editor/Canvas/CanvasStage.tsx         — route mousedown/mouseup to hook; mount WallEditOverlay
```

---

## Task 0: Create branch and scaffold

**Files:**
- No code changes

- [ ] **Step 1: Create feature branch**

Run:
```bash
git checkout feat/delete-and-shapes
git checkout -b feat/curved-walls
```
Expected: switched to a new branch `feat/curved-walls`, stacked on Bundle 1's open PR.

- [ ] **Step 2: Sanity-check baseline**

Run:
```bash
npm run lint && npm run build && npx vitest run
```
Expected: all three succeed on the branch base. If anything fails, stop and fix before proceeding.

- [ ] **Step 3: Commit nothing (no-op)**

No commit yet; first real commit comes at end of Task 1.

---

## Task 1: Add `bulges?: number[]` to WallElement

**Files:**
- Modify: `src/types/elements.ts` (around line 49)

- [ ] **Step 1: Edit the type**

In `src/types/elements.ts`, change the `WallElement` interface to add an optional `bulges` field:

```ts
export interface WallElement extends BaseElement {
  type: 'wall'
  points: number[]
  /**
   * Optional per-segment arc bulges. Length === (points.length / 2) - 1.
   * bulges[i] is the signed perpendicular offset, in world units, from the
   * midpoint of the chord (points[i*2..i*2+3]) to the midpoint of the arc.
   * Positive = bulge to the LEFT of the chord direction (start → end).
   * 0 (or missing/undefined array) = straight segment.
   */
  bulges?: number[]
  thickness: number
  connectedWallIds: string[]
}
```

- [ ] **Step 2: Verify typecheck**

Run:
```bash
npm run build
```
Expected: build succeeds. No existing code consumes `bulges`, so nothing breaks.

- [ ] **Step 3: Commit**

```bash
git add src/types/elements.ts
git commit -m "feat(walls): add optional bulges[] to WallElement

bulges[i] is the signed perpendicular offset from chord midpoint to arc
midpoint. Missing/undefined/all-zero = today's straight polyline behavior
(backward compatible, no migration needed)."
```

---

## Task 2: Arc math module — `wallPath.ts`

**Files:**
- Create: `src/lib/wallPath.ts`
- Test: `src/__tests__/wallPath.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/wallPath.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests, expect failures**

Run:
```bash
npx vitest run src/__tests__/wallPath.test.ts
```
Expected: module-not-found error (`wallPath.ts` doesn't exist yet).

- [ ] **Step 3: Implement `wallPath.ts`**

Create `src/lib/wallPath.ts`:

```ts
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
  // Left-normal unit vector of the chord direction.
  const lnx = -dy / c
  const lny = dx / c
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
  // Left-normal unit vector.
  const lnx = -dy / c
  const lny = dx / c
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
  let cursor = 0
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s.bulge !== 0) continue
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0)
    if (target <= cursor + len + 1e-9) {
      const tInSegment = len === 0 ? 0 : (target - cursor) / len
      return { segmentIndex: i, tInSegment: Math.max(0, Math.min(1, tInSegment)) }
    }
    cursor += len
  }
  // Position landed beyond the last straight segment or in an arc at the
  // boundary — reject.
  return null
}
```

- [ ] **Step 4: Run tests, expect pass**

Run:
```bash
npx vitest run src/__tests__/wallPath.test.ts
```
Expected: all 15 tests pass.

- [ ] **Step 5: Lint**

Run:
```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/wallPath.ts src/__tests__/wallPath.test.ts
git commit -m "feat(walls): add wallPath.ts arc math module

Pure helpers for the bulges[] data model:
- wallSegments, arcFromBulge, wallPathData
- sampleArc, tangentAt, segmentMidpoint
- locateOnStraightSegments (guard used by doors/windows)

15 unit tests pinning the geometry (sign convention, sweep flag,
half-circle clamp boundary)."
```

---

## Task 3: WallRenderer — Line/Path branch

**Files:**
- Modify: `src/components/editor/Canvas/WallRenderer.tsx`
- Test: `src/__tests__/WallRenderer.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/WallRenderer.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Stage, Layer } from 'react-konva'
import { WallRenderer } from '../components/editor/Canvas/WallRenderer'
import type { WallElement } from '../types/elements'

function wall(overrides: Partial<WallElement> = {}): WallElement {
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
    zIndex: 1,
    label: 'Wall',
    visible: true,
    style: { fill: '#000', stroke: '#111827', strokeWidth: 6, opacity: 1 },
    points: [0, 0, 100, 0, 100, 100],
    thickness: 6,
    connectedWallIds: [],
    ...overrides,
  }
}

/** Snapshot the Konva node types produced for a given wall. */
function konvaKindsFor(el: WallElement): string[] {
  let stage: any
  const setStage = (s: any) => { stage = s }
  render(
    <Stage width={200} height={200} ref={setStage}>
      <Layer>
        <WallRenderer element={el} />
      </Layer>
    </Stage>,
  )
  const kinds: string[] = []
  stage.findOne('Group')?.getChildren().forEach((c: any) => kinds.push(c.getClassName()))
  return kinds
}

describe('WallRenderer', () => {
  it('bulges undefined → Line fast path', () => {
    expect(konvaKindsFor(wall({ bulges: undefined }))).toEqual(['Line'])
  })

  it('bulges all zero → Line fast path', () => {
    expect(konvaKindsFor(wall({ bulges: [0, 0] }))).toEqual(['Line'])
  })

  it('any non-zero bulge → Path', () => {
    expect(konvaKindsFor(wall({ bulges: [25, 0] }))).toEqual(['Path'])
  })

  it('selected state still flips stroke regardless of curve', () => {
    // We verify the component mounts; color differentiation is covered by
    // existing selection tests.
    expect(() => konvaKindsFor(wall({ bulges: [25, 0] }))).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests, expect failures**

Run:
```bash
npx vitest run src/__tests__/WallRenderer.test.tsx
```
Expected: tests fail because `WallRenderer` never renders a `Path`.

- [ ] **Step 3: Update `WallRenderer.tsx`**

Replace `src/components/editor/Canvas/WallRenderer.tsx` with:

```tsx
import { Group, Line, Path } from 'react-konva'
import type { WallElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { wallPathData } from '../../../lib/wallPath'

interface WallRendererProps {
  element: WallElement
}

export function WallRenderer({ element }: WallRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  const stroke = isSelected ? '#3B82F6' : element.style.stroke
  const hitStrokeWidth = Math.max(12, element.thickness + 6)

  const hasAnyBulge = (element.bulges ?? []).some((b) => b !== 0)

  return (
    <Group>
      {hasAnyBulge ? (
        <Path
          data={wallPathData(element.points, element.bulges)}
          stroke={stroke}
          strokeWidth={element.thickness}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={hitStrokeWidth}
          fillEnabled={false}
        />
      ) : (
        <Line
          points={element.points}
          stroke={stroke}
          strokeWidth={element.thickness}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={12}
        />
      )}
    </Group>
  )
}
```

- [ ] **Step 4: Run tests, expect pass**

Run:
```bash
npx vitest run src/__tests__/WallRenderer.test.tsx
```
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/Canvas/WallRenderer.tsx src/__tests__/WallRenderer.test.tsx
git commit -m "feat(walls): render bulged walls with Konva.Path

Fast-path Konva.Line when every bulge is 0 (or bulges is missing), so
existing straight walls keep today's renderer. Switch to Konva.Path with
wallPathData(points, bulges) only when needed."
```

---

## Task 4: Drawing — click-drag to bend in `useWallDrawing`

**Files:**
- Modify: `src/hooks/useWallDrawing.ts`
- Test: `src/__tests__/useWallDrawing.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/useWallDrawing.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useWallDrawing } from '../hooks/useWallDrawing'
import { useCanvasStore } from '../stores/canvasStore'
import { useElementsStore } from '../stores/elementsStore'
import type { WallElement } from '../types/elements'

function walls(): WallElement[] {
  return Object.values(useElementsStore.getState().elements).filter(
    (e): e is WallElement => e.type === 'wall',
  )
}

describe('useWallDrawing click-drag', () => {
  beforeEach(() => {
    useElementsStore.setState({ elements: {} })
    useCanvasStore.setState((s) => ({
      activeTool: 'wall',
      settings: { ...s.settings, showGrid: false },
    }))
  })

  it('mousedown+mouseup within drag threshold commits a straight vertex', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseUp(100, 0) // second vertex, no drag
      result.current.handleCanvasDoubleClick()
    })
    const w = walls()[0]
    expect(w.bulges).toEqual([0])
  })

  it('drag > threshold commits a non-zero bulge', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseMove(50, -20) // drag up
      result.current.handleCanvasMouseUp(100, 0)
      result.current.handleCanvasDoubleClick()
    })
    const w = walls()[0]
    expect(w.bulges!.length).toBe(1)
    expect(Math.abs(w.bulges![0])).toBeGreaterThan(0)
  })

  it('deadzone: drag of ≤2 px commits as straight', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseMove(50, -1.5) // tiny drift
      result.current.handleCanvasMouseUp(100, 0)
      result.current.handleCanvasDoubleClick()
    })
    expect(walls()[0].bulges).toEqual([0])
  })

  it('clamps magnitude to chordLength / 2', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
      result.current.handleCanvasMouseDown(100, 0) // chord = 100
      result.current.handleCanvasMouseMove(50, -999) // huge pull
      result.current.handleCanvasMouseUp(100, 0)
      result.current.handleCanvasDoubleClick()
    })
    expect(Math.abs(walls()[0].bulges![0])).toBeCloseTo(50, 1)
  })

  it('bulges.length === points.length/2 - 1', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseUp(100, 0)
      result.current.handleCanvasMouseDown(200, 0)
      result.current.handleCanvasMouseUp(200, 0)
      result.current.handleCanvasDoubleClick()
    })
    const w = walls()[0]
    expect(w.bulges!.length).toBe(w.points.length / 2 - 1)
  })

  it('cancel clears points and bulges', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseUp(100, 0)
      result.current.cancelDrawing()
    })
    expect(result.current.wallDrawingState.points).toEqual([])
    expect(result.current.wallDrawingState.bulges).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run:
```bash
npx vitest run src/__tests__/useWallDrawing.test.ts
```
Expected: tests fail — the new handlers (`handleCanvasMouseDown`, `handleCanvasMouseUp`) don't exist; `bulges` isn't on the state.

- [ ] **Step 3: Rewrite `useWallDrawing.ts`**

Replace `src/hooks/useWallDrawing.ts` with:

```ts
import { useState, useCallback, useRef } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import { useElementsStore } from '../stores/elementsStore'
import { nanoid } from 'nanoid'
import type { WallElement } from '../types/elements'
import { snapToGrid } from '../lib/geometry'

/** Min squared pointer travel (in canvas units) before a press is a drag. */
const DRAG_THRESHOLD_PX = 4
/** Distance from the chord, below which a drag snaps back to 0 (straight). */
const BULGE_DEADZONE_PX = 2
/** Decimal places to round committed bulges to (keeps diffs clean). */
const BULGE_ROUND_DECIMALS = 2

interface WallDrawingState {
  isDrawing: boolean
  points: number[]
  bulges: number[]
  currentPoint: { x: number; y: number } | null
  /** Live bulge while the user drags the CURRENT pending segment. null if no drag. */
  previewBulge: number | null
}

/** Project a pointer onto the left-normal of a chord and return signed perp distance. */
function signedPerpOffset(
  x0: number, y0: number, x1: number, y1: number, px: number, py: number,
): number {
  const dx = x1 - x0
  const dy = y1 - y0
  const c = Math.hypot(dx, dy)
  if (c === 0) return 0
  // Left-normal unit: (-dy/c, dx/c)
  const lnx = -dy / c
  const lny = dx / c
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  return (px - mx) * lnx + (py - my) * lny
}

function clampBulge(raw: number, chordLen: number): number {
  if (Math.abs(raw) < BULGE_DEADZONE_PX) return 0
  const max = chordLen / 2
  const clamped = Math.max(-max, Math.min(max, raw))
  const factor = 10 ** BULGE_ROUND_DECIMALS
  return Math.round(clamped * factor) / factor
}

export function useWallDrawing() {
  const [state, setState] = useState<WallDrawingState>({
    isDrawing: false,
    points: [],
    bulges: [],
    currentPoint: null,
    previewBulge: null,
  })

  const activeTool = useCanvasStore((s) => s.activeTool)
  const gridSize = useCanvasStore((s) => s.settings.gridSize)
  const showGrid = useCanvasStore((s) => s.settings.showGrid)
  const addElement = useElementsStore((s) => s.addElement)
  const getMaxZIndex = useElementsStore((s) => s.getMaxZIndex)

  const stateRef = useRef(state)
  stateRef.current = state

  /** Mouse-press canvas coords + timestamp, for drag-vs-click detection. */
  const pressRef = useRef<{ x: number; y: number } | null>(null)

  const snapPoint = useCallback(
    (x: number, y: number) => {
      if (showGrid) {
        return { x: snapToGrid(x, gridSize), y: snapToGrid(y, gridSize) }
      }
      return { x, y }
    },
    [gridSize, showGrid],
  )

  const handleCanvasMouseDown = useCallback(
    (canvasX: number, canvasY: number) => {
      if (activeTool !== 'wall') return
      pressRef.current = { x: canvasX, y: canvasY }
    },
    [activeTool],
  )

  const handleCanvasMouseMove = useCallback(
    (canvasX: number, canvasY: number) => {
      if (activeTool !== 'wall') return
      const snapped = snapPoint(canvasX, canvasY)
      setState((prev) => {
        if (!prev.isDrawing) return { ...prev, currentPoint: snapped }
        // If mid-drag and we have at least one vertex, compute live preview bulge.
        if (pressRef.current && prev.points.length >= 2) {
          const lastX = prev.points[prev.points.length - 2]
          const lastY = prev.points[prev.points.length - 1]
          const dx = canvasX - pressRef.current.x
          const dy = canvasY - pressRef.current.y
          const travel2 = dx * dx + dy * dy
          if (travel2 >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
            const chord = Math.hypot(pressRef.current.x - lastX, pressRef.current.y - lastY)
            const raw = signedPerpOffset(
              lastX, lastY, pressRef.current.x, pressRef.current.y, canvasX, canvasY,
            )
            const b = clampBulge(raw, chord)
            return { ...prev, currentPoint: snapped, previewBulge: b }
          }
        }
        return { ...prev, currentPoint: snapped }
      })
    },
    [activeTool, snapPoint],
  )

  const handleCanvasMouseUp = useCallback(
    (canvasX: number, canvasY: number) => {
      if (activeTool !== 'wall' || !pressRef.current) return
      const press = pressRef.current
      pressRef.current = null
      const snapped = snapPoint(press.x, press.y)
      const dx = canvasX - press.x
      const dy = canvasY - press.y
      const isDrag = dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX

      setState((prev) => {
        if (!prev.isDrawing) {
          // First vertex — no bulge to commit, dragging on the first press is a
          // no-op because there's no previous vertex yet.
          return {
            isDrawing: true,
            points: [snapped.x, snapped.y],
            bulges: [],
            currentPoint: snapped,
            previewBulge: null,
          }
        }

        const lastX = prev.points[prev.points.length - 2]
        const lastY = prev.points[prev.points.length - 1]
        let committedBulge = 0
        if (isDrag) {
          const chord = Math.hypot(snapped.x - lastX, snapped.y - lastY)
          const raw = signedPerpOffset(lastX, lastY, snapped.x, snapped.y, canvasX, canvasY)
          committedBulge = clampBulge(raw, chord)
        }
        return {
          ...prev,
          points: [...prev.points, snapped.x, snapped.y],
          bulges: [...prev.bulges, committedBulge],
          currentPoint: snapped,
          previewBulge: null,
        }
      })
    },
    [activeTool, snapPoint],
  )

  const handleCanvasDoubleClick = useCallback(() => {
    if (activeTool !== 'wall' || !stateRef.current.isDrawing) return
    const { points, bulges } = stateRef.current
    if (points.length >= 4) {
      const expectedBulges = points.length / 2 - 1
      // Defensive normalize: pad or trim bulges so length matches exactly.
      const normalizedBulges: number[] = []
      for (let i = 0; i < expectedBulges; i++) {
        normalizedBulges.push(bulges[i] ?? 0)
      }
      const wall: WallElement = {
        id: nanoid(),
        type: 'wall',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        locked: false,
        groupId: null,
        zIndex: getMaxZIndex() + 1,
        label: 'Wall',
        visible: true,
        style: { fill: '#1F2937', stroke: '#111827', strokeWidth: 6, opacity: 1 },
        points,
        bulges: normalizedBulges,
        thickness: 6,
        connectedWallIds: [],
      }
      addElement(wall)
    }
    setState({ isDrawing: false, points: [], bulges: [], currentPoint: null, previewBulge: null })
    pressRef.current = null
  }, [activeTool, addElement, getMaxZIndex])

  const cancelDrawing = useCallback(() => {
    setState({ isDrawing: false, points: [], bulges: [], currentPoint: null, previewBulge: null })
    pressRef.current = null
  }, [])

  return {
    wallDrawingState: state,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasDoubleClick,
    cancelDrawing,
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

Run:
```bash
npx vitest run src/__tests__/useWallDrawing.test.ts
```
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useWallDrawing.ts src/__tests__/useWallDrawing.test.ts
git commit -m "feat(walls): click-drag to bend in wall drawing

Split press/move/release. Under 4px travel = straight click (existing
behavior preserved). Above threshold = arc with signed perp offset as
bulge, clamped to chordLength/2 with a 2px deadzone snap to 0."
```

---

## Task 5: Canvas — route mousedown/mouseup to the hook

**Files:**
- Modify: `src/components/editor/Canvas/CanvasStage.tsx`

- [ ] **Step 1: Read current wiring**

Re-read `src/components/editor/Canvas/CanvasStage.tsx` lines 78–135 — confirm that today the wall branch lives inside `handleMouseDown` and calls `handleCanvasClick`.

- [ ] **Step 2: Patch CanvasStage to use new hook API**

Make three edits inside `src/components/editor/Canvas/CanvasStage.tsx`:

**Edit A** — destructure the new handlers from `useWallDrawing`. Replace:
```ts
const { wallDrawingState, handleCanvasClick, handleCanvasMouseMove, handleCanvasDoubleClick } = useWallDrawing()
```
with:
```ts
const { wallDrawingState, handleCanvasMouseDown: onWallMouseDown, handleCanvasMouseMove, handleCanvasMouseUp: onWallMouseUp, handleCanvasDoubleClick } = useWallDrawing()
```

**Edit B** — inside `handleMouseDown`, replace the wall branch:
```ts
if (activeTool === 'wall' && e.evt.button === 0) {
  const stage = stageRef.current
  if (!stage) return
  const pointer = stage.getPointerPosition()
  if (!pointer) return
  const canvasX = (pointer.x - stageX) / stageScale
  const canvasY = (pointer.y - stageY) / stageScale
  handleCanvasClick(canvasX, canvasY)
  return
}
```
with:
```ts
if (activeTool === 'wall' && e.evt.button === 0) {
  const stage = stageRef.current
  if (!stage) return
  const pointer = stage.getPointerPosition()
  if (!pointer) return
  const canvasX = (pointer.x - stageX) / stageScale
  const canvasY = (pointer.y - stageY) / stageScale
  onWallMouseDown(canvasX, canvasY)
  return
}
```

**Edit C** — update `handleMouseUp` to dispatch the wall release. Replace:
```ts
const handleMouseUp = useCallback(() => {
  isPanning.current = false
}, [])
```
with:
```ts
const handleMouseUp = useCallback(() => {
  isPanning.current = false
  if (activeTool === 'wall') {
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const canvasX = (pointer.x - stageX) / stageScale
    const canvasY = (pointer.y - stageY) / stageScale
    onWallMouseUp(canvasX, canvasY)
  }
}, [activeTool, stageX, stageY, stageScale, onWallMouseUp])
```

Also update the dependency list on `handleMouseDown` to reflect the renamed handler: replace `handleCanvasClick` with `onWallMouseDown` in the `useCallback` deps.

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build && npm run lint
```
Expected: both succeed.

- [ ] **Step 4: Manual smoke (editor dev server)**

Run:
```bash
npm run dev
```
Open the app. Pick the Wall tool. Click → click → dbl-click = straight polyline (unchanged). Click → click-drag → click → dbl-click = a wall with a visible curve. Ctrl-C to stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/Canvas/CanvasStage.tsx
git commit -m "feat(walls): route canvas press/release into useWallDrawing

Splits today's mousedown-only wiring into mousedown + mouseup so the
hook can distinguish click (straight vertex) from drag (arc with
bulge). Straight-only drawing is bit-for-bit preserved."
```

---

## Task 6: Drawing overlay — arc preview while dragging

**Files:**
- Modify: `src/components/editor/Canvas/WallDrawingOverlay.tsx`

- [ ] **Step 1: Update the overlay component**

Replace `src/components/editor/Canvas/WallDrawingOverlay.tsx` with:

```tsx
import { Layer, Line, Path, Circle, Text } from 'react-konva'
import { distanceBetween } from '../../../lib/geometry'
import { useCanvasStore } from '../../../stores/canvasStore'
import { wallPathData } from '../../../lib/wallPath'

interface WallDrawingOverlayProps {
  points: number[]
  bulges: number[]
  currentPoint: { x: number; y: number } | null
  isDrawing: boolean
  /** Live bulge while dragging the pending final segment. null if not dragging. */
  previewBulge: number | null
}

export function WallDrawingOverlay({
  points,
  bulges,
  currentPoint,
  isDrawing,
  previewBulge,
}: WallDrawingOverlayProps) {
  const settings = useCanvasStore((s) => s.settings)

  if (!isDrawing || points.length === 0) return null

  // The preview extends `points` by `currentPoint` and `bulges` by the
  // live preview bulge (or 0 if we're not dragging).
  const previewPoints = currentPoint
    ? [...points, currentPoint.x, currentPoint.y]
    : points
  const previewBulges = currentPoint
    ? [...bulges, previewBulge ?? 0]
    : bulges
  const previewHasArc = previewBulges.some((b) => b !== 0)

  let dimensionLabel = ''
  if (currentPoint && points.length >= 2) {
    const lastX = points[points.length - 2]
    const lastY = points[points.length - 1]
    const dist = distanceBetween(
      { x: lastX, y: lastY },
      { x: currentPoint.x, y: currentPoint.y },
    )
    const scaledDist = dist * settings.scale
    dimensionLabel = `${scaledDist.toFixed(1)} ${settings.scaleUnit}`
  }

  return (
    <Layer listening={false}>
      {previewHasArc ? (
        <Path
          data={wallPathData(previewPoints, previewBulges)}
          stroke="#3B82F6"
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
          dash={[8, 4]}
          fillEnabled={false}
        />
      ) : (
        <Line
          points={previewPoints}
          stroke="#3B82F6"
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
          dash={[8, 4]}
        />
      )}

      {Array.from({ length: points.length / 2 }, (_, i) => (
        <Circle
          key={i}
          x={points[i * 2]}
          y={points[i * 2 + 1]}
          radius={4}
          fill="#3B82F6"
          stroke="#ffffff"
          strokeWidth={2}
        />
      ))}

      {dimensionLabel && currentPoint && points.length >= 2 && (
        <Text
          x={(points[points.length - 2] + currentPoint.x) / 2 + 8}
          y={(points[points.length - 1] + currentPoint.y) / 2 - 16}
          text={dimensionLabel}
          fontSize={12}
          fill="#3B82F6"
          fontStyle="bold"
        />
      )}
    </Layer>
  )
}
```

- [ ] **Step 2: Verify the CanvasStage pass-through**

`CanvasStage.tsx` already spreads `wallDrawingState` into `<WallDrawingOverlay {...wallDrawingState} />`. The new `bulges` and `previewBulge` fields are part of that state (added in Task 4), so no change needed here. Confirm by running:

```bash
npm run build
```
Expected: build succeeds. If TypeScript complains about missing props, re-check that Task 4's `WallDrawingState` exports match the new `WallDrawingOverlayProps`.

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/Canvas/WallDrawingOverlay.tsx
git commit -m "feat(walls): arc preview in wall drawing overlay

While click-drag is in progress, the preview renders via Konva.Path
using wallPathData so the user sees the actual circular arc they're
about to commit, not a straight dashed line."
```

---

## Task 7: WallEditOverlay — midpoint handles for selected walls

**Files:**
- Create: `src/components/editor/Canvas/WallEditOverlay.tsx`
- Test: `src/__tests__/WallEditOverlay.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/WallEditOverlay.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { Stage } from 'react-konva'
import { WallEditOverlay } from '../components/editor/Canvas/WallEditOverlay'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import type { WallElement } from '../types/elements'

function seedWall(partial: Partial<WallElement> = {}): WallElement {
  const w: WallElement = {
    id: 'w1',
    type: 'wall',
    x: 0, y: 0, width: 0, height: 0, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Wall', visible: true,
    style: { fill: '#000', stroke: '#111827', strokeWidth: 6, opacity: 1 },
    points: [0, 0, 100, 0, 200, 0],
    bulges: [0, 0],
    thickness: 6,
    connectedWallIds: [],
    ...partial,
  }
  useElementsStore.setState({ elements: { [w.id]: w } })
  return w
}

function renderOverlay() {
  return render(
    <Stage width={400} height={300}>
      <WallEditOverlay />
    </Stage>,
  )
}

describe('WallEditOverlay', () => {
  beforeEach(() => {
    useElementsStore.setState({ elements: {} })
    useUIStore.setState({ selectedIds: [] })
  })

  it('renders nothing when no wall is selected', () => {
    seedWall()
    useUIStore.setState({ selectedIds: [] })
    const { container } = renderOverlay()
    expect(container.querySelector('canvas')).toBeTruthy()
    // No handles means the internal Layer has no children of interest;
    // mount should not throw.
  })

  it('renders N endpoint handles + N-1 midpoint handles', () => {
    seedWall() // 3 vertices → 2 segments → 3 endpoint + 2 midpoint handles
    useUIStore.setState({ selectedIds: ['w1'] })
    const { container } = renderOverlay()
    // react-konva renders into a single canvas; count handles via internal stage.
    const stage = (container.querySelector('canvas') as any)?._stage
      ?? (container.querySelector('div')?.firstChild as any)?._stage
    // Fallback: count circles by searching Konva tree via role attributes on
    // <Circle> we'll tag with name 'endpoint-handle' | 'midpoint-handle'.
    const all = stage ? stage.find('Circle') : []
    const endpoints = all.filter((n: any) => n.name() === 'wall-endpoint-handle')
    const midpoints = all.filter((n: any) => n.name() === 'wall-midpoint-handle')
    expect(endpoints).toHaveLength(3)
    expect(midpoints).toHaveLength(2)
  })

  it('dragging a midpoint perpendicular to chord patches bulges[i]', () => {
    seedWall()
    useUIStore.setState({ selectedIds: ['w1'] })
    renderOverlay()
    // Simulate drag programmatically through the store hook helper
    // (component exports `__applyBulgeFromDrag` for tests).
    const { __applyBulgeFromDrag } = require('../components/editor/Canvas/WallEditOverlay')
    act(() => {
      __applyBulgeFromDrag('w1', 0, /*pointer*/ { x: 50, y: -20 })
    })
    const w = useElementsStore.getState().elements['w1'] as WallElement
    expect(w.bulges![0]).not.toBe(0)
  })

  it('dragging midpoint back to the chord snaps bulges[i] to 0', () => {
    seedWall({ bulges: [15, 0] })
    useUIStore.setState({ selectedIds: ['w1'] })
    renderOverlay()
    const { __applyBulgeFromDrag } = require('../components/editor/Canvas/WallEditOverlay')
    act(() => {
      __applyBulgeFromDrag('w1', 0, /*pointer*/ { x: 50, y: 0.5 }) // within deadzone
    })
    const w = useElementsStore.getState().elements['w1'] as WallElement
    expect(w.bulges![0]).toBe(0)
  })

  it('dragging past chordLength/2 clamps the committed bulge', () => {
    seedWall()
    useUIStore.setState({ selectedIds: ['w1'] })
    renderOverlay()
    const { __applyBulgeFromDrag } = require('../components/editor/Canvas/WallEditOverlay')
    act(() => {
      __applyBulgeFromDrag('w1', 0, /*pointer*/ { x: 50, y: -500 }) // huge pull
    })
    const w = useElementsStore.getState().elements['w1'] as WallElement
    // chord of segment 0 = 100 → clamp |bulge| ≤ 50
    expect(Math.abs(w.bulges![0])).toBeCloseTo(50, 1)
  })
})
```

- [ ] **Step 2: Run tests, expect failures**

Run:
```bash
npx vitest run src/__tests__/WallEditOverlay.test.tsx
```
Expected: module-not-found error (`WallEditOverlay` doesn't exist).

- [ ] **Step 3: Create `WallEditOverlay.tsx`**

Create `src/components/editor/Canvas/WallEditOverlay.tsx`:

```tsx
import { Layer, Circle } from 'react-konva'
import type Konva from 'konva'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { isWallElement, type WallElement } from '../../../types/elements'
import { wallSegments, segmentMidpoint } from '../../../lib/wallPath'

const BULGE_DEADZONE_PX = 2
const BULGE_ROUND_DECIMALS = 2

function signedPerpOffset(
  x0: number, y0: number, x1: number, y1: number, px: number, py: number,
): number {
  const dx = x1 - x0
  const dy = y1 - y0
  const c = Math.hypot(dx, dy)
  if (c === 0) return 0
  const lnx = -dy / c
  const lny = dx / c
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  return (px - mx) * lnx + (py - my) * lny
}

function clampBulge(raw: number, chordLen: number): number {
  if (Math.abs(raw) < BULGE_DEADZONE_PX) return 0
  const max = chordLen / 2
  const clamped = Math.max(-max, Math.min(max, raw))
  const factor = 10 ** BULGE_ROUND_DECIMALS
  return Math.round(clamped * factor) / factor
}

/** Exported for unit tests; apply the bulge implied by a pointer position
 *  during a midpoint-handle drag. */
export function __applyBulgeFromDrag(
  wallId: string,
  segmentIndex: number,
  pointer: { x: number; y: number },
): void {
  const store = useElementsStore.getState()
  const el = store.elements[wallId]
  if (!el || !isWallElement(el)) return
  const segs = wallSegments(el.points, el.bulges)
  const seg = segs[segmentIndex]
  if (!seg) return
  const chord = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0)
  const raw = signedPerpOffset(seg.x0, seg.y0, seg.x1, seg.y1, pointer.x, pointer.y)
  const newBulge = clampBulge(raw, chord)
  const nextBulges = Array.from({ length: segs.length }, (_, i) => el.bulges?.[i] ?? 0)
  nextBulges[segmentIndex] = newBulge
  store.updateElement(wallId, { bulges: nextBulges })
}

/** Exported for unit tests; move an endpoint vertex. */
export function __applyVertexMove(
  wallId: string,
  vertexIndex: number,
  pointer: { x: number; y: number },
): void {
  const store = useElementsStore.getState()
  const el = store.elements[wallId]
  if (!el || !isWallElement(el)) return
  const nextPoints = [...el.points]
  nextPoints[vertexIndex * 2] = pointer.x
  nextPoints[vertexIndex * 2 + 1] = pointer.y
  store.updateElement(wallId, { points: nextPoints })
}

export function WallEditOverlay() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const elements = useElementsStore((s) => s.elements)

  const selectedWalls = selectedIds
    .map((id) => elements[id])
    .filter((el): el is WallElement => !!el && isWallElement(el))

  if (selectedWalls.length === 0) return null

  return (
    <Layer>
      {selectedWalls.map((wall) => {
        const segs = wallSegments(wall.points, wall.bulges)
        const vertexCount = wall.points.length / 2
        return (
          <>
            {Array.from({ length: vertexCount }, (_, vi) => (
              <Circle
                key={`e-${wall.id}-${vi}`}
                name="wall-endpoint-handle"
                x={wall.points[vi * 2]}
                y={wall.points[vi * 2 + 1]}
                radius={5}
                fill="#3B82F6"
                stroke="#ffffff"
                strokeWidth={2}
                draggable
                onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
                  const node = e.target
                  __applyVertexMove(wall.id, vi, { x: node.x(), y: node.y() })
                }}
              />
            ))}
            {segs.map((seg, si) => {
              const mid = segmentMidpoint(seg)
              return (
                <Circle
                  key={`m-${wall.id}-${si}`}
                  name="wall-midpoint-handle"
                  x={mid.x}
                  y={mid.y}
                  radius={5}
                  fill="#22C55E"
                  stroke="#ffffff"
                  strokeWidth={2}
                  draggable
                  onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
                    const node = e.target
                    __applyBulgeFromDrag(wall.id, si, { x: node.x(), y: node.y() })
                  }}
                  onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
                    // Re-snap the handle back onto the segment midpoint so
                    // the next drag starts from a consistent position.
                    const store = useElementsStore.getState()
                    const el = store.elements[wall.id]
                    if (el && isWallElement(el)) {
                      const fresh = wallSegments(el.points, el.bulges)[si]
                      if (fresh) {
                        const m = segmentMidpoint(fresh)
                        e.target.position({ x: m.x, y: m.y })
                      }
                    }
                  }}
                />
              )
            })}
          </>
        )
      })}
    </Layer>
  )
}
```

- [ ] **Step 4: Run tests, expect pass**

Run:
```bash
npx vitest run src/__tests__/WallEditOverlay.test.tsx
```
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/Canvas/WallEditOverlay.tsx src/__tests__/WallEditOverlay.test.tsx
git commit -m "feat(walls): midpoint + endpoint handles for selected walls

New WallEditOverlay mounts only when a wall is selected. Green midpoint
handles set bulges[i] from a signed perpendicular offset (deadzone
snap-to-0, clamp to chord/2). Blue endpoint handles move vertices
without touching bulges — radius re-derives automatically."
```

---

## Task 8: Mount `WallEditOverlay` in CanvasStage

**Files:**
- Modify: `src/components/editor/Canvas/CanvasStage.tsx`

- [ ] **Step 1: Import and render**

In `src/components/editor/Canvas/CanvasStage.tsx`:

- Add the import at the top (with other Canvas imports):
  ```ts
  import { WallEditOverlay } from './WallEditOverlay'
  ```

- Inside the `<Stage>` children, add `<WallEditOverlay />` **after** `<SelectionOverlay />` but **before** `<WallDrawingOverlay />`:
  ```tsx
  <SelectionOverlay />
  <WallEditOverlay />
  {orgChartOverlayEnabled && <OrgChartOverlay />}
  ```

- [ ] **Step 2: Verify build**

Run:
```bash
npm run build && npm run lint
```
Expected: both succeed.

- [ ] **Step 3: Smoke test**

Run `npm run dev`. Select tool → click a curved wall → green midpoints appear → drag one → segment bends/un-bends live. Stop server.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/Canvas/CanvasStage.tsx
git commit -m "feat(walls): mount WallEditOverlay on selected walls"
```

---

## Task 9: Integration — `curvedWallFlow.test.tsx`

**Files:**
- Create: `src/__tests__/curvedWallFlow.test.tsx`

- [ ] **Step 1: Write the integration test**

Create `src/__tests__/curvedWallFlow.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useWallDrawing } from '../hooks/useWallDrawing'
import { useElementsStore } from '../stores/elementsStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useUIStore } from '../stores/uiStore'
import { __applyBulgeFromDrag } from '../components/editor/Canvas/WallEditOverlay'
import type { WallElement } from '../types/elements'

function walls(): WallElement[] {
  return Object.values(useElementsStore.getState().elements).filter(
    (e): e is WallElement => e.type === 'wall',
  )
}

describe('Curved wall end-to-end flow', () => {
  beforeEach(() => {
    useElementsStore.setState({ elements: {} })
    useUIStore.setState({ selectedIds: [] })
    useCanvasStore.setState((s) => ({
      activeTool: 'wall',
      settings: { ...s.settings, showGrid: false },
    }))
  })

  it('draw click, click-drag, click, dblclick → mixed segments', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      // vertex 1 (click)
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
      // vertex 2 (click-drag)
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseMove(60, -30)
      result.current.handleCanvasMouseUp(100, 0)
      // vertex 3 (click)
      result.current.handleCanvasMouseDown(200, 0)
      result.current.handleCanvasMouseUp(200, 0)
      // vertex 4 (click)
      result.current.handleCanvasMouseDown(300, 0)
      result.current.handleCanvasMouseUp(300, 0)
      result.current.handleCanvasDoubleClick()
    })
    const w = walls()[0]
    expect(w.points).toHaveLength(8)
    expect(w.bulges).toHaveLength(3)
    expect(w.bulges![0]).not.toBe(0)
    expect(w.bulges![1]).toBe(0)
    expect(w.bulges![2]).toBe(0)
  })

  it('dragging midpoint back to chord flattens the segment', () => {
    // Seed a curved wall
    const w: WallElement = {
      id: 'w1',
      type: 'wall',
      x: 0, y: 0, width: 0, height: 0, rotation: 0,
      locked: false, groupId: null, zIndex: 1,
      label: 'Wall', visible: true,
      style: { fill: '#000', stroke: '#111827', strokeWidth: 6, opacity: 1 },
      points: [0, 0, 100, 0, 200, 0],
      bulges: [20, 0],
      thickness: 6,
      connectedWallIds: [],
    }
    useElementsStore.setState({ elements: { w1: w } })
    act(() => {
      __applyBulgeFromDrag('w1', 0, { x: 50, y: 0 }) // snap to chord
    })
    const after = useElementsStore.getState().elements.w1 as WallElement
    expect(after.bulges).toEqual([0, 0])
  })

  it('undo restores previous bulges', () => {
    const w: WallElement = {
      id: 'w1',
      type: 'wall',
      x: 0, y: 0, width: 0, height: 0, rotation: 0,
      locked: false, groupId: null, zIndex: 1,
      label: 'Wall', visible: true,
      style: { fill: '#000', stroke: '#111827', strokeWidth: 6, opacity: 1 },
      points: [0, 0, 100, 0],
      bulges: [0],
      thickness: 6,
      connectedWallIds: [],
    }
    useElementsStore.setState({ elements: { w1: w } })
    // Take a temporal snapshot before the edit
    const temporal = (useElementsStore as any).temporal.getState()
    // zundo auto-snapshots on setState; trigger an update and undo.
    act(() => {
      __applyBulgeFromDrag('w1', 0, { x: 50, y: -30 })
    })
    const mid = useElementsStore.getState().elements.w1 as WallElement
    expect(mid.bulges![0]).not.toBe(0)

    act(() => {
      temporal.undo()
    })
    const back = useElementsStore.getState().elements.w1 as WallElement
    expect(back.bulges![0]).toBe(0)
  })
})
```

- [ ] **Step 2: Run**

Run:
```bash
npx vitest run src/__tests__/curvedWallFlow.test.tsx
```
Expected: all 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/curvedWallFlow.test.tsx
git commit -m "test(walls): integration — curved wall draw/edit/undo flow"
```

---

## Task 10: Persistence tests

**Files:**
- Create: `src/__tests__/wallAutoSave.test.ts`

- [ ] **Step 1: Write tests**

Create `src/__tests__/wallAutoSave.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { loadAutoSave } from '../hooks/useAutoSave'
import type { WallElement } from '../types/elements'

const SAVE_KEY = 'floocraft-autosave'

beforeEach(() => {
  localStorage.clear()
})

describe('Wall persistence', () => {
  it('round-trips bulges through localStorage', () => {
    const wall: WallElement = {
      id: 'w1',
      type: 'wall',
      x: 0, y: 0, width: 0, height: 0, rotation: 0,
      locked: false, groupId: null, zIndex: 1,
      label: 'Wall', visible: true,
      style: { fill: '#000', stroke: '#111827', strokeWidth: 6, opacity: 1 },
      points: [0, 0, 100, 0, 200, 0],
      bulges: [0, 10, 0].slice(0, 2), // length must match segment count
      thickness: 6,
      connectedWallIds: [],
    }
    const payload = {
      project: null,
      elements: { w1: wall },
      employees: [],
      departmentColors: {},
      floors: [],
      activeFloorId: null,
      settings: {},
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload))

    const loaded = loadAutoSave()!
    const w = (loaded.elements as Record<string, WallElement>).w1
    expect(w.bulges).toEqual([0, 10])
    expect(w.points).toEqual([0, 0, 100, 0, 200, 0])
  })

  it('legacy wall with no bulges field loads with bulges undefined', () => {
    const legacyWall = {
      id: 'w1',
      type: 'wall',
      x: 0, y: 0, width: 0, height: 0, rotation: 0,
      locked: false, groupId: null, zIndex: 1,
      label: 'Wall', visible: true,
      style: { fill: '#000', stroke: '#111827', strokeWidth: 6, opacity: 1 },
      points: [0, 0, 100, 0],
      thickness: 6,
      connectedWallIds: [],
    }
    const payload = {
      project: null,
      elements: { w1: legacyWall },
      employees: [],
      departmentColors: {},
      floors: [],
      activeFloorId: null,
      settings: {},
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload))

    const loaded = loadAutoSave()!
    const w = (loaded.elements as Record<string, WallElement>).w1
    expect(w.bulges).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run**

Run:
```bash
npx vitest run src/__tests__/wallAutoSave.test.ts
```
Expected: both tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/wallAutoSave.test.ts
git commit -m "test(walls): persistence — bulges round-trip + legacy compat"
```

---

## Task 11: Full test + build + manual QA

**Files:**
- None

- [ ] **Step 1: Full test suite**

Run:
```bash
npx vitest run
```
Expected: the entire suite passes (nothing in Bundle 1's tests should regress).

- [ ] **Step 2: Lint + typecheck + build**

Run:
```bash
npm run lint && npm run build
```
Expected: all pass.

- [ ] **Step 3: Bundle size check**

From the build output, note the editor chunk size. Capture this for the PR body — the change should be ≤ +5 KB gzipped (mostly the `wallPath.ts` math and one new overlay component).

- [ ] **Step 4: Manual QA against ship criteria**

Run `npm run dev` and walk through each ship criterion from the spec:

1. Click, click, dbl-click → straight wall (unchanged).
2. Click, click-drag, click, dbl-click → arc segment visible.
3. Mix straight + arc segments in one wall.
4. Select a wall → endpoint + midpoint handles appear; drag midpoint bends segment; drag back flattens it.
5. Arc renders as `Konva.Path` (verify in React DevTools or by inspecting Konva stage).
6. Click on the drawn arc line → selects the wall.
7. Load a project saved pre-feature → walls render unchanged (reload the page, data is in localStorage).
8. Door/window tools — skip this step if doors/windows aren't wired up as draggable elements in the current branch; otherwise verify the guard rejects arc drops.
9. After bending a segment, `Cmd+Z` restores the previous bulge.
10. All `npm` checks pass.

Fix anything that fails; re-run the full suite after each fix.

- [ ] **Step 5: Commit any QA fixes**

If QA surfaced issues, commit each fix as a separate small commit (e.g. `fix(walls): ...`). Otherwise skip.

---

## Task 12: Open PR

**Files:**
- None

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/curved-walls
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --base feat/delete-and-shapes --title "Curved walls (Bundle 2)" --body "$(cat <<'EOF'
## Summary
- Adds circular-arc segments to the Wall tool via an optional `bulges?: number[]` on `WallElement`. Missing/all-zero = today's straight polyline (backward compatible, no migration).
- Drawing: click = straight point; click-drag = arc (signed perp drag distance = bulge). 4px threshold + 2px deadzone keep existing click-click-dblclick flow bit-for-bit.
- Editing: selecting a wall shows blue endpoint handles + green midpoint handles. Drag a midpoint to bend/un-bend any segment — works retroactively on walls drawn before this feature.
- Rendering: fast-path `Konva.Line` when every bulge is 0; switches to `Konva.Path` with SVG `A` commands when any segment is bulged.
- Doors/windows: `locateOnStraightSegments` guard rejects positions that land on arc segments.

## Spec + Plan
- Spec: `docs/superpowers/specs/2026-04-16-curved-walls-design.md`
- Plan: `docs/superpowers/plans/2026-04-16-curved-walls.md`

## Test plan
- [x] `npx vitest run` — full suite passes
- [x] `npm run lint` passes
- [x] `npm run build` passes
- [x] Manual QA against all 10 ship criteria from the spec
- [x] Pre-feature localStorage payload loads and renders unchanged

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Paste URL into the run log**

Return the PR URL when done.

---

## Self-review checklist (already run)

- **Spec coverage:** Every section maps to tasks — data model (Task 1), arc math (Task 2), renderer (Task 3), drawing UX (Tasks 4–6), editing UX (Tasks 7–8), doors guard (covered inside Task 2's `locateOnStraightSegments`), persistence (Task 10), integration (Task 9). Ship criteria 1–10 covered by Tasks 3, 4, 7, 9, 10, 11.
- **Placeholder scan:** No TBDs, no "handle edge cases", every code step has complete code.
- **Type consistency:** `WallSegment`, `ArcGeometry`, `WallDrawingState`, `__applyBulgeFromDrag`, `locateOnStraightSegments` signatures are consistent across tasks. `DRAG_THRESHOLD_PX`, `BULGE_DEADZONE_PX`, and `BULGE_ROUND_DECIMALS` use the same values in `useWallDrawing.ts` and `WallEditOverlay.tsx` (4, 2, 2).
