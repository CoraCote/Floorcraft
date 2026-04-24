/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { RosterPage } from '../components/editor/RosterPage'

/**
 * Lightweight URL probe — exposes the current search string so tests
 * can assert that quick-filter clicks updated the URL params (rather
 * than relying on internal state). Same trick the existing
 * `rosterFilterUrl.test.tsx` uses.
 */
function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location-search">{loc.search}</div>
}

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/t/:teamSlug/o/:officeSlug/roster"
          element={
            <>
              <RosterPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

const today = new Date()
const TWO_WEEKS_AGO = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10)
const SIX_MONTHS_AGO = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10)

beforeEach(() => {
  useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({
    employees: {
      // Active, no seat — counts as "Unassigned" preset
      e1: {
        id: 'e1', name: 'Alice', email: '', department: 'Engineering', team: null,
        title: 'IC5', managerId: null, employmentType: 'full-time', status: 'active',
        officeDays: [], startDate: SIX_MONTHS_AGO, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [], accommodations: [], sensitivityTags: [],
        seatId: null, floorId: null, leaveType: null, expectedReturnDate: null,
        coverageEmployeeId: null, leaveNotes: null, departureDate: null,
        pendingStatusChanges: [],
        createdAt: new Date().toISOString(),
      },
      // On leave — counts as "On leave"
      e2: {
        id: 'e2', name: 'Bob', email: '', department: 'Design', team: null,
        title: 'Manager', managerId: null, employmentType: 'full-time', status: 'on-leave',
        officeDays: [], startDate: SIX_MONTHS_AGO, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [], accommodations: [], sensitivityTags: [],
        seatId: null, floorId: null, leaveType: null, expectedReturnDate: null,
        coverageEmployeeId: null, leaveNotes: null, departureDate: null,
        pendingStatusChanges: [],
        createdAt: new Date().toISOString(),
      },
      // Recent join (within 30 days) AND missing equipment AND active+seated
      e3: {
        id: 'e3', name: 'Carol', email: '', department: 'Engineering', team: null,
        title: 'IC3', managerId: null, employmentType: 'full-time', status: 'active',
        officeDays: [], startDate: TWO_WEEKS_AGO, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'pending', photoUrl: null, tags: [], accommodations: [], sensitivityTags: [],
        seatId: 's1', floorId: 'f1', leaveType: null, expectedReturnDate: null,
        coverageEmployeeId: null, leaveNotes: null, departureDate: null,
        pendingStatusChanges: [],
        createdAt: new Date().toISOString(),
      },
    },
  })
})

describe('RosterPage — quick-filter pills', () => {
  it('renders the quick-filter pill cluster with role=group and counts', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    const group = screen.getByRole('group', { name: /quick filters/i })
    expect(group).toBeTruthy()
    // "All" doesn't show a count chip; the others do.
    const unassigned = within(group).getByTestId('quick-filter-unassigned')
    expect(unassigned.textContent).toMatch(/Unassigned/)
    expect(unassigned.textContent).toMatch(/\(1\)/) // Alice (active, no seat)
    const onLeave = within(group).getByTestId('quick-filter-on-leave')
    expect(onLeave.textContent).toMatch(/\(1\)/) // Bob
    const recent = within(group).getByTestId('quick-filter-recent-joins')
    expect(recent.textContent).toMatch(/\(1\)/) // Carol
    const missingEq = within(group).getByTestId('quick-filter-missing-equipment')
    expect(missingEq.textContent).toMatch(/\(1\)/) // Carol
  })

  it('clicking "Unassigned" pill writes status=active&seat=unassigned to the URL', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    const pill = screen.getByTestId('quick-filter-unassigned')
    act(() => { fireEvent.click(pill) })
    const search = screen.getByTestId('location-search').textContent ?? ''
    expect(search).toContain('status=active')
    expect(search).toContain('seat=unassigned')
    // After applying the pill, the table should narrow to Alice only —
    // Bob is on-leave, Carol is seated.
    expect(screen.queryByText('Bob')).toBeNull()
    expect(screen.queryByText('Carol')).toBeNull()
    expect(screen.getByText('Alice')).toBeTruthy()
    // The pill should now read as pressed.
    expect(pill.getAttribute('aria-pressed')).toBe('true')
  })

  it('summary chip shows total/shown/unassigned/occupancy counts', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    const chip = screen.getByTestId('roster-summary-chip')
    // 3 employees, all visible by default; 2 unassigned (Alice + Bob),
    // and 0 desks → 0% occupancy.
    expect(chip.textContent).toMatch(/Showing\s*3\s*of\s*3/)
    expect(chip.textContent).toMatch(/2\s*unassigned/)
    expect(chip.textContent).toMatch(/0%\s*occupancy/)
    // aria-live so screen readers announce changes.
    expect(chip.getAttribute('aria-live')).toBe('polite')
  })

  it('summary chip updates "shown" when a filter narrows the visible set', () => {
    renderAtRoute('/t/acme/o/hq/roster?status=on-leave')
    const chip = screen.getByTestId('roster-summary-chip')
    expect(chip.textContent).toMatch(/Showing\s*1\s*of\s*3/)
  })
})

describe('RosterPage — sticky bulk-action toolbar', () => {
  it('shows the toolbar with role=region and a clearable selection chip', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    // Select Alice's row.
    const aliceRow = screen.getByText('Alice').closest('tr') as HTMLElement
    const checkbox = within(aliceRow).getByLabelText('Select Alice')
    act(() => { fireEvent.click(checkbox) })
    const region = screen.getByRole('region', { name: /bulk actions/i })
    expect(region).toBeTruthy()
    const clearChip = within(region).getByTestId('roster-bulk-clear')
    // The chip exposes the count + an X icon. Clicking should clear
    // selection (and therefore unmount the region).
    expect(clearChip.textContent).toMatch(/1/)
    expect(clearChip.textContent).toMatch(/selected/i)
    act(() => { fireEvent.click(clearChip) })
    expect(screen.queryByRole('region', { name: /bulk actions/i })).toBeNull()
  })
})

describe('RosterPage — empty state copy', () => {
  it('shows "No employees match these filters" + Clear filters button on a filter miss', () => {
    renderAtRoute('/t/acme/o/hq/roster?q=zzznoonematches')
    expect(screen.getByText(/No employees match these filters/i)).toBeTruthy()
    const clearBtn = screen.getByRole('button', { name: /clear filters/i })
    act(() => { fireEvent.click(clearBtn) })
    // After clearing, all three rows reappear.
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Carol')).toBeTruthy()
  })

  it('shows the empty-roster copy with Add person + Import CSV when there are no employees', () => {
    useEmployeeStore.setState({ employees: {} })
    renderAtRoute('/t/acme/o/hq/roster')
    expect(screen.getByText(/Your office is empty/i)).toBeTruthy()
    expect(screen.getByTestId('roster-empty-add')).toBeTruthy()
    expect(screen.getByTestId('roster-empty-import')).toBeTruthy()
  })
})
