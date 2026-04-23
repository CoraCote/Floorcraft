/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { RosterPage } from '../components/editor/RosterPage'

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
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
  useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({
    employees: {
      e1: {
        id: 'e1', name: 'Alice', email: '', department: 'Engineering', team: null,
        title: 'IC5', managerId: null, employmentType: 'full-time', status: 'active',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [],
        seatId: null, floorId: null, leaveType: null, expectedReturnDate: null,
        coverageEmployeeId: null, leaveNotes: null, departureDate: null,
        createdAt: new Date().toISOString(),
      },
      e2: {
        id: 'e2', name: 'Bob', email: '', department: 'Design', team: null,
        title: 'Manager', managerId: null, employmentType: 'full-time', status: 'on-leave',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [],
        seatId: null, floorId: null, leaveType: null, expectedReturnDate: null,
        coverageEmployeeId: null, leaveNotes: null, departureDate: null,
        createdAt: new Date().toISOString(),
      },
    },
  })
})

describe('RosterPage', () => {
  it('renders a row per employee from the store', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    // Both departments appear as inline cells.
    expect(screen.getByText('Engineering')).toBeTruthy()
    expect(screen.getByText('Design')).toBeTruthy()
  })

  it('commits an inline title edit to the store on blur', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    // Click the title cell for Alice (initial value "IC5") to enter edit mode.
    const titleCell = screen.getByText('IC5')
    act(() => { fireEvent.click(titleCell) })
    const input = screen.getByDisplayValue('IC5') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'Staff Eng' } })
      fireEvent.blur(input)
    })
    expect(useEmployeeStore.getState().employees.e1.title).toBe('Staff Eng')
  })

  it('changes status through the inline select', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    // Find all status selects; Alice is first in alphabetic order so her
    // select is at index 0 (header has no select).
    const selects = screen
      .getAllByRole('combobox')
      .filter((el) => (el as HTMLSelectElement).value === 'active' || (el as HTMLSelectElement).value === 'on-leave')
    // The status column should include at least one select with 'active'.
    const aliceStatus = selects.find(
      (el) => (el as HTMLSelectElement).value === 'active',
    ) as HTMLSelectElement
    act(() => {
      fireEvent.change(aliceStatus, { target: { value: 'departed' } })
    })
    expect(useEmployeeStore.getState().employees.e1.status).toBe('departed')
  })

  it('filters by department via the URL-synced dropdown', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    // Seed departmentColors so the dept dropdown lists both.
    act(() => {
      useEmployeeStore.setState((s) => ({
        departmentColors: { ...s.departmentColors, Engineering: '#000', Design: '#111' },
      }))
    })
    const deptSelect = screen.getByLabelText('Filter by department') as HTMLSelectElement
    act(() => {
      fireEvent.change(deptSelect, { target: { value: 'Engineering' } })
    })
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('Bob')).toBeNull()
  })

  it('renders status counts in the stats bar', () => {
    // Alice is active, Bob is on-leave (set in beforeEach). Both are
    // seat-unassigned, so the "Unassigned" chip should count 2.
    renderAtRoute('/t/acme/o/hq/roster')
    // `On leave` chip shows the number 1 alongside its label.
    const onLeaveChip = screen.getByRole('button', { name: /1\s+On leave/i })
    expect(onLeaveChip).toBeTruthy()
    // Unassigned chip counts both seed employees.
    const unassignedChip = screen.getByRole('button', { name: /2\s+Unassigned/i })
    expect(unassignedChip).toBeTruthy()
  })

  it('clicking the On-leave stats chip narrows to status=on-leave', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    const onLeaveChip = screen.getByRole('button', { name: /1\s+On leave/i })
    act(() => { fireEvent.click(onLeaveChip) })
    // After the click the status chip should be toggled on and Alice
    // should disappear from the list.
    expect(screen.queryByText('Alice')).toBeNull()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('shows Clear filters button once a filter is active and resets on click', () => {
    renderAtRoute('/t/acme/o/hq/roster?status=active')
    // Alice is active, Bob is on-leave → only Alice is visible.
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('Bob')).toBeNull()
    const clear = screen.getByTitle('Clear all filters')
    act(() => { fireEvent.click(clear) })
    // Both rows should be back.
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('double-clicking a row opens the detail drawer', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    // Double-click on Alice's row. Target a plain cell (the <tr> double-click
    // handler ignores inputs/selects/buttons).
    const row = screen.getByText('Alice').closest('tr')!
    act(() => { fireEvent.doubleClick(row) })
    // Drawer labels itself with the employee name via aria-label.
    expect(screen.getByRole('dialog', { name: /Edit Alice/i })).toBeTruthy()
  })

  it('bulk set-status applies to every selected row', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    // Select both people via the select-all header checkbox.
    const toggleAll = screen.getByLabelText('Toggle all') as HTMLInputElement
    act(() => { fireEvent.click(toggleAll) })
    const bulkStatus = screen.getByLabelText('Set status on selected rows') as HTMLSelectElement
    act(() => { fireEvent.change(bulkStatus, { target: { value: 'departed' } }) })
    // Both employees should flip to 'departed'.
    expect(useEmployeeStore.getState().employees.e1.status).toBe('departed')
    expect(useEmployeeStore.getState().employees.e2.status).toBe('departed')
  })

  it('bulk set-department writes the same dept to every selected row', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    // Seed a dept in the colors map so it shows up in the bulk menu.
    act(() => {
      useEmployeeStore.setState((s) => ({
        departmentColors: { ...s.departmentColors, Platform: '#222' },
      }))
    })
    const toggleAll = screen.getByLabelText('Toggle all') as HTMLInputElement
    act(() => { fireEvent.click(toggleAll) })
    const bulkDept = screen.getByLabelText('Set department on selected rows') as HTMLSelectElement
    act(() => { fireEvent.change(bulkDept, { target: { value: 'Platform' } }) })
    expect(useEmployeeStore.getState().employees.e1.department).toBe('Platform')
    expect(useEmployeeStore.getState().employees.e2.department).toBe('Platform')
  })

  it('flags duplicate emails with a "dupe" badge', () => {
    act(() => {
      useEmployeeStore.setState((s) => ({
        employees: {
          ...s.employees,
          e1: { ...s.employees.e1, email: 'shared@example.com' },
          e2: { ...s.employees.e2, email: 'SHARED@EXAMPLE.COM' },
        },
      }))
    })
    renderAtRoute('/t/acme/o/hq/roster')
    // Both rows should render a dupe badge (case-insensitive match).
    const badges = screen.getAllByText('dupe')
    expect(badges.length).toBe(2)
    // And each tooltip should name the *other* person, not a generic
    // "another person shares this email" string.
    const aliceBadge = badges.find((b) =>
      b.getAttribute('title')?.includes('Bob'),
    )
    const bobBadge = badges.find((b) =>
      b.getAttribute('title')?.includes('Alice'),
    )
    expect(aliceBadge).toBeTruthy()
    expect(bobBadge).toBeTruthy()
  })

  it('card view exposes a select-all toggle that marks every visible row', () => {
    renderAtRoute('/t/acme/o/hq/roster?view=cards')
    const toggleAll = screen.getByLabelText('Toggle all') as HTMLInputElement
    expect(toggleAll.checked).toBe(false)
    act(() => { fireEvent.click(toggleAll) })
    // After the click, every card's own checkbox should be ticked.
    const aliceSel = screen.getByLabelText('Select Alice') as HTMLInputElement
    const bobSel = screen.getByLabelText('Select Bob') as HTMLInputElement
    expect(aliceSel.checked).toBe(true)
    expect(bobSel.checked).toBe(true)
  })

  it('clearing filters in cards view keeps view=cards', () => {
    renderAtRoute('/t/acme/o/hq/roster?view=cards&status=active')
    // Sanity: we're in cards and the filter narrowed the list to Alice.
    expect(screen.getByTestId('roster-cards')).toBeTruthy()
    expect(screen.queryByText('Bob')).toBeNull()
    const clear = screen.getByTitle('Clear all filters')
    act(() => { fireEvent.click(clear) })
    // Filter gone, but we should still be in cards view (not flipped back
    // to the table), so the cards container is still in the DOM.
    expect(screen.getByTestId('roster-cards')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('preset dropdown narrows the list to matching rows', () => {
    // Alice has no email, Bob has one. The "missing-email" preset should
    // hide Bob and keep Alice.
    act(() => {
      useEmployeeStore.setState((s) => ({
        employees: {
          ...s.employees,
          e2: { ...s.employees.e2, email: 'bob@example.com' },
        },
      }))
    })
    renderAtRoute('/t/acme/o/hq/roster')
    const presetSelect = screen.getByLabelText('Preset view') as HTMLSelectElement
    act(() => {
      fireEvent.change(presetSelect, { target: { value: 'missing-email' } })
    })
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('Bob')).toBeNull()
  })

  it('row actions menu offers a Send invite link when email is present', () => {
    act(() => {
      useEmployeeStore.setState((s) => ({
        employees: {
          ...s.employees,
          e1: { ...s.employees.e1, email: 'alice@example.com' },
        },
      }))
    })
    renderAtRoute('/t/acme/o/hq/roster')
    // Each row has a "Row actions" button — Alice's row is first. Filter
    // by role because the table header cell also carries aria-label
    // "Row actions" (it labels the column, not a control).
    const actionButtons = screen
      .getAllByLabelText('Row actions')
      .filter((el) => el.tagName === 'BUTTON')
    act(() => { fireEvent.click(actionButtons[0]) })
    // The menu renders a link with visible "Send invite…" text pointing at
    // a `mailto:` url containing the employee's encoded address.
    const invite = screen.getByRole('link', { name: /Send invite/i }) as HTMLAnchorElement
    expect(invite.getAttribute('href')).toMatch(/^mailto:alice%40example\.com\?subject=/)
  })

  it('view toggle swaps between list (table) and card grid', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    // Default: table view. Cards container should be absent.
    expect(screen.queryByTestId('roster-cards')).toBeNull()
    const cardBtn = screen.getByLabelText('Card view')
    act(() => { fireEvent.click(cardBtn) })
    // After the click we should be in card view — container rendered, table
    // gone. Both employees still visible through the cards.
    expect(screen.getByTestId('roster-cards')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('surfaces an equipment-pending chip when someone is pending and filters on click', () => {
    act(() => {
      useEmployeeStore.setState((s) => ({
        employees: {
          ...s.employees,
          e1: { ...s.employees.e1, equipmentStatus: 'pending' },
        },
      }))
    })
    renderAtRoute('/t/acme/o/hq/roster')
    const chip = screen.getByRole('button', { name: /1\s+Pending equipment/i })
    act(() => { fireEvent.click(chip) })
    // Alice is pending → visible; Bob is not-needed → hidden.
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('Bob')).toBeNull()
  })

  it('search clear button wipes the query and restores all rows', () => {
    renderAtRoute('/t/acme/o/hq/roster?q=alice')
    // Only Alice visible thanks to the seeded search query.
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('Bob')).toBeNull()
    const clearBtn = screen.getByLabelText('Clear search')
    act(() => { fireEvent.click(clearBtn) })
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('renders an active-filter pill per applied filter, each independently removable', () => {
    renderAtRoute('/t/acme/o/hq/roster?dept=Engineering&status=active')
    // Seed the dept color map so the dept filter option is present.
    act(() => {
      useEmployeeStore.setState((s) => ({
        departmentColors: { ...s.departmentColors, Engineering: '#000' },
      }))
    })
    const deptPill = screen.getByLabelText(/Remove filter: Dept: Engineering/i)
    const statusPill = screen.getByLabelText(/Remove filter: Status: active/i)
    expect(deptPill).toBeTruthy()
    expect(statusPill).toBeTruthy()
    // Removing just the status pill should preserve the dept pill.
    act(() => { fireEvent.click(statusPill) })
    expect(screen.getByLabelText(/Remove filter: Dept: Engineering/i)).toBeTruthy()
    expect(screen.queryByLabelText(/Remove filter: Status: active/i)).toBeNull()
  })

  it('? keyboard shortcut toggles the cheat-sheet dialog', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    expect(screen.queryByRole('dialog', { name: /Keyboard shortcuts/i })).toBeNull()
    act(() => {
      fireEvent.keyDown(window, { key: '?' })
    })
    expect(screen.getByRole('dialog', { name: /Keyboard shortcuts/i })).toBeTruthy()
    // Press Escape inside the dialog to close it.
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog', { name: /Keyboard shortcuts/i })).toBeNull()
  })

  it('weekly-capacity bar click filters to that day', () => {
    // Put Alice in the office Mon + Tue, Bob only Tue.
    act(() => {
      useEmployeeStore.setState((s) => ({
        employees: {
          ...s.employees,
          e1: { ...s.employees.e1, officeDays: ['Mon', 'Tue'] },
          e2: { ...s.employees.e2, officeDays: ['Tue'] },
        },
      }))
    })
    renderAtRoute('/t/acme/o/hq/roster')
    // Click the Mon bar — only Alice should remain visible.
    const monBar = screen.getByLabelText('1 people in office on Mon')
    act(() => { fireEvent.click(monBar) })
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('Bob')).toBeNull()
  })
})
