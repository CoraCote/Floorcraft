/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PropertiesPanel } from '../components/editor/RightSidebar/PropertiesPanel'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'
import type { DecorElement } from '../types/elements'

function makeDecor(id: string): DecorElement {
  return {
    id, type: 'decor', shape: 'armchair',
    x: 0, y: 0, width: 60, height: 60, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Armchair', visible: true,
    style: { fill: '#C4A57B', stroke: '#6B4423', strokeWidth: 2, opacity: 1 },
  }
}

beforeEach(() => {
  useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
  useElementsStore.setState({ elements: {} })
  useUIStore.setState({ selectedIds: [] } as any)
  // Match actual Floor type — see src/stores/floorStore.ts
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
})

describe('PropertiesPanel delete button', () => {
  it('is not rendered when nothing is selected', () => {
    render(<PropertiesPanel />)
    expect(screen.queryByRole('button', { name: /delete element/i })).toBeNull()
  })

  it('is rendered when one element is selected', () => {
    useElementsStore.setState({ elements: { a: makeDecor('a') } })
    useUIStore.setState({ selectedIds: ['a'] } as any)
    render(<PropertiesPanel />)
    expect(screen.getByRole('button', { name: /delete element/i })).toBeInTheDocument()
  })

  it('removes the element when clicked', () => {
    useElementsStore.setState({ elements: { a: makeDecor('a') } })
    useUIStore.setState({ selectedIds: ['a'] } as any)
    render(<PropertiesPanel />)

    fireEvent.click(screen.getByRole('button', { name: /delete element/i }))

    expect(useElementsStore.getState().elements['a']).toBeUndefined()
  })

  it('pluralizes label for multi-select ("Delete 2 elements")', () => {
    useElementsStore.setState({
      elements: { a: makeDecor('a'), b: makeDecor('b') },
    })
    useUIStore.setState({ selectedIds: ['a', 'b'] } as any)
    render(<PropertiesPanel />)
    expect(screen.getByRole('button', { name: /delete 2 elements/i })).toBeInTheDocument()
  })
})
