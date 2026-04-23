/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RosterPage } from '../components/editor/RosterPage'
import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({ employees: {}, departmentColors: {} } as any)
})

function mount() {
  return render(
    <MemoryRouter initialEntries={['/t/t/o/o/roster']}>
      <Routes>
        <Route path="/t/:teamSlug/o/:officeSlug/roster" element={<RosterPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('role-based permission gating', () => {
  it('space-planner cannot see "Add person" on roster', () => {
    useProjectStore.setState({ currentOfficeRole: 'space-planner' } as any)
    mount()
    expect(screen.queryByRole('button', { name: /add person/i })).toBeNull()
  })

  it('hr-editor sees "Add person" on roster', () => {
    useProjectStore.setState({ currentOfficeRole: 'hr-editor' } as any)
    mount()
    expect(screen.getByRole('button', { name: /add person/i })).toBeInTheDocument()
  })

  it('viewer cannot see roster mutation affordances', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)
    mount()
    expect(screen.queryByRole('button', { name: /add person/i })).toBeNull()
  })
})
