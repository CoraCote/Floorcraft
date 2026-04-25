import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ReportsPage } from '../components/reports/ReportsPage'
import { useProjectStore } from '../stores/projectStore'
import { useFloorStore } from '../stores/floorStore'
import { useEmployeeStore } from '../stores/employeeStore'

beforeEach(() => {
  useFloorStore.setState({ floors: [], activeFloorId: null } as never)
  useEmployeeStore.setState({ employees: {}, departmentColors: {} } as never)
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

describe('Reports permissions', () => {
  it('viewer sees "Not authorized"', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as never)
    mount()
    expect(screen.getByText(/not authorized/i)).toBeInTheDocument()
  })

  it('space-planner can view', () => {
    useProjectStore.setState({ currentOfficeRole: 'space-planner' } as never)
    // Seed a minimal non-empty project so ReportsPage renders the full
    // surface (tab bar) instead of the empty state.
    useFloorStore.setState({
      floors: [{ id: 'f1', name: 'HQ', order: 0, elements: {} }],
      activeFloorId: 'f1',
    } as never)
    useEmployeeStore.setState({
      employees: {
        e1: { id: 'e1', name: 'Alice', department: 'Eng', status: 'active', seatId: null, email: '', officeDays: [], equipmentNeeds: [], tags: [], employmentType: 'full-time' } as never,
      },
      departmentColors: {},
    } as never)
    mount()
    expect(screen.getByRole('tablist', { name: /reports sections/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /floor utilization/i })).toBeInTheDocument()
  })
})
