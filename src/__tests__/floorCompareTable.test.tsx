import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FloorCompareTable } from '../components/editor/reports/FloorCompareTable'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useSeatHistoryStore } from '../stores/seatHistoryStore'

// Mock `switchToFloor` so we can assert it was called without triggering the
// full store-mutation side-effects (which would invalidate the test's own
// floor fixture).
const switchToFloorMock = vi.fn()
vi.mock('../lib/seatAssignment', () => ({
  switchToFloor: (id: string) => switchToFloorMock(id),
}))

function seedStores() {
  useFloorStore.setState({
    floors: [
      {
        id: 'f1',
        name: '1F',
        order: 0,
        elements: {
          d1: {
            id: 'd1',
            type: 'desk',
            x: 0, y: 0, width: 60, height: 60, rotation: 0,
            locked: false, groupId: null, zIndex: 0, visible: true, label: '',
            style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
            deskId: 'D-1', assignedEmployeeId: 'e1', capacity: 1,
          },
          d2: {
            id: 'd2',
            type: 'desk',
            x: 0, y: 0, width: 60, height: 60, rotation: 0,
            locked: false, groupId: null, zIndex: 0, visible: true, label: '',
            style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
            deskId: 'D-2', assignedEmployeeId: null, capacity: 1,
          },
        },
      },
      {
        id: 'f2',
        name: '2F',
        order: 1,
        elements: {
          d3: {
            id: 'd3',
            type: 'desk',
            x: 0, y: 0, width: 60, height: 60, rotation: 0,
            locked: false, groupId: null, zIndex: 0, visible: true, label: '',
            style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
            deskId: 'D-3', assignedEmployeeId: 'e2', capacity: 1,
          },
        },
      },
    ],
    activeFloorId: 'f1',
  } as never)
  // The live `elementsStore` mirrors the active floor's elements.
  useElementsStore.setState({
    elements: useFloorStore.getState().floors[0].elements,
  } as never)
  useEmployeeStore.setState({
    employees: {
      e1: {
        id: 'e1', name: 'Alice', email: '', department: null, team: null, title: null,
        managerId: null, employmentType: 'full-time', status: 'active',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null,
        tags: [], seatId: 'd1', floorId: 'f1',
        createdAt: new Date().toISOString(),
        leaveType: null, expectedReturnDate: null, coverageEmployeeId: null,
        leaveNotes: null, departureDate: null,
        accommodations: [], pendingStatusChanges: [],
      },
      e2: {
        id: 'e2', name: 'Bob', email: '', department: null, team: null, title: null,
        managerId: null, employmentType: 'full-time', status: 'active',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null,
        tags: [], seatId: 'd3', floorId: 'f2',
        createdAt: new Date().toISOString(),
        leaveType: null, expectedReturnDate: null, coverageEmployeeId: null,
        leaveNotes: null, departureDate: null,
        accommodations: [], pendingStatusChanges: [],
      },
    },
  } as never)
  useSeatHistoryStore.setState({ entries: {} })
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/t/t/o/o/reports/floor-compare']}>
      <Routes>
        <Route
          path="/t/:teamSlug/o/:officeSlug/reports/floor-compare"
          element={<FloorCompareTable />}
        />
        <Route path="/t/:teamSlug/o/:officeSlug/map" element={<div>map-view</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  switchToFloorMock.mockReset()
  seedStores()
})

describe('FloorCompareTable', () => {
  it('renders one row per floor, in order', () => {
    mount()
    const rows = screen.getAllByTestId(/^floor-row-/)
    expect(rows).toHaveLength(2)
    // Order must follow `floor.order`, not insertion order.
    expect(rows[0].getAttribute('data-floor-id')).toBe('f1')
    expect(rows[1].getAttribute('data-floor-id')).toBe('f2')
  })

  it('renders per-floor totals + occupancy', () => {
    mount()
    const row1 = screen.getByTestId('floor-row-f1')
    expect(row1).toHaveTextContent('1F')
    // Floor 1: 2 seats, 1 assigned → 50%
    expect(row1).toHaveTextContent('50%')
    const row2 = screen.getByTestId('floor-row-f2')
    // Floor 2: 1 seat, 1 assigned → 100%
    expect(row2).toHaveTextContent('100%')
  })

  it('calls switchToFloor when a row is clicked', () => {
    mount()
    fireEvent.click(screen.getByTestId('floor-row-f2'))
    expect(switchToFloorMock).toHaveBeenCalledWith('f2')
  })
})
