import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ReportsPage } from '../components/reports/ReportsPage'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'

beforeEach(() => {
  useProjectStore.setState({ currentOfficeRole: 'owner' } as never)
  useFloorStore.setState({
    floors: [
      {
        id: 'f1', name: 'HQ', order: 0,
        elements: {
          d1: { id: 'd1', type: 'desk', deskId: 'D-1', assignedEmployeeId: 'e1', capacity: 1 },
          d2: { id: 'd2', type: 'desk', deskId: 'D-2', assignedEmployeeId: null, capacity: 1 },
        },
      },
    ],
    activeFloorId: 'f1',
  } as never)
  useEmployeeStore.setState({
    employees: {
      e1: { id: 'e1', name: 'Alice', department: 'Eng', status: 'active', seatId: 'd1', email: '', officeDays: [], equipmentNeeds: [], tags: [], employmentType: 'full-time' } as never,
      e2: { id: 'e2', name: 'Bob', department: 'Eng', status: 'active', seatId: null, email: '', officeDays: [], equipmentNeeds: [], tags: [], employmentType: 'full-time' } as never,
    },
    departmentColors: {},
  } as never)
})

function mount() {
  return render(
    <MemoryRouter initialEntries={['/t/t/o/o/reports']}>
      <Routes>
        <Route path="/t/:teamSlug/o/:officeSlug/reports" element={<ReportsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ReportsPage', () => {
  it('renders utilization, headcount, and unassigned cards', () => {
    mount()
    expect(screen.getByRole('heading', { name: /floor utilization/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /department headcount/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /unassigned/i })).toBeInTheDocument()
    // HQ floor: 1 of 2 assigned = 50%
    expect(screen.getByText(/HQ/)).toBeInTheDocument()
    expect(screen.getAllByText(/50\.0%|50%/).length).toBeGreaterThan(0)
    // Eng dept: 2 employees, 1 assigned
    expect(screen.getAllByText('Eng').length).toBeGreaterThan(0)
    // Unassigned: Bob
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })
})
