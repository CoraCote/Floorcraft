import { useCanvasStore } from '../stores/canvasStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useUIStore } from '../stores/uiStore'
import { switchToFloor } from './seatAssignment'
import { getActiveStage } from './stageRegistry'
import { unionBounds } from './elementBounds'
import type { CanvasElement } from '../types/elements'

/**
 * Select the given element ids on the canvas and pan/zoom so all of them
 * fit in the viewport. If the elements live on a non-active floor, switch
 * to that floor first.
 *
 * This is the shared behaviour used by the insights panel when a card is
 * clicked and by its "Highlight" / "Navigate" actions. It gracefully does
 * nothing when:
 *  - `ids` is empty
 *  - none of the ids resolve to a known element (stale insight after undo)
 *  - the Konva stage isn't mounted (dialog open before canvas ever rendered)
 *
 * Returns whether the focus was applied, which lets callers (or tests)
 * tell "nothing to focus on" apart from "focused successfully".
 */
export function focusElements(ids: string[]): boolean {
  if (ids.length === 0) return false

  // 1. Resolve ids to their home floors. Elements can span floors in the
  //    insights view, so we pick whichever floor has the most of the
  //    requested ids — that's the most useful view for the user. Ties go
  //    to the active floor if it's in contention, otherwise to the first
  //    floor enumerated.
  const floorStore = useFloorStore.getState()
  const activeFloorId = floorStore.activeFloorId
  const activeElements = useElementsStore.getState().elements

  const counts = new Map<string, number>()
  const resolvedPerFloor = new Map<string, CanvasElement[]>()

  for (const floor of floorStore.floors) {
    const elements =
      floor.id === activeFloorId ? activeElements : floor.elements
    const found: CanvasElement[] = []
    for (const id of ids) {
      const el = elements[id]
      if (el) found.push(el)
    }
    if (found.length > 0) {
      counts.set(floor.id, found.length)
      resolvedPerFloor.set(floor.id, found)
    }
  }

  if (counts.size === 0) return false

  let bestFloorId: string | null = null
  let bestCount = -1
  for (const [floorId, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount && floorId === activeFloorId)
    ) {
      bestCount = count
      bestFloorId = floorId
    }
  }
  if (!bestFloorId) return false

  // 2. If the target floor isn't active, switch to it. `switchToFloor`
  //    snapshots the outgoing floor's live elements before loading the new
  //    one, so we don't lose in-flight edits.
  if (bestFloorId !== activeFloorId) {
    switchToFloor(bestFloorId)
  }

  // After a floor switch, the freshly-loaded elements are the new source
  // of truth — re-resolve so we pan to what actually rendered.
  const elementsAfter = useElementsStore.getState().elements
  const targets: CanvasElement[] = []
  for (const id of ids) {
    const el = elementsAfter[id]
    if (el) targets.push(el)
  }

  if (targets.length === 0) {
    // Swallow: floor switched but no elements actually exist there (stale
    // insight). Selection stays cleared.
    useUIStore.getState().clearSelection()
    return false
  }

  // 3. Select them so the user sees the canvas selection state line up
  //    with the insight they clicked.
  useUIStore.getState().setSelectedIds(targets.map((el) => el.id))

  // 4. Pan/zoom via zoomToFit. Needs the stage viewport dimensions — pull
  //    them from the registered Konva stage. If no stage is mounted
  //    (insights panel queried before the canvas has rendered), skip the
  //    pan but keep the selection so the user at least sees the count
  //    bump in the TopBar.
  const stage = getActiveStage()
  if (!stage) return true

  const bounds = unionBounds(targets, /* padding */ 80)
  if (!bounds || bounds.width === 0 || bounds.height === 0) return true

  const stageWidth = stage.width()
  const stageHeight = stage.height()
  if (stageWidth <= 0 || stageHeight <= 0) return true

  useCanvasStore.getState().zoomToFit(bounds, stageWidth, stageHeight)
  return true
}
