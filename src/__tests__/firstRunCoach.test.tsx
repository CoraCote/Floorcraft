import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FirstRunCoach } from '../components/editor/FirstRunCoach'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useUIStore } from '../stores/uiStore'
import type { WallElement, DeskElement } from '../types/elements'
import type { Employee } from '../types/employee'

function makeWall(id: string): WallElement {
  return {
    id,
    type: 'wall',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Wall',
    visible: true,
    style: { fill: '#000', stroke: '#111827', strokeWidth: 6, opacity: 1 },
    points: [0, 0, 100, 0],
    thickness: 6,
    connectedWallIds: [],
    wallType: 'solid',
  }
}

function makeDesk(id: string): DeskElement {
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
    label: 'Desk',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: id,
    assignedEmployeeId: null,
    capacity: 1,
  }
}

function makeEmployee(id: string, seatId: string | null): Employee {
  return {
    id,
    name: id,
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
    seatId,
    floorId: null,
    pendingStatusChanges: [],
    sensitivityTags: [],
    createdAt: new Date().toISOString(),
  }
}

describe('FirstRunCoach', () => {
  beforeEach(() => {
    localStorage.clear()
    useElementsStore.setState({ elements: {} })
    useEmployeeStore.setState({ employees: {} })
    useUIStore.setState({ commandPaletteOpen: false })
  })

  it('mounts the welcome card when firstRunWelcomeSeen is unset', () => {
    render(<FirstRunCoach />)
    expect(screen.getByRole('complementary', { name: /first-run help/i })).toBeInTheDocument()
    expect(screen.getByText(/welcome to floorcraft/i)).toBeInTheDocument()
  })

  it('does NOT mount when firstRunWelcomeSeen is set to "1"', () => {
    localStorage.setItem('firstRunWelcomeSeen', '1')
    const { container } = render(<FirstRunCoach />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('complementary', { name: /first-run help/i })).toBeNull()
  })

  it('dismiss button writes firstRunWelcomeSeen=1 and unmounts the card', () => {
    render(<FirstRunCoach />)
    fireEvent.click(screen.getByRole('button', { name: /^dismiss$/i }))
    expect(localStorage.getItem('firstRunWelcomeSeen')).toBe('1')
    expect(screen.queryByRole('complementary', { name: /first-run help/i })).toBeNull()
  })

  it('X close button also dismisses', () => {
    render(<FirstRunCoach />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss welcome card/i }))
    expect(localStorage.getItem('firstRunWelcomeSeen')).toBe('1')
  })

  it('checklist: walls item flips to done when elements store has a wall', () => {
    useElementsStore.setState({ elements: { w1: makeWall('w1') } })
    render(<FirstRunCoach />)
    const wallsItem = screen.getByText('Draw your walls')
    // Done items are struck-through; unchecked items are not.
    expect(wallsItem.className).toMatch(/line-through/)
  })

  it('checklist: desks item flips to done when elements store has a desk/workstation', () => {
    useElementsStore.setState({ elements: { d1: makeDesk('d1') } })
    render(<FirstRunCoach />)
    const desksItem = screen.getByText('Add some desks')
    expect(desksItem.className).toMatch(/line-through/)
  })

  it('checklist: team item flips to done when an employee has a seatId', () => {
    useEmployeeStore.setState({ employees: { e1: makeEmployee('e1', 'seat-1') } })
    render(<FirstRunCoach />)
    const teamItem = screen.getByText('Assign the team')
    expect(teamItem.className).toMatch(/line-through/)
  })

  it('checklist: team item stays pending when employees exist but none have a seatId', () => {
    useEmployeeStore.setState({ employees: { e1: makeEmployee('e1', null) } })
    render(<FirstRunCoach />)
    const teamItem = screen.getByText('Assign the team')
    expect(teamItem.className).not.toMatch(/line-through/)
  })

  it('auto-dismisses (and persists the flag) when all three milestones are complete on mount', () => {
    useElementsStore.setState({
      elements: { w1: makeWall('w1'), d1: makeDesk('d1') },
    })
    useEmployeeStore.setState({
      employees: { e1: makeEmployee('e1', 'seat-1') },
    })
    const { container } = render(<FirstRunCoach />)
    expect(container.firstChild).toBeNull()
    // Persistence: we want imports-with-assignments to silently retire the
    // card forever, not re-appear on every fresh mount.
    expect(localStorage.getItem('firstRunWelcomeSeen')).toBe('1')
  })

  it('"Get started" button opens the command palette', () => {
    render(<FirstRunCoach />)
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    expect(useUIStore.getState().commandPaletteOpen).toBe(true)
  })
})
