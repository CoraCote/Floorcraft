/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PlanHealthPill } from '../components/editor/PlanHealthPill'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useNeighborhoodStore } from '../stores/neighborhoodStore'
import { useUIStore } from '../stores/uiStore'
import type { DeskElement } from '../types/elements'

function desk(id: string, overrides: Partial<DeskElement> = {}): DeskElement {
  return {
    id,
    type: 'desk',
    x: 0,
    y: 0,
    width: 60,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: `D-${id}`,
    assignedEmployeeId: null,
    capacity: 1,
    ...overrides,
  }
}

function emp(id: string, name: string, seatId: string | null = null) {
  return {
    id,
    name,
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
    sensitivityTags: [],
    seatId,
    floorId: null,
    pendingStatusChanges: [],
    createdAt: new Date().toISOString(),
  } as any
}

// `focusElements` writes to the canvas store + Konva stage which jsdom can't
// execute. We just observe that it was called with the right ids.
vi.mock('../lib/focusElements', () => ({
  focusElements: vi.fn(() => true),
}))

import { focusElements } from '../lib/focusElements'

function renderPill() {
  return render(
    <MemoryRouter initialEntries={['/t/team-x/o/office-y/map']}>
      <PlanHealthPill />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  ;(focusElements as any).mockClear()
  useElementsStore.setState({ elements: {} })
  useEmployeeStore.setState({ employees: {} })
  useNeighborhoodStore.setState({ neighborhoods: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  })
  useUIStore.setState({ selectedIds: [] })
})

describe('PlanHealthPill', () => {
  it('renders the green "Plan healthy" state for a clean office', () => {
    renderPill()
    const pill = screen.getByTestId('plan-health-pill')
    expect(pill).toHaveTextContent('Plan healthy')
    expect(pill.className).toContain('text-green')
  })

  it('switches to amber "1 warning" when only warnings are present', () => {
    useElementsStore.setState({
      elements: {
        h: desk('h', { type: 'hot-desk', assignedEmployeeId: 'e1' }),
      },
    })
    useEmployeeStore.setState({ employees: { e1: emp('e1', 'Alice') } })
    renderPill()
    const pill = screen.getByTestId('plan-health-pill')
    expect(pill).toHaveTextContent('1 warning')
    expect(pill.className).toContain('text-amber')
  })

  it('switches to red "issues" when an error is present', () => {
    useElementsStore.setState({
      elements: { d1: desk('d1', { assignedEmployeeId: 'ghost' }) },
    })
    renderPill()
    const pill = screen.getByTestId('plan-health-pill')
    expect(pill).toHaveTextContent('issue')
    expect(pill.className).toContain('text-red')
  })

  it('opens the drawer on click and shows each issue row', () => {
    useElementsStore.setState({
      elements: { d1: desk('d1', { assignedEmployeeId: 'ghost' }) },
    })
    renderPill()
    fireEvent.click(screen.getByTestId('plan-health-pill'))
    expect(screen.getByTestId('plan-health-drawer')).toBeInTheDocument()
    expect(screen.getByTestId('plan-health-row')).toBeInTheDocument()
    expect(screen.getByText(/references a deleted employee/i)).toBeInTheDocument()
  })

  it('Jump on an element-target issue calls focusElements with the target ids', () => {
    useElementsStore.setState({
      elements: { d1: desk('d1', { assignedEmployeeId: 'ghost' }) },
    })
    renderPill()
    fireEvent.click(screen.getByTestId('plan-health-pill'))
    fireEvent.click(screen.getByTestId('plan-health-jump'))
    expect(focusElements).toHaveBeenCalledWith(['d1'])
    // Drawer should close after jumping.
    expect(screen.queryByTestId('plan-health-drawer')).not.toBeInTheDocument()
  })

  it('shows the empty-state in the drawer when the plan is healthy', () => {
    renderPill()
    fireEvent.click(screen.getByTestId('plan-health-pill'))
    expect(screen.getByTestId('plan-health-empty')).toBeInTheDocument()
    expect(screen.getByText(/Everything looks good/i)).toBeInTheDocument()
  })
})
