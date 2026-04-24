import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ShareView } from '../components/editor/ShareView'
import { useShareLinksStore } from '../stores/shareLinksStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import type { Employee } from '../types/employee'

function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/share/:officeSlug" element={<ShareView />} />
      </Routes>
    </MemoryRouter>,
  )
}

/**
 * Per project convention, employee fixtures must include every
 * array-shaped lifecycle field (accommodations, pendingStatusChanges,
 * sensitivityTags, equipmentNeeds) so migrations can't accidentally
 * drop data they expected to coerce.
 */
function employeeFixture(overrides: Partial<Employee>): Employee {
  return {
    id: 'e1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    department: 'Engineering',
    team: null,
    title: 'Engineer',
    managerId: null,
    employmentType: 'full-time',
    status: 'active',
    officeDays: [],
    startDate: null,
    endDate: null,
    leaveType: null,
    expectedReturnDate: null,
    coverageEmployeeId: null,
    leaveNotes: null,
    departureDate: null,
    equipmentNeeds: [],
    equipmentStatus: 'not-needed',
    photoUrl: null,
    tags: [],
    accommodations: [],
    sensitivityTags: [],
    seatId: 'seat-1',
    floorId: 'f1',
    pendingStatusChanges: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  useShareLinksStore.setState({ links: {} })
  useEmployeeStore.setState({
    employees: { e1: employeeFixture({}) },
    departmentColors: {},
  })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as never)
  useElementsStore.setState({ elements: {} })
  useProjectStore.setState({ currentOfficeRole: null, impersonatedRole: null })
})

describe('ShareView', () => {
  it('renders "Link expired or invalid" when the token is missing', () => {
    mount('/share/hq')
    expect(screen.getByText(/link expired or invalid/i)).toBeInTheDocument()
  })

  it('renders "Link expired or invalid" when the token is unknown', () => {
    mount('/share/hq?t=not-in-store')
    expect(screen.getByText(/link expired or invalid/i)).toBeInTheDocument()
  })

  it('renders the read-only map + redacted roster for a valid token', () => {
    const { link } = useShareLinksStore
      .getState()
      .create('office-1', 3600, 'pilot')
    mount(`/share/hq?t=${link.token}`)
    expect(screen.getByRole('heading', { name: /shared read-only map/i })).toBeInTheDocument()
    // PII redaction: the full name must not appear — only the initials
    // projection from `redactEmployeeMap`.
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument()
    expect(screen.getByText('A.L.')).toBeInTheDocument()
    // Non-PII department/title still render.
    expect(screen.getByText('Engineering')).toBeInTheDocument()
    expect(screen.getByText('Engineer')).toBeInTheDocument()
  })

  it('installs the shareViewer role on a valid token', () => {
    const { link } = useShareLinksStore
      .getState()
      .create('office-1', 3600)
    mount(`/share/hq?t=${link.token}`)
    expect(useProjectStore.getState().currentOfficeRole).toBe('shareViewer')
  })
})
