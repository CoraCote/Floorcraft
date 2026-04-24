/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useUIStore } from '../stores/uiStore'
import { useFloorStore } from '../stores/floorStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { CommandPalette } from '../components/editor/CommandPalette'
import { __resetAllOfficesCacheForTests } from '../lib/offices/allOfficesCache'
import type { Employee } from '../types/employee'

/**
 * Cross-office palette integration — mounts the palette under two mocked
 * offices, primes the `allOfficesCache` via the `loadOffice` mock, types
 * a query, confirms the cross-office section appears grouped by office
 * name, and that clicking a row navigates to the expected URL.
 */

const { listOffices, loadOffice } = vi.hoisted(() => ({
  listOffices: vi.fn(),
  loadOffice: vi.fn(),
}))
vi.mock('../lib/offices/officeRepository', () => ({
  listOffices: (...a: unknown[]) => listOffices(...a),
  loadOffice: (...a: unknown[]) => loadOffice(...a),
}))

const { fromMock } = vi.hoisted(() => {
  const impl = (_table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { id: 't1' }, error: null }),
      }),
    }),
  })
  return { fromMock: vi.fn<typeof impl>(impl) }
})
vi.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}))

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
  __resetAllOfficesCacheForTests()
  listOffices.mockResolvedValue([
    { id: 'o-hq', slug: 'hq', name: 'HQ', updated_at: '2026-04-20T00:00:00Z', is_private: false },
    { id: 'o-paris', slug: 'paris', name: 'Paris', updated_at: '2026-04-20T00:00:00Z', is_private: false },
  ])
  loadOffice.mockImplementation(async (_teamId: string, slug: string) => {
    if (slug === 'hq') {
      return {
        id: 'o-hq',
        slug: 'hq',
        name: 'HQ',
        team_id: 't1',
        is_private: false,
        created_by: 'u1',
        updated_at: '2026-04-20T00:00:00Z',
        payload: {
          employees: {
            eh1: makeEmployee({ id: 'eh1', name: 'Alice Anderson', department: 'Eng' }),
          },
          floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
          neighborhoods: {},
        },
      }
    }
    return {
      id: 'o-paris',
      slug: 'paris',
      name: 'Paris',
      team_id: 't1',
      is_private: false,
      created_by: 'u1',
      updated_at: '2026-04-20T00:00:00Z',
      payload: {
        employees: {
          ep1: makeEmployee({ id: 'ep1', name: 'Alicia Dupont', department: 'Sales' }),
        },
        floors: [
          {
            id: 'f2',
            name: 'Floor A',
            order: 0,
            elements: {
              el1: {
                id: 'el1',
                type: 'desk',
                x: 10,
                y: 10,
                width: 50,
                height: 50,
                rotation: 0,
                locked: false,
                groupId: null,
                zIndex: 0,
                label: 'Alimentaire Desk',
                visible: true,
                style: {},
              },
            },
          },
        ],
        neighborhoods: {},
      },
    }
  })
  useUIStore.setState({
    commandPaletteOpen: false,
    modalOpenCount: 0,
    presentationMode: false,
    exportDialogOpen: false,
  } as any)
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({ employees: {} })
  useProjectStore.setState({ currentOfficeRole: 'editor', impersonatedRole: null } as any)
})

describe('CommandPalette — cross-office search', () => {
  it('shows results grouped by office and navigates to the destination office on click', async () => {
    renderPalette()
    act(() => useUIStore.getState().setCommandPaletteOpen(true))
    const input = screen.getByTestId('command-palette-input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'ali' } })
    })
    // Debounce + cache hydration need to flush; waitFor polls.
    await waitFor(
      () => {
        expect(screen.getByTestId('command-palette-cross-office')).toBeTruthy()
      },
      { timeout: 2000 },
    )
    // Both offices contributed a row.
    expect(screen.getByTestId('cross-office-group-HQ')).toBeTruthy()
    expect(screen.getByTestId('cross-office-group-Paris')).toBeTruthy()
    expect(screen.getByTestId('cross-office-item-employee-eh1')).toBeTruthy()
    // Alicia and Alimentaire Desk both live under Paris.
    expect(screen.getByTestId('cross-office-item-employee-ep1')).toBeTruthy()
    expect(screen.getByTestId('cross-office-item-element-el1')).toBeTruthy()

    // Clicking the Paris desk row navigates to the Paris office map with ?focus=.
    act(() => {
      fireEvent.click(screen.getByTestId('cross-office-item-element-el1'))
    })
    expect(screen.getByTestId('location').textContent).toBe(
      '/t/acme/o/paris/map?focus=el1',
    )
  })

  it('clicking a cross-office employee routes to the roster with ?employee=', async () => {
    renderPalette()
    act(() => useUIStore.getState().setCommandPaletteOpen(true))
    const input = screen.getByTestId('command-palette-input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'alic' } })
    })
    await waitFor(
      () => {
        expect(screen.getByTestId('cross-office-item-employee-ep1')).toBeTruthy()
      },
      { timeout: 2000 },
    )
    act(() => {
      fireEvent.click(screen.getByTestId('cross-office-item-employee-ep1'))
    })
    expect(screen.getByTestId('location').textContent).toBe(
      '/t/acme/o/paris/roster?employee=ep1',
    )
  })
})
