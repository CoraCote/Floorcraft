/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CanvasFinder } from '../components/editor/CanvasFinder'
import { useCanvasFinderStore } from '../stores/canvasFinderStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useNeighborhoodStore } from '../stores/neighborhoodStore'
import { useProjectStore } from '../stores/projectStore'
import { useUIStore } from '../stores/uiStore'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import type { Employee } from '../types/employee'
import type { CanvasElement, DeskElement } from '../types/elements'

/**
 * Stub focusOnElement — the finder calls it on every match cycle but
 * the unit tests don't drive a real Konva stage. The mock keeps the
 * call observable for sanity but we don't assert on it directly here;
 * the focus path is covered by `canvasFocus.test.ts`.
 */
vi.mock('../lib/canvasFocus', () => ({
  focusOnElement: vi.fn(),
  computeCenteringPosition: vi.fn(),
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

function desk(id: string, deskId: string, assignedEmployeeId: string | null = null): DeskElement {
  return {
    id,
    type: 'desk',
    x: 0,
    y: 0,
    width: 60,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    visible: true,
    label: '',
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId,
    assignedEmployeeId,
    capacity: 1,
  } as DeskElement
}

/**
 * Drive the keyboard shortcut hook so Cmd+F → openFinder() goes through
 * the same code path the editor uses at runtime. The finder itself is
 * mounted alongside so portal-rendered DOM is available to queries.
 */
function ShortcutHarness() {
  useKeyboardShortcuts()
  return <CanvasFinder />
}

function renderHarness(initialPath = '/t/acme/o/hq/map') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/t/:teamSlug/o/:officeSlug/*"
          element={<ShortcutHarness />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // Reset finder + supporting stores. Each test starts with a clean
  // floor so floor-id assertions aren't order-dependent.
  useCanvasFinderStore.setState({
    open: false,
    query: '',
    matches: [],
    activeIndex: 0,
  })
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [
      { id: 'f1', name: 'Floor 1', order: 0, elements: {} },
      { id: 'f2', name: 'Floor 2', order: 1, elements: {} },
    ],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({ employees: {} })
  useNeighborhoodStore.setState({ neighborhoods: {} })
  useUIStore.setState({
    selectedIds: [],
    modalOpenCount: 0,
    presentationMode: false,
    commandPaletteOpen: false,
  } as any)
  // Editor role → viewPII = true unless explicitly impersonated.
  useProjectStore.setState({ currentOfficeRole: 'editor', impersonatedRole: null } as any)
})

describe('CanvasFinder', () => {
  it('opens on Cmd+F (map route) and closes on Escape', () => {
    renderHarness()
    expect(screen.queryByTestId('canvas-finder')).toBeNull()

    act(() => {
      fireEvent.keyDown(window, { key: 'f', metaKey: true })
    })
    expect(screen.getByTestId('canvas-finder')).toBeTruthy()

    const input = screen.getByTestId('canvas-finder-input')
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' })
    })
    expect(screen.queryByTestId('canvas-finder')).toBeNull()
  })

  it('does not open Cmd+F outside the map route', () => {
    renderHarness('/t/acme/o/hq/roster')
    act(() => {
      fireEvent.keyDown(window, { key: 'f', metaKey: true })
    })
    expect(screen.queryByTestId('canvas-finder')).toBeNull()
  })

  it('typing a name yields employee + desk matches', () => {
    useElementsStore.setState({ elements: { d1: desk('d1', 'D-1', 'e1') } })
    useEmployeeStore.setState({
      employees: {
        e1: makeEmployee({ id: 'e1', name: 'Sarah Smith', seatId: 'd1', floorId: 'f1' }),
      },
    })
    renderHarness()
    act(() => useCanvasFinderStore.getState().openFinder())

    const input = screen.getByTestId('canvas-finder-input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'sarah' } })
    })
    // The store-side matches array should contain at least one hit
    // (matchElement on desk + the employee branch both surface "sarah").
    const matches = useCanvasFinderStore.getState().matches
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.some((m) => m.kind === 'employee' && m.id === 'e1')).toBe(true)
  })

  it('Enter advances and Shift+Enter retreats, wrapping at the bounds', () => {
    useElementsStore.setState({
      elements: {
        d1: desk('d1', 'D-1'),
        d2: desk('d2', 'D-2'),
        d3: desk('d3', 'D-3'),
      },
    })
    renderHarness()
    act(() => useCanvasFinderStore.getState().openFinder())

    const input = screen.getByTestId('canvas-finder-input') as HTMLInputElement
    // "D-" matches all three desks (deskId substring).
    act(() => {
      fireEvent.change(input, { target: { value: 'd-' } })
    })
    expect(useCanvasFinderStore.getState().matches.length).toBe(3)
    expect(useCanvasFinderStore.getState().activeIndex).toBe(0)

    // Forward through all three — last Enter wraps back to 0.
    act(() => fireEvent.keyDown(input, { key: 'Enter' }))
    expect(useCanvasFinderStore.getState().activeIndex).toBe(1)
    act(() => fireEvent.keyDown(input, { key: 'Enter' }))
    expect(useCanvasFinderStore.getState().activeIndex).toBe(2)
    act(() => fireEvent.keyDown(input, { key: 'Enter' }))
    expect(useCanvasFinderStore.getState().activeIndex).toBe(0)

    // Shift+Enter walks backward through the wrap.
    act(() => fireEvent.keyDown(input, { key: 'Enter', shiftKey: true }))
    expect(useCanvasFinderStore.getState().activeIndex).toBe(2)
    act(() => fireEvent.keyDown(input, { key: 'Enter', shiftKey: true }))
    expect(useCanvasFinderStore.getState().activeIndex).toBe(1)
  })

  it('viewPII=false: typing an email returns no employee matches', () => {
    useElementsStore.setState({ elements: { d1: desk('d1', 'D-1', 'e1') } })
    useEmployeeStore.setState({
      employees: {
        e1: makeEmployee({
          id: 'e1',
          name: 'Sarah Smith',
          email: 'sarah@example.com',
          seatId: 'd1',
          floorId: 'f1',
        }),
      },
    })
    // Demote the viewer to a role without viewPII. shareViewer (or
    // impersonating viewer with no PII grant) is the canonical example.
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)

    renderHarness()
    act(() => useCanvasFinderStore.getState().openFinder())
    const input = screen.getByTestId('canvas-finder-input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'sarah@example.com' } })
    })
    // Even though the email is in the underlying employee record, the
    // viewer can't search it. Same for desk → assigned-name lookup.
    const matches = useCanvasFinderStore.getState().matches
    expect(matches.some((m) => m.kind === 'employee')).toBe(false)
  })

  it('empty / whitespace query yields zero matches and no dimming signal', () => {
    useElementsStore.setState({ elements: { d1: desk('d1', 'D-1') } })
    renderHarness()
    act(() => useCanvasFinderStore.getState().openFinder())
    const input = screen.getByTestId('canvas-finder-input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: '   ' } })
    })
    expect(useCanvasFinderStore.getState().matches).toEqual([])
  })

  it('switching the active floor closes the finder', () => {
    renderHarness()
    act(() => useCanvasFinderStore.getState().openFinder())
    expect(useCanvasFinderStore.getState().open).toBe(true)

    act(() => {
      useFloorStore.setState({ activeFloorId: 'f2' } as any)
    })
    expect(useCanvasFinderStore.getState().open).toBe(false)
  })

  it('matches a neighborhood by name on the active floor', () => {
    useNeighborhoodStore.setState({
      neighborhoods: {
        n1: {
          id: 'n1',
          name: 'Engineering Pod',
          color: '#3B82F6',
          x: 100,
          y: 100,
          width: 200,
          height: 200,
          floorId: 'f1',
        },
        n2: {
          id: 'n2',
          name: 'Engineering Annex',
          color: '#10B981',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          floorId: 'f2', // off-floor — should NOT appear
        },
      },
    })
    renderHarness()
    act(() => useCanvasFinderStore.getState().openFinder())
    const input = screen.getByTestId('canvas-finder-input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'engineering' } })
    })
    const matches = useCanvasFinderStore.getState().matches
    const ns = matches.filter((m) => m.kind === 'neighborhood')
    expect(ns.length).toBe(1)
    expect(ns[0]!.id).toBe('n1')
  })

  it('counter pill renders "N / M" when matches exist and "No matches" when not', () => {
    useElementsStore.setState({ elements: { d1: desk('d1', 'D-101') } })
    renderHarness()
    act(() => useCanvasFinderStore.getState().openFinder())
    const input = screen.getByTestId('canvas-finder-input') as HTMLInputElement

    // Empty query → counter is empty.
    expect(screen.getByTestId('canvas-finder-counter').textContent).toBe('')

    act(() => {
      fireEvent.change(input, { target: { value: 'D-101' } })
    })
    expect(screen.getByTestId('canvas-finder-counter').textContent).toBe('1 / 1')

    act(() => {
      fireEvent.change(input, { target: { value: 'nothing-matches' } })
    })
    expect(screen.getByTestId('canvas-finder-counter').textContent).toBe('No matches')
  })

  it('close button resets the finder state', () => {
    renderHarness()
    act(() => useCanvasFinderStore.getState().openFinder())
    const input = screen.getByTestId('canvas-finder-input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'foo' } })
    })
    expect(useCanvasFinderStore.getState().query).toBe('foo')
    act(() => {
      fireEvent.click(screen.getByTestId('canvas-finder-close'))
    })
    expect(useCanvasFinderStore.getState().open).toBe(false)
    expect(useCanvasFinderStore.getState().query).toBe('')
  })

  // Silence "unused import" for CanvasElement in the file when no test
  // currently needs it as a type guard. (Preserved for future tests.)
  void ({} as CanvasElement)
})
