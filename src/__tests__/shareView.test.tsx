import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ShareView } from '../components/editor/ShareView'
import { useShareLinksStore } from '../stores/shareLinksStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import type { Employee } from '../types/employee'

// Konva isn't friendly to jsdom (no real canvas, no requestAnimationFrame
// timing) so we replace the Stage with a div the test can assert against.
// See findOnMap.test.tsx for the same pattern at the MapView level.
vi.mock('../components/editor/Canvas/CanvasStage', () => ({
  CanvasStage: () => <div data-testid="canvas-stage" />,
}))
vi.mock('../components/editor/Canvas/CanvasActionDock', () => ({
  CanvasActionDock: () => <div data-testid="canvas-action-dock" />,
}))
vi.mock('../components/editor/Minimap', () => ({
  Minimap: () => <div data-testid="minimap" />,
}))

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

  it('renders the canvas-rendered floor plan for a valid token', () => {
    const { link } = useShareLinksStore
      .getState()
      .create('office-1', 3600, 'pilot')
    mount(`/share/hq?t=${link.token}`)
    // Canvas-mode share view: the live `<CanvasStage />` is mounted
    // (so the operator sees the actual floor plan, not a placeholder).
    expect(screen.getByTestId('canvas-stage')).toBeInTheDocument()
    // Header surfaces the office slug and a "Read-only" badge.
    expect(screen.getByText('Floorcraft')).toBeInTheDocument()
    expect(screen.getByText('hq')).toBeInTheDocument()
    expect(screen.getByText(/read-only/i)).toBeInTheDocument()
  })

  it('installs the shareViewer role on a valid token', () => {
    const { link } = useShareLinksStore
      .getState()
      .create('office-1', 3600)
    mount(`/share/hq?t=${link.token}`)
    expect(useProjectStore.getState().currentOfficeRole).toBe('shareViewer')
  })
})
