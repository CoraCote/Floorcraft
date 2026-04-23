import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUndoDataLossToast } from '../hooks/useUndoDataLossToast'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useToastStore } from '../stores/toastStore'
import type { DeskElement } from '../types/elements'
import type { Employee } from '../types/employee'

function makeDesk(id: string, assignedEmployeeId: string | null = null): DeskElement {
  return {
    id,
    type: 'desk',
    x: 0,
    y: 0,
    width: 60,
    height: 60,
    rotation: 0,
    label: '',
    locked: false,
    groupId: null,
    zIndex: 0,
    visible: true,
    style: { fill: '#fff', stroke: '#000' },
    deskId: 'D-' + id,
    capacity: 1,
    assignedEmployeeId,
  } as unknown as DeskElement
}

function makeEmployee(id: string, seatId: string | null): Employee {
  return {
    id,
    name: id,
    department: 'Eng',
    title: null,
    email: null,
    team: null,
    managerId: null,
    employmentType: null,
    officeDays: [],
    startDate: null,
    endDate: null,
    tags: [],
    equipmentNeeds: null,
    equipmentStatus: null,
    photoUrl: null,
    zone: null,
    seatId,
    floorId: seatId ? 'f1' : null,
    status: 'active',
  } as unknown as Employee
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useEmployeeStore.setState({ employees: {}, departmentColors: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  })
  useToastStore.setState({ items: [] })
})

describe('useUndoDataLossToast', () => {
  it('does not toast on mount when there is no desync', () => {
    useElementsStore.setState({
      elements: { d1: makeDesk('d1', 'e1') },
    })
    useEmployeeStore.setState({
      employees: { e1: makeEmployee('e1', 'd1') },
    })
    renderHook(() => useUndoDataLossToast())
    expect(useToastStore.getState().items).toHaveLength(0)
  })

  it('toasts when an element loses its assignment but the employee still claims the seat', () => {
    useElementsStore.setState({
      elements: { d1: makeDesk('d1', 'e1') },
    })
    useEmployeeStore.setState({
      employees: { e1: makeEmployee('e1', 'd1') },
    })
    renderHook(() => useUndoDataLossToast())
    // Simulate an undo that strips the assignment on the element side.
    act(() => {
      useElementsStore.setState({ elements: { d1: makeDesk('d1', null) } })
    })
    const toasts = useToastStore.getState().items
    expect(toasts).toHaveLength(1)
    expect(toasts[0].title).toMatch(/unassigned 1 employee/i)
    expect(toasts[0].action?.label).toBe('Restore')
  })

  it('does not toast on a normal unassign (both sides clear together)', () => {
    useElementsStore.setState({
      elements: { d1: makeDesk('d1', 'e1') },
    })
    useEmployeeStore.setState({
      employees: { e1: makeEmployee('e1', 'd1') },
    })
    renderHook(() => useUndoDataLossToast())
    // Simulate seatAssignment.unassign: both stores clear atomically.
    act(() => {
      useEmployeeStore.setState({ employees: { e1: makeEmployee('e1', null) } })
      useElementsStore.setState({ elements: { d1: makeDesk('d1', null) } })
    })
    expect(useToastStore.getState().items).toHaveLength(0)
  })

  it('restore action re-binds orphaned employees', () => {
    useElementsStore.setState({
      elements: { d1: makeDesk('d1', 'e1') },
    })
    useEmployeeStore.setState({
      employees: { e1: makeEmployee('e1', 'd1') },
    })
    useFloorStore.setState({
      floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: { d1: makeDesk('d1', 'e1') } }],
      activeFloorId: 'f1',
    })
    renderHook(() => useUndoDataLossToast())
    act(() => {
      useElementsStore.setState({ elements: { d1: makeDesk('d1', null) } })
    })
    const toast = useToastStore.getState().items[0]
    act(() => {
      toast.action!.onClick()
    })
    const desk = useElementsStore.getState().elements.d1 as DeskElement
    expect(desk.assignedEmployeeId).toBe('e1')
  })
})
