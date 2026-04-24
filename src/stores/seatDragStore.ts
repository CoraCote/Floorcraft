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
