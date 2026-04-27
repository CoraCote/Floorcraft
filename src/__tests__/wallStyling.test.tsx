/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PropertiesPanel } from '../components/editor/RightSidebar/PropertiesPanel'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import { useFloorStore } from '../stores/floorStore'
import type { WallElement } from '../types/elements'

function makeWall(id: string): WallElement {
  return {
    id, type: 'wall',
    x: 0, y: 0, width: 0, height: 0, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Wall', visible: true,
    style: { fill: '#000', stroke: '#111827', strokeWidth: 6, opacity: 1 },
    points: [0, 0, 100, 0],
    thickness: 6,
    wallType: 'solid',
  }
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useUIStore.setState({ selectedIds: [] } as any)
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
})

describe('PropertiesPanel wall styling', () => {
  it('does not render a Fill input when a wall is selected', () => {
    useElementsStore.setState({ elements: { w: makeWall('w') } })
    useUIStore.setState({ selectedIds: ['w'] } as any)
    render(<PropertiesPanel />)
    expect(screen.queryByText(/^Fill$/i)).toBeNull()
    expect(screen.getByText(/^Stroke$/i)).toBeInTheDocument()
  })

  it('renders thickness and line-style controls for a wall', () => {
    useElementsStore.setState({ elements: { w: makeWall('w') } })
    useUIStore.setState({ selectedIds: ['w'] } as any)
    render(<PropertiesPanel />)
    expect(screen.getByText(/Thickness/i)).toBeInTheDocument()
    expect(screen.getByText(/Line style/i)).toBeInTheDocument()
    // Line style + wall type both surface as selects; use the accessible
    // name so future additions don't silently break this assertion.
    expect(screen.getByRole('combobox', { name: /Line style/i })).toBeInTheDocument()
  })

  it('changing line-style select updates the store', () => {
    useElementsStore.setState({ elements: { w: makeWall('w') } })
    useUIStore.setState({ selectedIds: ['w'] } as any)
    render(<PropertiesPanel />)

    const select = screen.getByRole('combobox', { name: /Line style/i }) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'dashed' } })

    const updated = useElementsStore.getState().elements.w as WallElement
    expect(updated.dashStyle).toBe('dashed')
  })

  it('multi-select of all walls broadcasts line-style change to every wall', () => {
    useElementsStore.setState({
      elements: { a: makeWall('a'), b: makeWall('b') },
    })
    useUIStore.setState({ selectedIds: ['a', 'b'] } as any)
    render(<PropertiesPanel />)

    const select = screen.getByRole('combobox', { name: /Line style/i }) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'dotted' } })

    const els = useElementsStore.getState().elements
    expect((els.a as WallElement).dashStyle).toBe('dotted')
    expect((els.b as WallElement).dashStyle).toBe('dotted')
  })
})
