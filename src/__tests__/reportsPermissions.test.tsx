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
    mount()
    expect(screen.getByRole('heading', { name: /floor utilization/i })).toBeInTheDocument()
  })
})
