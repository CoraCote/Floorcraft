/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { RosterPage } from '../components/editor/RosterPage'

function renderAtRoute() {
  return render(
    <MemoryRouter initialEntries={['/t/acme/o/hq/roster']}>
      <Routes>
        <Route
          path="/t/:teamSlug/o/:officeSlug/roster"
          element={<RosterPage />}
        />
        <Route
          path="/t/:teamSlug/o/:officeSlug/map"
          element={<div>Map page</div>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({
    employees: {
      e1: {
        id: 'e1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        department: 'Engineering',
        team: null,
        title: 'IC5',
        managerId: null,
        employmentType: 'full-time',
        status: 'active',
        officeDays: ['Mon'],
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
        tags: ['vip'],
        seatId: null,
        floorId: null,
        createdAt: new Date().toISOString(),
        accommodations: [],
        sensitivityTags: [],
        pendingStatusChanges: [],
      },
    },
  })
})

describe('RosterPage (PII redaction)', () => {
  it('editor role renders full name and email, no banner', () => {
    useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
    renderAtRoute()
    expect(screen.getByText('Jane Doe')).toBeTruthy()
    expect(screen.queryByText('J.D.')).toBeNull()
    expect(screen.queryByTestId('pii-redaction-banner')).toBeNull()
  })

  it('viewer role renders initials, no raw email, and shows the banner', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)
    renderAtRoute()
    // Redacted name replaces the full name.
    expect(screen.getByText('J.D.')).toBeTruthy()
    expect(screen.queryByText('Jane Doe')).toBeNull()
    // Raw email should not appear anywhere on the page.
    expect(screen.queryByText('jane@example.com')).toBeNull()
    // The top-of-page notice is visible.
    expect(screen.getByTestId('pii-redaction-banner')).toBeTruthy()
  })

  it('space-planner role (lacks viewPII) also redacts and shows the banner', () => {
    useProjectStore.setState({ currentOfficeRole: 'space-planner' } as any)
    renderAtRoute()
    expect(screen.getByText('J.D.')).toBeTruthy()
    expect(screen.queryByText('Jane Doe')).toBeNull()
    expect(screen.getByTestId('pii-redaction-banner')).toBeTruthy()
  })

  it('hr-editor role sees full PII (has viewPII capability)', () => {
    useProjectStore.setState({ currentOfficeRole: 'hr-editor' } as any)
    renderAtRoute()
    expect(screen.getByText('Jane Doe')).toBeTruthy()
    expect(screen.queryByTestId('pii-redaction-banner')).toBeNull()
  })
})
