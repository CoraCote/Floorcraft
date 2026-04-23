import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { MapView } from '../components/editor/MapView'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useUIStore } from '../stores/uiStore'
import type { DeskElement } from '../types/elements'

function desk(id: string, over: Partial<DeskElement> = {}): DeskElement {
  return {
    id,
    type: 'desk',
    x: over.x ?? 0,
    y: over.y ?? 0,
    width: over.width ?? 60,
    height: over.height ?? 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    visible: true,
    label: '',
    deskId: 'D-1',
    assignedEmployeeId: null,
    capacity: 1,
  } as unknown as DeskElement
}

// Stub focusOnElement so we don't need a real Konva stage in tests.
vi.mock('../lib/canvasFocus', () => ({
  focusOnElement: vi.fn(),
  computeCenteringPosition: vi.fn(),
}))

// Stub out heavy child components — the test only cares about MapView's
// URL-params effect. CanvasStage pulls in Konva which isn't friendly to jsdom.
vi.mock('../components/editor/Canvas/CanvasStage', () => ({
  CanvasStage: () => null,
}))
vi.mock('../components/editor/FloorSwitcher', () => ({
  FloorSwitcher: () => null,
}))
vi.mock('../components/editor/LeftSidebar/ToolSelector', () => ({
  ToolSelector: () => null,
}))
vi.mock('../components/editor/LeftSidebar/ElementLibrary', () => ({
  ElementLibrary: () => null,
}))
vi.mock('../components/editor/RightSidebar/RightSidebar', () => ({
  RightSidebar: () => null,
}))
vi.mock('../components/editor/StatusBar', () => ({
  StatusBar: () => null,
}))
vi.mock('../components/editor/KeyboardShortcutsOverlay', () => ({
  KeyboardShortcutsOverlay: () => null,
}))
vi.mock('../components/editor/Minimap', () => ({
  Minimap: () => null,
}))

beforeEach(async () => {
  const { focusOnElement } = await import('../lib/canvasFocus')
  vi.mocked(focusOnElement).mockClear()
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [
      { id: 'f1', name: 'Floor 1', order: 0, elements: { d1: desk('d1', { x: 200, y: 200 }) } },
      { id: 'f2', name: 'Floor 2', order: 1, elements: {} },
    ],
    activeFloorId: 'f2',
  } as never)
  useUIStore.setState({ selectedIds: [], flashingElementId: null })
})

describe('MapView — ?seat + ?floor handling', () => {
  it('switches to the named floor, selects the seat, and calls focusOnElement', async () => {
    const { focusOnElement } = await import('../lib/canvasFocus')
    render(
      <MemoryRouter initialEntries={['/t/t1/o/o1/map?floor=f1&seat=d1']}>
        <Routes>
          <Route path="/t/:teamSlug/o/:officeSlug/map" element={<MapView />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(useFloorStore.getState().activeFloorId).toBe('f1')
    expect(useUIStore.getState().selectedIds).toEqual(['d1'])
    expect(focusOnElement).toHaveBeenCalledWith(
      expect.objectContaining({ x: 200, y: 200, width: 60, height: 60 }),
      'd1',
    )
  })

  it('does nothing when params are absent', async () => {
    const { focusOnElement } = await import('../lib/canvasFocus')
    render(
      <MemoryRouter initialEntries={['/t/t1/o/o1/map']}>
        <Routes>
          <Route path="/t/:teamSlug/o/:officeSlug/map" element={<MapView />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(useFloorStore.getState().activeFloorId).toBe('f2')
    expect(useUIStore.getState().selectedIds).toEqual([])
    expect(focusOnElement).not.toHaveBeenCalled()
  })
})
