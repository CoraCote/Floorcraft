/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoomBookingsPanel } from '../components/editor/RightSidebar/RoomBookingsPanel'
import { useRoomBookingsStore } from '../stores/roomBookingsStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'
import { todayIso } from '../lib/roomBookings'

const { focusElementsMock } = vi.hoisted(() => ({
  focusElementsMock: vi.fn((_ids: string[]) => true),
}))
vi.mock('../lib/focusElements', () => ({ focusElements: focusElementsMock }))

function room(id: string, name = 'Nebula Room'): any {
  return {
    id,
    type: 'conference-room',
    x: 0,
    y: 0,
    width: 80,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: '',
    visible: true,
    roomName: name,
    capacity: 6,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
  }
}

function booking(over: Partial<any> = {}): any {
  return {
    id: 'b-' + Math.random().toString(36).slice(2, 8),
    elementId: 'r1',
    floorId: 'f1',
    date: todayIso(),
    startMinutes: 9 * 60,
    endMinutes: 10 * 60,
    bookedBy: 'u-alice',
    bookedByName: 'Alice',
    note: 'Planning',
    createdAt: new Date().toISOString(),
    ...over,
  }
}

beforeEach(() => {
  focusElementsMock.mockClear()
  useRoomBookingsStore.setState({ bookings: [] })
  useElementsStore.setState({ elements: { r1: room('r1') } } as any)
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: { r1: room('r1') } }],
    activeFloorId: 'f1',
  } as any)
  useProjectStore.setState({
    currentOfficeRole: 'editor',
    currentUserId: 'u-alice',
    impersonatedRole: null,
  } as any)
})

describe('RoomBookingsPanel', () => {
  it('shows the empty state when there are no bookings today', () => {
    render(<RoomBookingsPanel />)
    expect(screen.getByText(/No room bookings today/i)).toBeTruthy()
  })

  it('rolls up today\'s bookings per room with time and attendee', () => {
    useRoomBookingsStore.setState({
      bookings: [
        booking({ startMinutes: 14 * 60, endMinutes: 15 * 60, note: '' }),
        booking({ startMinutes: 9 * 60, endMinutes: 10 * 60, bookedByName: 'Bob' }),
      ],
    })
    render(<RoomBookingsPanel />)
    expect(screen.getByText('Nebula Room')).toBeTruthy()
    // Start times render in the sorted half-open interval text.
    expect(screen.getByText(/09:00–10:00/)).toBeTruthy()
    expect(screen.getByText(/14:00–15:00/)).toBeTruthy()
  })

  it('focuses the room when the row is clicked', () => {
    useRoomBookingsStore.setState({
      bookings: [booking({ startMinutes: 9 * 60, endMinutes: 10 * 60 })],
    })
    render(<RoomBookingsPanel />)
    fireEvent.click(screen.getByText('Nebula Room'))
    expect(focusElementsMock).toHaveBeenCalledWith(['r1'])
  })

  it('lets an editor cancel their own booking', () => {
    useRoomBookingsStore.setState({
      bookings: [booking({ id: 'b1', startMinutes: 9 * 60, endMinutes: 10 * 60 })],
    })
    render(<RoomBookingsPanel />)
    const cancel = screen.getByLabelText(/Cancel booking 09:00/)
    fireEvent.click(cancel)
    expect(useRoomBookingsStore.getState().bookings).toHaveLength(0)
  })

  it('hides the cancel button for other users\' bookings when viewer lacks editMap', () => {
    // hr-editor has editRoster but NOT editMap — so they can only cancel
    // their own, not others'.
    useProjectStore.setState({ currentOfficeRole: 'hr-editor' } as any)
    useRoomBookingsStore.setState({
      bookings: [booking({ bookedBy: 'u-someone-else', bookedByName: 'Dana' })],
    })
    render(<RoomBookingsPanel />)
    expect(screen.queryByLabelText(/Cancel booking/)).toBeNull()
  })

  it('hides cancel entirely for viewers (no edit perms)', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)
    useRoomBookingsStore.setState({
      bookings: [booking({ bookedBy: 'u-alice' })],
    })
    render(<RoomBookingsPanel />)
    expect(screen.queryByLabelText(/Cancel booking/)).toBeNull()
  })
})
