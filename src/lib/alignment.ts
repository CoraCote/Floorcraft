import { useElementsStore } from '../stores/elementsStore'
import { isWallElement, type CanvasElement } from '../types/elements'

export type AlignOp =
  | 'left'
  | 'h-center'
  | 'right'
  | 'top'
  | 'v-center'
  | 'bottom'

export type DistributeOp = 'horizontal' | 'vertical'

/**
 * Element x/y are center-origin, so the AABB bounds are `x ± width/2` and
 * `y ± height/2`. Walls live in world coords via `points` and are skipped
 * by align/distribute in this PR — supporting them would need per-segment
 * translation which is both rare for users (walls are anchor structure)
 * and nontrivial to undo atomically with the other selection members.
 */
function alignableElements(ids: string[]): CanvasElement[] {
  const { elements } = useElementsStore.getState()
  const out: CanvasElement[] = []
  let hadWall = false
  for (const id of ids) {
    const el = elements[id]
    if (!el) continue
    if (el.locked) continue
    if (isWallElement(el)) {
      hadWall = true
      continue
    }
    out.push(el)
  }
  if (hadWall) {
    console.warn('alignElements/distributeElements: walls are not supported and were skipped')
  }
  return out
}

export function alignElements(ids: string[], op: AlignOp): void {
  const els = alignableElements(ids)
  if (els.length < 2) return

  const { updateElement } = useElementsStore.getState()

  // Collect AABB extremes across the selection.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of els) {
    const hw = el.width / 2
    const hh = el.height / 2
    if (el.x - hw < minX) minX = el.x - hw
    if (el.x + hw > maxX) maxX = el.x + hw
    if (el.y - hh < minY) minY = el.y - hh
    if (el.y + hh > maxY) maxY = el.y + hh
  }

  for (const el of els) {
    const hw = el.width / 2
    const hh = el.height / 2
    let nx = el.x
    let ny = el.y
    switch (op) {
      case 'left':
        nx = minX + hw
        break
      case 'right':
        nx = maxX - hw
        break
      case 'h-center':
        nx = (minX + maxX) / 2
        break
      case 'top':
        ny = minY + hh
        break
      case 'bottom':
        ny = maxY - hh
        break
      case 'v-center':
        ny = (minY + maxY) / 2
        break
    }
    if (nx !== el.x || ny !== el.y) {
      updateElement(el.id, { x: nx, y: ny })
    }
  }
}

export function distributeElements(ids: string[], op: DistributeOp): void {
  const els = alignableElements(ids)
  // Need at least 3 elements for distribution to do anything meaningful —
  // first and last are anchors, only interior elements are re-spaced.
  if (els.length < 3) return

  const { updateElement } = useElementsStore.getState()
  const axis = op === 'horizontal' ? 'x' : 'y'
  // Sort by center coord along the distribution axis; anchor the endpoints
  // and evenly space the interior elements along the axis.
  const sorted = [...els].sort((a, b) => a[axis] - b[axis])
  const first = sorted[0][axis]
  const last = sorted[sorted.length - 1][axis]
  const step = (last - first) / (sorted.length - 1)

  for (let i = 1; i < sorted.length - 1; i++) {
    const el = sorted[i]
    const target = first + step * i
    if (target !== el[axis]) {
      updateElement(el.id, { [axis]: target } as Partial<CanvasElement>)
    }
  }
}
