/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NeighborhoodUtilizationList } from '../components/editor/RightSidebar/NeighborhoodUtilizationList'
import { useNeighborhoodStore } from '../stores/neighborhoodStore'
import { useFloorStore } from '../stores/floorStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import type { Neighborhood } from '../types/neighborhood'
import type { CanvasElement, DeskElement } from '../types/elements'

// focusElements is exercised elsewhere; mock here so we can assert the
// click wiring without dragging in the zoomToFit + stage registry.
const { focusElementsMock } = vi.hoisted(() => ({
  focusElementsMock: vi.fn((_ids: string[]) => true),
}))
vi.mock('../lib/focusElements', () => ({
  focusElements: focusElementsMock,
}))

function desk(id: string, x: number, y: number, assigned: string | null): DeskElement {
  return {
    id,
    type: 'desk',
    x,
    y,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: `DSK-${id}`,
    assignedEmployeeId: assigned,
    capacity: 1,
  }
}

function nb(over: Partial<Neighborhood> = {}): Neighborhood {
  return {
    id: 'n1',
    name: 'Pod A',
    color: '#3B82F6',
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    floorId: 'floor-1',
    ...over,
  }
}

beforeEach(() => {
  focusElementsMock.mockClear()
  useNeighborhoodStore.getState().clearAll()
  useEmployeeStore.setState({ employees: {} } as any)
  const elements: Record<string, CanvasElement> = {}
  useElementsStore.setState({ elements } as any)
  useFloorStore.setState({
    floors: [
      { id: 'floor-1', name: 'Floor 1', order: 0, elements },
    ],
    activeFloorId: 'floor-1',
  } as any)
})

describe('NeighborhoodUtilizationList', () => {
  it('renders nothing when there are no neighborhoods', () => {
    const { container } = render(<NeighborhoodUtilizationList />)
    expect(container.firstChild).toBeNull()
  })

  it('renders one row per neighborhood with the assigned/total ratio', () => {
    const d1 = desk('d1', 100, 100, 'e1')
    const d2 = desk('d2', 110, 110, null)
    const elements: Record<string, CanvasElement> = { d1, d2 }
    useElementsStore.setState({ elements } as any)
    useFloorStore.setState({
      floors: [{ id: 'floor-1', name: 'Floor 1', order: 0, elements }],
      activeFloorId: 'floor-1',
    } as any)

    useNeighborhoodStore.getState().addNeighborhood(nb())
    useNeighborhoodStore
      .getState()
      .addNeighborhood(nb({ id: 'n2', name: 'Pod B', x: 900, y: 900 }))

    render(<NeighborhoodUtilizationList />)

    // Two rows rendered — names as labels on their focus buttons.
    expect(screen.getByRole('button', { name: /Focus Pod A/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Focus Pod B/ })).toBeTruthy()

    // Pod A has two desks inside, one assigned → "1/2".
    const podA = screen.getByRole('button', { name: /Focus Pod A/ })
    expect(podA.textContent).toMatch(/1\/2/)
    // Pod B has no seats inside → "0/0".
    const podB = screen.getByRole('button', { name: /Focus Pod B/ })
    expect(podB.textContent).toMatch(/0\/0/)
  })

  it('clicking a row calls focusElements with the neighborhood seats', () => {
    const d1 = desk('d1', 100, 100, 'e1')
    const d2 = desk('d2', 110, 110, null)
    const elements: Record<string, CanvasElement> = { d1, d2 }
    useElementsStore.setState({ elements } as any)
    useFloorStore.setState({
      floors: [{ id: 'floor-1', name: 'Floor 1', order: 0, elements }],
      activeFloorId: 'floor-1',
    } as any)
    useNeighborhoodStore.getState().addNeighborhood(nb())

    render(<NeighborhoodUtilizationList />)
    fireEvent.click(screen.getByRole('button', { name: /Focus Pod A/ }))

    expect(focusElementsMock).toHaveBeenCalledTimes(1)
    const ids = focusElementsMock.mock.calls[0][0] as string[]
    expect(ids.sort()).toEqual(['d1', 'd2'])
  })

  it('disables the focus button when the neighborhood has no seats', () => {
    useNeighborhoodStore.getState().addNeighborhood(nb())
    render(<NeighborhoodUtilizationList />)
    const btn = screen.getByRole('button', { name: /Focus Pod A/ })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(btn)
    expect(focusElementsMock).not.toHaveBeenCalled()
  })
})
