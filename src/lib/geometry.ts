export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize
}

export function distanceBetween(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function rectCenter(rect: Rect): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}

export function snapRotation(degrees: number, snapIncrement: number): number {
  return Math.round(degrees / snapIncrement) * snapIncrement
}

/**
 * A snap-time alignment guide.
 *
 * `position` is the constant coordinate of the dashed line (the X for a
 * vertical guide, the Y for a horizontal one). `start`/`end` span the
 * union of the two participating rects along the OTHER axis so the line
 * visibly extends past both rectangles.
 *
 * `gap` is the perpendicular-to-guide distance between the two rects'
 * nearest non-aligned edges — the "how far apart are they?" number
 * surfaced as the distance label. Zero when the rects overlap along that
 * axis. `gapMidpoint` is the coordinate (on the guide's perpendicular
 * axis) that sits exactly between the two rects along the gap — the
 * natural anchor for a centered distance label.
 *
 * The gap fields are optional for backwards compatibility with callers
 * that build guides by hand (tests, external tooling). `findAlignmentGuides`
 * always populates them.
 */
export interface AlignmentGuide {
  orientation: 'horizontal' | 'vertical'
  position: number
  start: number
  end: number
  /** Canvas-unit distance between the two rects' nearest non-aligned edges. */
  gap?: number
  /**
   * Coordinate along the guide's `start..end` axis that anchors the
   * distance label. For a vertical guide this is a Y; for horizontal, an X.
   */
  gapMidpoint?: number
}

/**
 * Compute the perpendicular-axis gap between two rects along the given
 * orientation. For a VERTICAL guide (rects aligned on X), the relevant
 * axis is Y — we return the vertical clearance between them and the
 * y-coordinate halfway through that clearance. If they overlap on Y the
 * gap is 0 and the midpoint is the overlap center so the label still has
 * a sensible place to land.
 */
function gapBetween(
  a: Rect,
  b: Rect,
  orientation: 'horizontal' | 'vertical',
): { gap: number; midpoint: number } {
  // For a vertical guide the axis of interest is Y; for horizontal it's X.
  const axis: 'x' | 'y' = orientation === 'vertical' ? 'y' : 'x'
  const size: 'width' | 'height' = orientation === 'vertical' ? 'height' : 'width'

  const aMin = a[axis]
  const aMax = a[axis] + a[size]
  const bMin = b[axis]
  const bMax = b[axis] + b[size]

  // a fully above/left of b.
  if (aMax <= bMin) {
    return { gap: bMin - aMax, midpoint: (aMax + bMin) / 2 }
  }
  // b fully above/left of a.
  if (bMax <= aMin) {
    return { gap: aMin - bMax, midpoint: (bMax + aMin) / 2 }
  }
  // They overlap along this axis — no "gap", but we still anchor the
  // label at the overlap centre so it doesn't drift off-screen.
  const overlapMin = Math.max(aMin, bMin)
  const overlapMax = Math.min(aMax, bMax)
  return { gap: 0, midpoint: (overlapMin + overlapMax) / 2 }
}

export function findAlignmentGuides(
  movingRect: Rect,
  otherRects: Rect[],
  threshold: number
): AlignmentGuide[] {
  const guides: AlignmentGuide[] = []
  const movingCenter = rectCenter(movingRect)

  for (const other of otherRects) {
    const otherCenter = rectCenter(other)
    const vGap = gapBetween(movingRect, other, 'vertical')
    const hGap = gapBetween(movingRect, other, 'horizontal')

    // Vertical center alignment
    if (Math.abs(movingCenter.x - otherCenter.x) < threshold) {
      guides.push({
        orientation: 'vertical',
        position: otherCenter.x,
        start: Math.min(movingRect.y, other.y),
        end: Math.max(movingRect.y + movingRect.height, other.y + other.height),
        gap: vGap.gap,
        gapMidpoint: vGap.midpoint,
      })
    }

    // Horizontal center alignment
    if (Math.abs(movingCenter.y - otherCenter.y) < threshold) {
      guides.push({
        orientation: 'horizontal',
        position: otherCenter.y,
        start: Math.min(movingRect.x, other.x),
        end: Math.max(movingRect.x + movingRect.width, other.x + other.width),
        gap: hGap.gap,
        gapMidpoint: hGap.midpoint,
      })
    }

    // Left edge alignment
    if (Math.abs(movingRect.x - other.x) < threshold) {
      guides.push({
        orientation: 'vertical',
        position: other.x,
        start: Math.min(movingRect.y, other.y),
        end: Math.max(movingRect.y + movingRect.height, other.y + other.height),
        gap: vGap.gap,
        gapMidpoint: vGap.midpoint,
      })
    }

    // Right edge alignment
    if (Math.abs(movingRect.x + movingRect.width - (other.x + other.width)) < threshold) {
      guides.push({
        orientation: 'vertical',
        position: other.x + other.width,
        start: Math.min(movingRect.y, other.y),
        end: Math.max(movingRect.y + movingRect.height, other.y + other.height),
        gap: vGap.gap,
        gapMidpoint: vGap.midpoint,
      })
    }

    // Top edge alignment
    if (Math.abs(movingRect.y - other.y) < threshold) {
      guides.push({
        orientation: 'horizontal',
        position: other.y,
        start: Math.min(movingRect.x, other.x),
        end: Math.max(movingRect.x + movingRect.width, other.x + other.width),
        gap: hGap.gap,
        gapMidpoint: hGap.midpoint,
      })
    }

    // Bottom edge alignment
    if (Math.abs(movingRect.y + movingRect.height - (other.y + other.height)) < threshold) {
      guides.push({
        orientation: 'horizontal',
        position: other.y + other.height,
        start: Math.min(movingRect.x, other.x),
        end: Math.max(movingRect.x + movingRect.width, other.x + other.width),
        gap: hGap.gap,
        gapMidpoint: hGap.midpoint,
      })
    }
  }

  return guides
}

export function getSnappedPosition(
  pos: Point,
  otherRects: Rect[],
  movingSize: { width: number; height: number },
  threshold: number
): { snapped: Point; guides: AlignmentGuide[] } {
  const movingRect: Rect = { x: pos.x, y: pos.y, ...movingSize }
  const guides = findAlignmentGuides(movingRect, otherRects, threshold)

  let snappedX = pos.x
  let snappedY = pos.y

  for (const guide of guides) {
    if (guide.orientation === 'vertical') {
      const movingCenter = pos.x + movingSize.width / 2
      if (Math.abs(movingCenter - guide.position) < threshold) {
        snappedX = guide.position - movingSize.width / 2
      } else if (Math.abs(pos.x - guide.position) < threshold) {
        snappedX = guide.position
      } else if (Math.abs(pos.x + movingSize.width - guide.position) < threshold) {
        snappedX = guide.position - movingSize.width
      }
    }
    if (guide.orientation === 'horizontal') {
      const movingCenter = pos.y + movingSize.height / 2
      if (Math.abs(movingCenter - guide.position) < threshold) {
        snappedY = guide.position - movingSize.height / 2
      } else if (Math.abs(pos.y - guide.position) < threshold) {
        snappedY = guide.position
      } else if (Math.abs(pos.y + movingSize.height - guide.position) < threshold) {
        snappedY = guide.position - movingSize.height
      }
    }
  }

  return { snapped: { x: snappedX, y: snappedY }, guides }
}
