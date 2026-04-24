/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useUIStore } from '../stores/uiStore'
import { useFloorStore } from '../stores/floorStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { CommandPalette } from '../components/editor/CommandPalette'
import type { Employee } from '../types/employee'

/**
 * Palette tests exercise the full component mounted under the office
 * route so `useParams` resolves `teamSlug`/`officeSlug` — the palette's
 * navigate actions depend on that slug pair.
 */

function makeEmployee(partial: Partial<Employee> & Pick<Employee, 'id' | 'name'>): Employee {
  return {
    email: '',
    department: null,
    team: null,
    title: null,
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
    seatId: null,
    floorId: null,
    pendingStatusChanges: [],
    sensitivityTags: [],
    createdAt: new Date().toISOString(),
    ...partial,
  }
}

// Tiny location probe so the navigation tests can assert the URL
// without reaching into the router internals.
function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

function renderPalette() {
  return render(
    <MemoryRouter initialEntries={['/t/acme/o/hq/map']}>
      <Routes>
        <Route
          path="/t/:teamSlug/o/:officeSlug/*"
          element={
            <>
              <CommandPalette />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // Reset every store slice the palette reads.
  useUIStore.setState({
    commandPaletteOpen: false,
    modalOpenCount: 0,
    presentationMode: false,
    exportDialogOpen: false,
  } as any)
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [
      { id: 'f1', name: 'Floor 1', order: 0, elements: {} },
      { id: 'f2', name: 'Floor 2', order: 1, elements: {} },
    ],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({
    employees: {
      e1: makeEmployee({ id: 'e1', name: 'Alice Anderson', department: 'Engineering' }),
      e2: makeEmployee({ id: 'e2', name: 'Bob Baker', department: 'Sales' }),
    },
  })
  // Editor role → unredacted names by default.
  useProjectStore.setState({ currentOfficeRole: 'editor', impersonatedRole: null } as any)
})

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    renderPalette()
    expect(screen.queryByTestId('command-palette')).toBeNull()
  })

  it('opens via setCommandPaletteOpen and Esc closes it', () => {
    renderPalette()
    act(() => {
      useUIStore.getState().setCommandPaletteOpen(true)
    })
    expect(screen.getByTestId('command-palette')).toBeTruthy()
    const input = screen.getByTestId('command-palette-input')
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' })
    })
    expect(screen.queryByTestId('command-palette')).toBeNull()
  })

  it('registers as a modal while open (modalOpenCount bumps and clears)', () => {
    const { unmount } = renderPalette()
    expect(useUIStore.getState().modalOpenCount).toBe(0)
    act(() => {
      useUIStore.getState().setCommandPaletteOpen(true)
    })
    expect(useUIStore.getState().modalOpenCount).toBe(1)
    act(() => {
      useUIStore.getState().setCommandPaletteOpen(false)
    })
    expect(useUIStore.getState().modalOpenCount).toBe(0)
    unmount()
  })

  it('shows every section when the query is empty', () => {
    renderPalette()
    act(() => useUIStore.getState().setCommandPaletteOpen(true))
    // Navigate, People, Floors, Actions all present.
    expect(screen.getByTestId('command-palette-section-navigate')).toBeTruthy()
    expect(screen.getByTestId('command-palette-section-people')).toBeTruthy()
    expect(screen.getByTestId('command-palette-section-floors')).toBeTruthy()
    expect(screen.getByTestId('command-palette-section-actions')).toBeTruthy()
  })

  it('filters items across sections as the user types', () => {
    renderPalette()
    act(() => useUIStore.getState().setCommandPaletteOpen(true))
    const input = screen.getByTestId('command-palette-input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'Alice' } })
    })
    // Alice matches; Bob, floors, actions, nav items do not.
    expect(screen.getByTestId('command-palette-item-person-e1')).toBeTruthy()
    expect(screen.queryByTestId('command-palette-item-person-e2')).toBeNull()
    expect(screen.queryByTestId('command-palette-item-nav-map')).toBeNull()
    expect(screen.queryByTestId('command-palette-item-floor-f1')).toBeNull()
  })

  it('Arrow-Down moves highlight; Enter triggers the highlighted item', () => {
    renderPalette()
    act(() => useUIStore.getState().setCommandPaletteOpen(true))
    const input = screen.getByTestId('command-palette-input') as HTMLInputElement
    // Narrow to a predictable single-item list so we know exactly what
    // will be highlighted after ArrowDown.
    act(() => {
      fireEvent.change(input, { target: { value: 'Go to Roster' } })
    })
    // First item highlighted by default. ArrowDown wraps back to it.
    const first = screen.getByTestId('command-palette-item-nav-roster')
    expect(first.getAttribute('data-active')).toBe('true')
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    // Palette closed, URL navigated.
    expect(screen.queryByTestId('command-palette')).toBeNull()
    expect(screen.getByTestId('location').textContent).toBe(
      '/t/acme/o/hq/roster',
    )
  })

  it('selecting a floor switches the active floor', () => {
    renderPalette()
    act(() => useUIStore.getState().setCommandPaletteOpen(true))
    const button = screen.getByTestId('command-palette-item-floor-f2')
    act(() => {
      fireEvent.click(button)
    })
    expect(useFloorStore.getState().activeFloorId).toBe('f2')
    expect(screen.queryByTestId('command-palette')).toBeNull()
  })

  it('selecting a person navigates to roster with ?employee=', () => {
    renderPalette()
    act(() => useUIStore.getState().setCommandPaletteOpen(true))
    const button = screen.getByTestId('command-palette-item-person-e1')
    act(() => {
      fireEvent.click(button)
    })
    expect(screen.getByTestId('location').textContent).toBe(
      '/t/acme/o/hq/roster?employee=e1',
    )
  })

  it('PII-viewer role sees redacted names and cannot match the raw full name', () => {
    // Viewer lacks `viewPII`, so `useVisibleEmployees` returns the
    // redacted projection. The palette's People section must therefore
    // show initials and ignore a full-name query.
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)
    renderPalette()
    act(() => useUIStore.getState().setCommandPaletteOpen(true))
    // Initials are present; the raw full name is not anywhere.
    expect(screen.getByText('A.A.')).toBeTruthy()
    expect(screen.queryByText('Alice Anderson')).toBeNull()

    const input = screen.getByTestId('command-palette-input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'Alice Anderson' } })
    })
    // Full-name query does NOT match the redacted label — viewer can't
    // confirm Alice's presence via the palette.
    expect(screen.queryByTestId('command-palette-item-person-e1')).toBeNull()

    // Sanity: typing the initials DOES still match.
    act(() => {
      fireEvent.change(input, { target: { value: 'A.A' } })
    })
    expect(screen.getByTestId('command-palette-item-person-e1')).toBeTruthy()
  })
})
