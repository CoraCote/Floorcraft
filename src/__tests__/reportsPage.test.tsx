import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ReportsPage } from '../components/reports/ReportsPage'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'
import { useElementsStore } from '../stores/elementsStore'

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
  useElementsStore.setState({
    elements: {
      d1: { id: 'd1', type: 'desk', deskId: 'D-1', assignedEmployeeId: 'e1', capacity: 1 },
      d2: { id: 'd2', type: 'desk', deskId: 'D-2', assignedEmployeeId: null, capacity: 1 },
    },
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
  it('renders the stat strip with computed totals', () => {
    mount()
    // The stat strip should render at the top of the page.
    const summary = screen.getByLabelText(/reports summary/i)
    expect(summary).toBeInTheDocument()
    // 2 total employees.
    expect(summary).toHaveTextContent('Employees')
    expect(summary).toHaveTextContent('2')
    // 2 seats total (two desks), 1 unassigned employee.
    expect(summary).toHaveTextContent('Seats')
    expect(summary).toHaveTextContent('Unassigned')
    expect(summary).toHaveTextContent('Occupancy')
    // 1 floor.
    expect(summary).toHaveTextContent('Floors')
    expect(summary).toHaveTextContent('Departments')
  })

  it('renders the sticky tab bar with every section', () => {
    mount()
    const tablist = screen.getByRole('tablist', { name: /reports sections/i })
    expect(tablist).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /occupancy/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /floor utilization/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /departments/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /unassigned/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /churn heatmap/i })).toBeInTheDocument()
  })

  it('defaults to Occupancy tab and shows the dashboard', () => {
    mount()
    const occTab = screen.getByRole('tab', { name: /^occupancy$/i })
    expect(occTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: /occupancy dashboard/i })).toBeInTheDocument()
  })

  it('switches to Floor utilization when the tab is clicked', () => {
    mount()
    fireEvent.click(screen.getByRole('tab', { name: /floor utilization/i }))
    expect(screen.getByRole('heading', { name: /floor utilization/i })).toBeInTheDocument()
    expect(screen.getByText(/HQ/)).toBeInTheDocument()
  })

  it('shows Unassigned table when the tab is active', () => {
    mount()
    fireEvent.click(screen.getByRole('tab', { name: /^unassigned$/i }))
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('moves focus between tabs with ArrowRight / ArrowLeft', () => {
    mount()
    const occ = screen.getByRole('tab', { name: /^occupancy$/i })
    const util = screen.getByRole('tab', { name: /floor utilization/i })
    const dept = screen.getByRole('tab', { name: /^departments$/i })
    occ.focus()
    fireEvent.keyDown(occ, { key: 'ArrowRight' })
    expect(util).toHaveAttribute('aria-selected', 'true')
    expect(util).toHaveFocus()
    fireEvent.keyDown(util, { key: 'ArrowRight' })
    expect(dept).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(dept, { key: 'ArrowLeft' })
    expect(util).toHaveAttribute('aria-selected', 'true')
  })

  it('renders a friendly empty state when the project has no employees or floors', () => {
    useEmployeeStore.setState({ employees: {}, departmentColors: {} } as never)
    useFloorStore.setState({ floors: [], activeFloorId: null } as never)
    useElementsStore.setState({ elements: {} } as never)
    mount()
    expect(screen.getByText(/nothing to report yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to roster/i })).toBeInTheDocument()
  })
})
