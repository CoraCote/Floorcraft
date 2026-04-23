import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RosterPage } from '../components/editor/RosterPage'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import type { Employee } from '../types/employee'

function emp(over: Partial<Employee> & { id: string; name: string }): Employee {
  return {
    id: over.id,
    name: over.name,
    department: over.department ?? null,
    title: over.title ?? null,
    email: over.email ?? null,
    team: over.team ?? null,
    managerId: over.managerId ?? null,
    employmentType: over.employmentType ?? null,
    officeDays: over.officeDays ?? [],
    startDate: over.startDate ?? null,
    endDate: over.endDate ?? null,
    tags: over.tags ?? [],
    equipmentNeeds: over.equipmentNeeds ?? null,
    equipmentStatus: over.equipmentStatus ?? null,
    photoUrl: over.photoUrl ?? null,
    seatId: over.seatId ?? null,
    floorId: over.floorId ?? null,
    status: over.status ?? 'active',
  } as unknown as Employee
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as never)
  useEmployeeStore.setState({
    employees: {
      e1: emp({ id: 'e1', name: 'Alice', department: 'Ops' }),
      e2: emp({ id: 'e2', name: 'Bob', department: 'Ops' }),
      e3: emp({ id: 'e3', name: 'Carol', department: 'Eng' }),
    },
    departmentColors: { Ops: '#000', Eng: '#fff' },
  } as never)
  useProjectStore.setState({ currentOfficeRole: 'editor' } as never)
})

function renderRoster() {
  return render(
    <MemoryRouter initialEntries={['/t/t1/o/o1/roster']}>
      <Routes>
        <Route path="/t/:teamSlug/o/:officeSlug/roster" element={<RosterPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Roster bulk edit mini-form', () => {
  it('applies department to every selected employee', () => {
    renderRoster()
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])
    fireEvent.click(checkboxes[2])
    fireEvent.click(screen.getByRole('button', { name: /^edit/i }))
    const deptInput = screen.getByLabelText('Department') as HTMLInputElement
    fireEvent.change(deptInput, { target: { value: 'Platform' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    const after = useEmployeeStore.getState().employees
    expect(after.e1.department).toBe('Platform')
    expect(after.e2.department).toBe('Platform')
    expect(after.e3.department).toBe('Eng')
  })

  it('applies title + status together', () => {
    renderRoster()
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])
    fireEvent.click(screen.getByRole('button', { name: /^edit/i }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'IC5' } })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'on-leave' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    const after = useEmployeeStore.getState().employees.e1
    expect(after.title).toBe('IC5')
    expect(after.status).toBe('on-leave')
  })

  it('does nothing when no field is filled in', () => {
    renderRoster()
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])
    fireEvent.click(screen.getByRole('button', { name: /^edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    const after = useEmployeeStore.getState().employees.e1
    expect(after.department).toBe('Ops')
    expect(after.title).toBeNull()
  })
})
