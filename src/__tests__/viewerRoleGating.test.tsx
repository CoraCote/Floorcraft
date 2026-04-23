/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RosterPage } from '../components/editor/RosterPage'
import { useProjectStore } from '../stores/projectStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'

function renderRoster() {
  return render(
    <MemoryRouter initialEntries={['/t/acme/o/hq/roster']}>
      <Routes>
        <Route
          path="/t/:teamSlug/o/:officeSlug/roster"
          element={<RosterPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({
    employees: {
      e1: {
        id: 'e1',
        name: 'Jane',
        department: 'Eng',
        title: null,
        email: '',
        team: null,
        managerId: null,
        employmentType: 'full-time',
        officeDays: [],
        startDate: null,
        endDate: null,
        tags: [],
        equipmentNeeds: [],
        equipmentStatus: 'not-needed',
        photoUrl: null,
        seatId: null,
        floorId: null,
        status: 'active',
        createdAt: new Date().toISOString(),
      },
    },
    departmentColors: {},
  } as any)
})

describe('Roster viewer gating', () => {
  it('editor role shows Add button', () => {
    useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
    renderRoster()
    expect(screen.getByRole('button', { name: /Add person/i })).toBeInTheDocument()
  })

  it('viewer does not see Add button', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)
    renderRoster()
    expect(screen.queryByRole('button', { name: /Add person/i })).not.toBeInTheDocument()
  })

  it('viewer cannot activate inline-editable Name cell', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)
    renderRoster()
    // Name is shown as plain text (no button / no input) for viewers.
    // The employee name still appears on screen, but no editable widget
    // exists: no <input>, no clickable edit trigger whose accessible
    // name is the employee's name.
    expect(screen.getByText('Jane')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Jane')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Jane' })).not.toBeInTheDocument()
  })
})
