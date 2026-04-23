/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Minimap } from '../components/editor/Minimap'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import { useCanvasStore } from '../stores/canvasStore'
import type { DeskElement, WallElement } from '../types/elements'

function desk(id: string, x = 0, y = 0): DeskElement {
  return {
    id,
    type: 'desk',
    x,
    y,
    width: 40,
    height: 20,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: id,
    visible: true,
    assignedEmployeeId: null,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
  } as DeskElement
}

function wall(id: string): WallElement {
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
    zIndex: 0,
    label: id,
    visible: true,
    points: [0, 0, 100, 0, 100, 50],
    thickness: 4,
    connectedWallIds: [],
    style: { fill: 'transparent', stroke: '#111', strokeWidth: 4, opacity: 1 },
  }
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} } as any)
  useUIStore.setState({ selectedIds: [] } as any)
  useCanvasStore.setState({ stageX: 0, stageY: 0, stageScale: 1 } as any)
})

describe('Minimap selection highlight', () => {
  it('renders a highlighted rect for each selected element', () => {
    useElementsStore.setState({
      elements: { a: desk('a', 0, 0), b: desk('b', 100, 100) },
    } as any)
    useUIStore.setState({ selectedIds: ['b'] } as any)

    render(<Minimap />)

    expect(screen.getByTestId('minimap-selected-b')).toBeInTheDocument()
    expect(screen.queryByTestId('minimap-selected-a')).toBeNull()
  })

  it('renders no highlight rects when nothing is selected', () => {
    useElementsStore.setState({ elements: { a: desk('a') } } as any)
    useUIStore.setState({ selectedIds: [] } as any)

    render(<Minimap />)

    expect(screen.queryByTestId('minimap-selected-a')).toBeNull()
  })

  it('now renders walls (previously invisible because width/height are 0)', () => {
    // Before this change the minimap used el.width/el.height directly,
    // which are 0 for walls — they were never drawn. After switching
    // to elementBounds, the wall's points-based AABB gives it real
    // geometry in the minimap.
    useElementsStore.setState({ elements: { w: wall('w') } } as any)
    const { container } = render(<Minimap />)
    // 1 rect for the wall + 1 for the viewport indicator = 2 <rect>s.
    // (No selected tile since nothing is selected.)
    const rects = container.querySelectorAll('rect')
    expect(rects.length).toBeGreaterThanOrEqual(2)
  })
})
