/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ContextMenu } from '../components/editor/ContextMenu'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import type { DecorElement } from '../types/elements'

function makeDecor(id: string, overrides: Partial<DecorElement> = {}): DecorElement {
  return {
    id,
    type: 'decor',
    shape: 'armchair',
    x: 0,
    y: 0,
    width: 60,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Armchair',
    visible: true,
    style: { fill: '#C4A57B', stroke: '#6B4423', strokeWidth: 2, opacity: 1 },
    ...overrides,
  }
}

beforeEach(() => {
  // Reset stores so right-click context survives between tests cleanly.
  useElementsStore.setState({ elements: {} })
  useUIStore.setState({
    selectedIds: [],
    contextMenu: null,
    editingLabelId: null,
  } as any)
})

describe('ContextMenu', () => {
  it('renders nothing when no contextMenu state is set', () => {
    const { container } = render(<ContextMenu />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders grouped sections with uppercase headings for an element', () => {
    useElementsStore.setState({ elements: { a: makeDecor('a') } })
    useUIStore.setState({
      selectedIds: ['a'],
      contextMenu: { x: 50, y: 80, elementId: 'a' },
    } as any)
    render(<ContextMenu />)
    // Section labels — three groups for a single selection: Edit, Arrange, Object.
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Arrange')).toBeInTheDocument()
    expect(screen.getByText('Object')).toBeInTheDocument()
    // Common action rows.
    expect(screen.getByRole('menuitem', { name: /Duplicate/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Bring to front/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Lock/ })).toBeInTheDocument()
  })

  it('hides the Align group with fewer than 2 selected', () => {
    useElementsStore.setState({ elements: { a: makeDecor('a') } })
    useUIStore.setState({
      selectedIds: ['a'],
      contextMenu: { x: 0, y: 0, elementId: 'a' },
    } as any)
    render(<ContextMenu />)
    expect(screen.queryByText('Align')).toBeNull()
  })

  it('shows the Align group when 2+ selected', () => {
    useElementsStore.setState({
      elements: { a: makeDecor('a'), b: makeDecor('b', { x: 200 }) },
    })
    useUIStore.setState({
      selectedIds: ['a', 'b'],
      contextMenu: { x: 0, y: 0, elementId: 'a' },
    } as any)
    render(<ContextMenu />)
    expect(screen.getByText('Align')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Align left/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Align middle/ })).toBeInTheDocument()
  })

  it('shows the empty-canvas variant when no element is targeted', () => {
    useElementsStore.setState({ elements: { a: makeDecor('a') } })
    useUIStore.setState({
      selectedIds: [],
      contextMenu: { x: 10, y: 20, elementId: null },
    } as any)
    render(<ContextMenu />)
    // Only the Canvas group surfaces, no Edit/Arrange/Object.
    expect(screen.getByText('Canvas')).toBeInTheDocument()
    expect(screen.queryByText('Edit')).toBeNull()
    expect(screen.queryByText('Arrange')).toBeNull()
    expect(screen.getByRole('menuitem', { name: /Select all/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Toggle grid/ })).toBeInTheDocument()
  })

  it('shows keyboard shortcuts on the right side of supported rows', () => {
    useElementsStore.setState({ elements: { a: makeDecor('a') } })
    useUIStore.setState({
      selectedIds: ['a'],
      contextMenu: { x: 0, y: 0, elementId: 'a' },
    } as any)
    render(<ContextMenu />)
    const dup = screen.getByRole('menuitem', { name: /Duplicate/ })
    expect(dup.textContent).toContain('Ctrl+D')
    const del = screen.getByRole('menuitem', { name: /Delete/ })
    expect(del.textContent).toContain('Del')
  })

  it('arrow keys move focus between items and Home jumps to first', () => {
    useElementsStore.setState({ elements: { a: makeDecor('a') } })
    useUIStore.setState({
      selectedIds: ['a'],
      contextMenu: { x: 0, y: 0, elementId: 'a' },
    } as any)
    render(<ContextMenu />)
    const menu = screen.getByRole('menu')
    const first = menu.querySelector<HTMLButtonElement>('button[data-menu-index="0"]')
    const second = menu.querySelector<HTMLButtonElement>('button[data-menu-index="1"]')
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    // First button is auto-focused on mount.
    expect(first).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(second).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(first).toHaveFocus()
  })

  it('Escape closes the menu', () => {
    useElementsStore.setState({ elements: { a: makeDecor('a') } })
    useUIStore.setState({
      selectedIds: ['a'],
      contextMenu: { x: 0, y: 0, elementId: 'a' },
    } as any)
    render(<ContextMenu />)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(useUIStore.getState().contextMenu).toBeNull()
  })

  it('mousedown outside the menu closes it', () => {
    useElementsStore.setState({ elements: { a: makeDecor('a') } })
    useUIStore.setState({
      selectedIds: ['a'],
      contextMenu: { x: 0, y: 0, elementId: 'a' },
    } as any)
    render(<ContextMenu />)
    expect(useUIStore.getState().contextMenu).not.toBeNull()
    act(() => {
      // Simulate a mousedown on the document body, outside the menu.
      fireEvent.mouseDown(document.body)
    })
    expect(useUIStore.getState().contextMenu).toBeNull()
  })

  it('activating Duplicate calls the bound handler and closes the menu', () => {
    useElementsStore.setState({ elements: { a: makeDecor('a') } })
    useUIStore.setState({
      selectedIds: ['a'],
      contextMenu: { x: 0, y: 0, elementId: 'a' },
    } as any)
    const spy = vi.spyOn(useElementsStore.getState(), 'duplicateElements')
    render(<ContextMenu />)
    fireEvent.click(screen.getByRole('menuitem', { name: /Duplicate/ }))
    expect(spy).toHaveBeenCalledWith(['a'])
    expect(useUIStore.getState().contextMenu).toBeNull()
  })

  it('Rename activates inline label editing for the targeted element', () => {
    useElementsStore.setState({ elements: { a: makeDecor('a') } })
    useUIStore.setState({
      selectedIds: ['a'],
      contextMenu: { x: 0, y: 0, elementId: 'a' },
    } as any)
    render(<ContextMenu />)
    fireEvent.click(screen.getByRole('menuitem', { name: /Rename/ }))
    expect(useUIStore.getState().editingLabelId).toBe('a')
    expect(useUIStore.getState().contextMenu).toBeNull()
  })

  it('Lock toggles the element locked flag', () => {
    useElementsStore.setState({ elements: { a: makeDecor('a', { locked: false }) } })
    useUIStore.setState({
      selectedIds: ['a'],
      contextMenu: { x: 0, y: 0, elementId: 'a' },
    } as any)
    render(<ContextMenu />)
    fireEvent.click(screen.getByRole('menuitem', { name: /^Lock/ }))
    expect(useElementsStore.getState().elements['a'].locked).toBe(true)
  })
})
