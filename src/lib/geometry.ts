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

export interface AlignmentGuide {
  orientation: 'horizontal' | 'vertical'
  position: number
  start: number
  end: number
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

    // Vertical center alignment
    if (Math.abs(movingCenter.x - otherCenter.x) < threshold) {
      guides.push({
        orientation: 'vertical',
        position: otherCenter.x,
        start: Math.min(movingRect.y, other.y),
        end: Math.max(movingRect.y + movingRect.height, other.y + other.height),
      })
    }

    // Horizontal center alignment
    if (Math.abs(movingCenter.y - otherCenter.y) < threshold) {
      guides.push({
        orientation: 'horizontal',
        position: otherCenter.y,
        start: Math.min(movingRect.x, other.x),
        end: Math.max(movingRect.x + movingRect.width, other.x + other.width),
      })
    }

    // Left edge alignment
    if (Math.abs(movingRect.x - other.x) < threshold) {
      guides.push({
        orientation: 'vertical',
        position: other.x,
        start: Math.min(movingRect.y, other.y),
        end: Math.max(movingRect.y + movingRect.height, other.y + other.height),
      })
    }

    // Right edge alignment
    if (Math.abs(movingRect.x + movingRect.width - (other.x + other.width)) < threshold) {
      guides.push({
        orientation: 'vertical',
        position: other.x + other.width,
        start: Math.min(movingRect.y, other.y),
        end: Math.max(movingRect.y + movingRect.height, other.y + other.height),
      })
    }

    // Top edge alignment
    if (Math.abs(movingRect.y - other.y) < threshold) {
      guides.push({
        orientation: 'horizontal',
        position: other.y,
        start: Math.min(movingRect.x, other.x),
        end: Math.max(movingRect.x + movingRect.width, other.x + other.width),
      })
    }

    // Bottom edge alignment
    if (Math.abs(movingRect.y + movingRect.height - (other.y + other.height)) < threshold) {
      guides.push({
        orientation: 'horizontal',
        position: other.y + other.height,
        start: Math.min(movingRect.x, other.x),
        end: Math.max(movingRect.x + movingRect.width, other.x + other.width),
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
