/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AlignDistributeToolbar } from './AlignDistributeToolbar'
import { useElementsStore } from '../../../stores/elementsStore'
import { useUIStore } from '../../../stores/uiStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useProjectStore } from '../../../stores/projectStore'
import type { DecorElement } from '../../../types/elements'
import * as alignmentLib from '../../../lib/alignment'

function decor(id: string, x: number, y: number): DecorElement {
  return {
    id,
    type: 'decor',
    shape: 'armchair',
    x,
    y,
    width: 60,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Armchair',
    visible: true,
    style: { fill: '#C4A57B', stroke: '#6B4423', strokeWidth: 2, opacity: 1 },
  }
}

beforeEach(() => {
  // Editor role so `useCan('editMap')` returns true.
  useProjectStore.setState({
    currentOfficeRole: 'editor',
    impersonatedRole: null,
  } as any)
  useUIStore.setState({
    selectedIds: [],
    presentationMode: false,
  } as any)
  useElementsStore.setState({ elements: {} })
  useCanvasStore.setState({
    stageX: 0,
    stageY: 200,
    stageScale: 1,
  } as any)
})

describe('AlignDistributeToolbar', () => {
  it('does not render when nothing is selected', () => {
    render(<AlignDistributeToolbar />)
    expect(screen.queryByTestId('align-distribute-toolbar')).toBeNull()
  })

  it('does not render with a single selected element', () => {
    useElementsStore.setState({ elements: { a: decor('a', 100, 100) } })
    useUIStore.setState({ selectedIds: ['a'] } as any)
    render(<AlignDistributeToolbar />)
    expect(screen.queryByTestId('align-distribute-toolbar')).toBeNull()
  })

  it('renders with 2 selected and hides distribute buttons', () => {
    useElementsStore.setState({
      elements: { a: decor('a', 100, 100), b: decor('b', 300, 100) },
    })
    useUIStore.setState({ selectedIds: ['a', 'b'] } as any)
    render(<AlignDistributeToolbar />)

    expect(screen.getByTestId('align-distribute-toolbar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Align left' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Align right' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Align top' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Align bottom' })).toBeInTheDocument()
    // Distribute is gated on selectedIds.length >= 3.
    expect(screen.queryByRole('button', { name: 'Distribute horizontally' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Distribute vertically' })).toBeNull()
  })

  it('renders distribute buttons once 3+ elements are selected', () => {
    useElementsStore.setState({
      elements: {
        a: decor('a', 100, 100),
        b: decor('b', 300, 100),
        c: decor('c', 500, 100),
      },
    })
    useUIStore.setState({ selectedIds: ['a', 'b', 'c'] } as any)
    render(<AlignDistributeToolbar />)

    expect(screen.getByRole('button', { name: 'Distribute horizontally' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Distribute vertically' })).toBeInTheDocument()
  })

  it('does not render in presentation mode', () => {
    useElementsStore.setState({
      elements: { a: decor('a', 100, 100), b: decor('b', 300, 100) },
    })
    useUIStore.setState({ selectedIds: ['a', 'b'], presentationMode: true } as any)
    render(<AlignDistributeToolbar />)
    expect(screen.queryByTestId('align-distribute-toolbar')).toBeNull()
  })

  it('does not render for a viewer (no editMap permission)', () => {
    useProjectStore.setState({
      currentOfficeRole: 'viewer',
      impersonatedRole: null,
    } as any)
    useElementsStore.setState({
      elements: { a: decor('a', 100, 100), b: decor('b', 300, 100) },
    })
    useUIStore.setState({ selectedIds: ['a', 'b'] } as any)
    render(<AlignDistributeToolbar />)
    expect(screen.queryByTestId('align-distribute-toolbar')).toBeNull()
  })

  it('clicking Align Left calls alignElements("left") and preserves selection', () => {
    const spy = vi.spyOn(alignmentLib, 'alignElements')
    useElementsStore.setState({
      elements: { a: decor('a', 100, 100), b: decor('b', 300, 100) },
    })
    useUIStore.setState({ selectedIds: ['a', 'b'] } as any)
    render(<AlignDistributeToolbar />)

    fireEvent.click(screen.getByRole('button', { name: 'Align left' }))

    expect(spy).toHaveBeenCalledWith(['a', 'b'], 'left')
    // The toolbar must not clear the selection — operators commonly chain
    // multiple align/distribute clicks and a self-clearing toolbar would
    // dismiss after the first one.
    expect(useUIStore.getState().selectedIds).toEqual(['a', 'b'])
    spy.mockRestore()
  })

  it('clicking Distribute horizontally calls distributeElements("horizontal")', () => {
    const spy = vi.spyOn(alignmentLib, 'distributeElements')
    useElementsStore.setState({
      elements: {
        a: decor('a', 100, 100),
        b: decor('b', 300, 100),
        c: decor('c', 500, 100),
      },
    })
    useUIStore.setState({ selectedIds: ['a', 'b', 'c'] } as any)
    render(<AlignDistributeToolbar />)

    fireEvent.click(screen.getByRole('button', { name: 'Distribute horizontally' }))

    expect(spy).toHaveBeenCalledWith(['a', 'b', 'c'], 'horizontal')
    spy.mockRestore()
  })
})
