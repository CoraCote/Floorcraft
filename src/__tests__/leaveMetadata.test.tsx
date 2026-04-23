import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RosterDetailDrawer } from '../components/editor/RosterDetailDrawer'
import { useEmployeeStore } from '../stores/employeeStore'
import { useProjectStore } from '../stores/projectStore'
import type { Employee } from '../types/employee'

function emp(over: Partial<Employee> & { id: string; name: string }): Employee {
  return {
    id: over.id,
    name: over.name,
    email: over.email ?? '',
    department: over.department ?? null,
    team: over.team ?? null,
    title: over.title ?? null,
    managerId: over.managerId ?? null,
    employmentType: over.employmentType ?? 'full-time',
    status: over.status ?? 'active',
    officeDays: over.officeDays ?? [],
    startDate: over.startDate ?? null,
    endDate: over.endDate ?? null,
    equipmentNeeds: over.equipmentNeeds ?? [],
    equipmentStatus: over.equipmentStatus ?? 'not-needed',
    photoUrl: over.photoUrl ?? null,
    tags: over.tags ?? [],
    seatId: over.seatId ?? null,
    floorId: over.floorId ?? null,
    createdAt: over.createdAt ?? new Date().toISOString(),
    leaveType: over.leaveType ?? null,
    expectedReturnDate: over.expectedReturnDate ?? null,
    coverageEmployeeId: over.coverageEmployeeId ?? null,
    leaveNotes: over.leaveNotes ?? null,
    departureDate: over.departureDate ?? null,
  } as Employee
}

beforeEach(() => {
  useEmployeeStore.setState({
    employees: {
      e1: emp({ id: 'e1', name: 'Alice', status: 'on-leave' }),
      e2: emp({ id: 'e2', name: 'Bob', status: 'active' }),
    },
    departmentColors: {},
  } as never)
  useProjectStore.setState({ currentOfficeRole: 'editor' } as never)
})

describe('RosterDetailDrawer — leave metadata', () => {
  it('shows leave details when status is on-leave', () => {
    render(<RosterDetailDrawer employeeId="e1" onClose={() => {}} />)
    expect(screen.getByLabelText(/leave type/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/expected return/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/coverage/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/leave notes/i)).toBeInTheDocument()
  })

  it('hides leave details when status is active', () => {
    render(<RosterDetailDrawer employeeId="e2" onClose={() => {}} />)
    expect(screen.queryByLabelText(/leave type/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/expected return/i)).not.toBeInTheDocument()
  })

  it('persists leaveType and expectedReturnDate on change', () => {
    render(<RosterDetailDrawer employeeId="e1" onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/leave type/i), { target: { value: 'parental' } })
    fireEvent.change(screen.getByLabelText(/expected return/i), { target: { value: '2026-09-01' } })
    const e1 = useEmployeeStore.getState().employees.e1
    expect(e1.leaveType).toBe('parental')
    expect(e1.expectedReturnDate).toBe('2026-09-01')
  })

  it('persists leaveNotes on blur', () => {
    render(<RosterDetailDrawer employeeId="e1" onClose={() => {}} />)
    const notes = screen.getByLabelText(/leave notes/i) as HTMLTextAreaElement
    fireEvent.change(notes, { target: { value: 'Back-up: Carol' } })
    fireEvent.blur(notes)
    expect(useEmployeeStore.getState().employees.e1.leaveNotes).toBe('Back-up: Carol')
  })
})
