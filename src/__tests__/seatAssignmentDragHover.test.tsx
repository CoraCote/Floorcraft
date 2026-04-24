import { describe, it, expect, beforeEach } from 'vitest'
import { act } from '@testing-library/react'
import { useSeatDragStore } from '../stores/seatDragStore'

/**
 * Hover state contract — the in-flight drag-hover outline is driven by
 * `useSeatDragStore`. We cover the store contract rather than the Konva
 * renderer (HoverOutline / DeskRenderer) because Konva paints happen on
 * a canvas context that jsdom can't snapshot without a heavier Stage
 * mock — the store-level invariants the renderer reads are the
 * load-bearing part. This mirrors `hoverOutline.test.tsx`'s approach.
 */
beforeEach(() => {
  useSeatDragStore.getState().reset()
})

describe('seat drag hover — store contract', () => {
  it('starts idle with no dragging employee or hovered seat', () => {
    const s = useSeatDragStore.getState()
    expect(s.draggingEmployeeId).toBeNull()
    expect(s.hoveredSeatId).toBeNull()
  })

  it('setDraggingEmployee publishes the dragged id and clears any stale hover', () => {
    act(() => {
      useSeatDragStore.getState().setHoveredSeat('stale-seat')
      useSeatDragStore.getState().setDraggingEmployee('emp-1')
    })
    const s = useSeatDragStore.getState()
    expect(s.draggingEmployeeId).toBe('emp-1')
    // Starting a new drag implicitly resets the hover — otherwise a leftover
    // id would paint the wrong outline at the start of the new gesture.
    expect(s.hoveredSeatId).toBeNull()
  })

  it('setHoveredSeat during a drag paints the target id', () => {
    act(() => {
      useSeatDragStore.getState().setDraggingEmployee('emp-1')
      useSeatDragStore.getState().setHoveredSeat('desk-A')
    })
    expect(useSeatDragStore.getState().hoveredSeatId).toBe('desk-A')

    act(() => {
      useSeatDragStore.getState().setHoveredSeat('desk-B')
    })
    expect(useSeatDragStore.getState().hoveredSeatId).toBe('desk-B')
  })

  it('reset() clears both the dragged id and the hovered seat', () => {
    act(() => {
      useSeatDragStore.getState().setDraggingEmployee('emp-1')
      useSeatDragStore.getState().setHoveredSeat('desk-A')
      useSeatDragStore.getState().reset()
    })
    const s = useSeatDragStore.getState()
    expect(s.draggingEmployeeId).toBeNull()
    expect(s.hoveredSeatId).toBeNull()
  })
})

describe('seat drag hover — derived outline class', () => {
  // Mirror the renderer's conditional in a local helper so we can test
  // the intent directly. This matches what DeskRenderer paints.
  function deskOutlineClass(
    elementId: string,
    isOccupied: boolean,
  ): 'none' | 'open' | 'busy' | 'hover' {
    const { draggingEmployeeId, hoveredSeatId } = useSeatDragStore.getState()
    if (!draggingEmployeeId) return 'none'
    if (hoveredSeatId === elementId) return 'hover'
    return isOccupied ? 'busy' : 'open'
  }

  it('paints no outline when no drag is in flight', () => {
    expect(deskOutlineClass('d1', false)).toBe('none')
    expect(deskOutlineClass('d1', true)).toBe('none')
  })

  it('paints green on open desks during a drag', () => {
    act(() => {
      useSeatDragStore.getState().setDraggingEmployee('emp-1')
    })
    expect(deskOutlineClass('d1', false)).toBe('open')
  })

  it('paints amber on occupied desks during a drag (will reassign)', () => {
    act(() => {
      useSeatDragStore.getState().setDraggingEmployee('emp-1')
    })
    expect(deskOutlineClass('d1', true)).toBe('busy')
  })

  it('paints the hover class on the desk currently under the cursor', () => {
    act(() => {
      useSeatDragStore.getState().setDraggingEmployee('emp-1')
      useSeatDragStore.getState().setHoveredSeat('d2')
    })
    expect(deskOutlineClass('d1', false)).toBe('open')
    expect(deskOutlineClass('d2', false)).toBe('hover')
    expect(deskOutlineClass('d2', true)).toBe('hover')
  })
})
