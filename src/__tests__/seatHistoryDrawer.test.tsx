/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SeatHistoryDrawer } from '../components/editor/SeatHistoryDrawer'
import { useSeatHistoryStore } from '../stores/seatHistoryStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'
import type { DeskElement } from '../types/elements'

function desk(id: string, deskId = `D-${id}`): DeskElement {
  return {
    id, type: 'desk',
    x: 0, y: 0, width: 72, height: 48, rotation: 0,
    locked: false, groupId: null, zIndex: 1, label: '', visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId,
    assignedEmployeeId: null,
    capacity: 1,
  }
}

function makeEmp(id: string, name: string) {
  return {
    id, name, email: '', department: null, team: null, title: null,
    managerId: null, employmentType: 'full-time', status: 'active',
    officeDays: [], startDate: null, endDate: null,
    leaveType: null, expectedReturnDate: null, coverageEmployeeId: null,
    leaveNotes: null, departureDate: null,
    equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null,
    tags: [], seatId: null, floorId: null, createdAt: new Date().toISOString(),
  } as any
}

beforeEach(() => {
  useSeatHistoryStore.getState().clear()
  useElementsStore.setState({ elements: {} })
  useEmployeeStore.setState({ employees: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  })
  useProjectStore.setState({ currentOfficeRole: 'owner' })
})

describe('SeatHistoryDrawer', () => {
  it('renders an empty state when there are no entries for the seat', () => {
    useElementsStore.setState({ elements: { d1: desk('d1', 'D-42') } })
    render(
      <SeatHistoryDrawer
        target={{ kind: 'seat', seatId: 'd1' }}
        onClose={() => {}}
      />,
    )
    expect(screen.getByTestId('seat-history-empty')).toBeInTheDocument()
    expect(screen.getByText(/No history recorded yet/i)).toBeInTheDocument()
  })

  it('renders each entry and sorts most-recent-first', () => {
    useElementsStore.setState({ elements: { d1: desk('d1', 'D-42') } })
    useEmployeeStore.setState({
      employees: {
        alice: makeEmp('alice', 'Alice'),
        bob: makeEmp('bob', 'Bob'),
      },
    })
    const s = useSeatHistoryStore.getState()
    s.recordAssignment({
      seatId: 'd1', elementId: 'd1', employeeId: 'alice', previousEmployeeId: null,
      action: 'assign', timestamp: '2024-01-01T10:00:00Z', actorUserId: 'u1', note: null,
    })
    s.recordAssignment({
      seatId: 'd1', elementId: 'd1', employeeId: 'bob', previousEmployeeId: 'alice',
      action: 'reassign', timestamp: '2024-02-01T10:00:00Z', actorUserId: 'u1', note: null,
    })

    render(
      <SeatHistoryDrawer
        target={{ kind: 'seat', seatId: 'd1' }}
        onClose={() => {}}
      />,
    )
    const rows = screen.getAllByTestId('seat-history-row')
    expect(rows).toHaveLength(2)
    // First row is the most recent — the reassign showing Alice → Bob.
    expect(rows[0].textContent).toContain('Alice')
    expect(rows[0].textContent).toContain('Bob')
    expect(rows[0].textContent?.toLowerCase()).toContain('reassign')
  })

  it('respects viewSeatHistory permission — viewers see nothing', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' })
    useSeatHistoryStore.getState().recordAssignment({
      seatId: 'd1', elementId: 'd1', employeeId: 'alice', previousEmployeeId: null,
      action: 'assign', timestamp: '2024-01-01T00:00:00Z', actorUserId: null, note: null,
    })
    const { container } = render(
      <SeatHistoryDrawer
        target={{ kind: 'seat', seatId: 'd1' }}
        onClose={() => {}}
      />,
    )
    // `useCan` returns false, drawer short-circuits to null.
    expect(container.firstChild).toBeNull()
  })

  it('renders the employee-centric variant with seat-labeled rows', () => {
    useElementsStore.setState({
      elements: { d14: desk('d14', 'D-14'), d42: desk('d42', 'D-42') },
    })
    useEmployeeStore.setState({
      employees: { alice: makeEmp('alice', 'Alice') },
    })
    const s = useSeatHistoryStore.getState()
    s.recordAssignment({
      seatId: 'd14', elementId: 'd14', employeeId: 'alice', previousEmployeeId: null,
      action: 'assign', timestamp: '2024-01-01T00:00:00Z', actorUserId: null, note: null,
    })
    s.recordAssignment({
      seatId: 'd42', elementId: 'd42', employeeId: 'alice', previousEmployeeId: null,
      action: 'reassign', timestamp: '2024-02-01T00:00:00Z', actorUserId: null, note: null,
    })

    render(
      <SeatHistoryDrawer
        target={{ kind: 'employee', employeeId: 'alice' }}
        onClose={() => {}}
      />,
    )
    const rows = screen.getAllByTestId('seat-history-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('D-42')
    expect(rows[1].textContent).toContain('D-14')
  })
})
