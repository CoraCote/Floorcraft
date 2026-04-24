import { create } from 'zustand'

/**
 * Transient UI state that tracks an in-flight employee drag out of the
 * PeoplePanel. Set when `dragstart` fires on an employee chip, cleared on
 * `dragend` / `drop`. The canvas layer reads this to paint hover outlines
 * on every assignable desk (green = open, amber = occupied, brighter =
 * currently under cursor), and the renderer reads `hoveredSeatId` to
 * bump the outline contrast.
 *
 * Kept separate from `uiStore` because the lifecycle is strictly bounded
 * by a single drag gesture — putting it in the main store would mean more
 * subscribers re-rendering on every mousemove event during the drag.
 */
interface SeatDragState {
  /** The employee id being dragged, or null when idle. */
  draggingEmployeeId: string | null
  /** The seat (desk / workstation / private-office) currently under the
   *  cursor mid-drag, so the renderer can paint a brighter outline. */
  hoveredSeatId: string | null
  setDraggingEmployee: (employeeId: string | null) => void
  setHoveredSeat: (elementId: string | null) => void
  reset: () => void
}

export const useSeatDragStore = create<SeatDragState>((set) => ({
  draggingEmployeeId: null,
  hoveredSeatId: null,
  setDraggingEmployee: (employeeId) =>
    set({ draggingEmployeeId: employeeId, hoveredSeatId: null }),
  setHoveredSeat: (elementId) => set({ hoveredSeatId: elementId }),
  reset: () => set({ draggingEmployeeId: null, hoveredSeatId: null }),
}))

/**
 * Active "seat detail popover" — opened by clicking an assigned desk on
 * the canvas. Stored in a tiny module store so CanvasStage can set it
 * from its click handler while the popover itself lives as a sibling
 * DOM overlay (same shape as AnnotationPopover). Closed on ESC,
 * background click, or any selection change.
 */
interface SeatDetailState {
  activeElementId: string | null
  /** Stage-space (pre-transform) coords used to position the popover.
   *  Populated from the click event so the popover anchors near the desk
   *  the user clicked, not the current stage center. */
  screenX: number
  screenY: number
  open: (elementId: string, screenX: number, screenY: number) => void
  close: () => void
}

export const useSeatDetailStore = create<SeatDetailState>((set) => ({
  activeElementId: null,
  screenX: 0,
  screenY: 0,
  open: (elementId, screenX, screenY) =>
    set({ activeElementId: elementId, screenX, screenY }),
  close: () => set({ activeElementId: null }),
}))
