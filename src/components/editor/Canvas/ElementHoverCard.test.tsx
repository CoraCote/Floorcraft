/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ElementHoverCard } from './ElementHoverCard'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useProjectStore } from '../../../stores/projectStore'
import { DEFAULT_CANVAS_SETTINGS } from '../../../types/project'
import type { DeskElement } from '../../../types/elements'

function desk(overrides: Partial<DeskElement> = {}): DeskElement {
  return {
    id: 'd1',
    type: 'desk',
    x: 100,
    y: 100,
    width: 40,
    height: 20,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: 'D-101',
    assignedEmployeeId: null,
    capacity: 1,
    ...overrides,
  } as DeskElement
}

/**
 * Move the global mouse so the hover card has fresh coords. The card's
 * internal mousemove listener is rAF-throttled, so we run rAF through
 * `act` after dispatching to flush the coords-state update synchronously
 * inside the test.
 */
function moveMouse(x = 200, y = 300) {
  fireEvent.mouseMove(window, { clientX: x, clientY: y })
}

beforeEach(() => {
  // Editor role grants `viewPII`; share-viewer tests override below.
  useProjectStore.setState({
    currentOfficeRole: 'editor',
    impersonatedRole: null,
    currentProject: {
      id: 'p1',
      ownerId: null,
      name: 'Test',
      slug: 'test',
      buildingName: null,
      floors: [],
      activeFloorId: 'f1',
      canvasSettings: { ...DEFAULT_CANVAS_SETTINGS },
      thumbnailUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  } as any)
  useUIStore.setState({
    hoveredId: null,
    selectedIds: [],
    presentationMode: false,
    dragAlignmentGuides: [],
  } as any)
  useElementsStore.setState({ elements: {} } as any)
  useEmployeeStore.setState({ employees: {}, departmentColors: {} } as any)
  useCanvasStore.setState({
    settings: { ...DEFAULT_CANVAS_SETTINGS },
    activeTool: 'select',
    stageX: 0,
    stageY: 0,
    stageScale: 1,
    stageWidth: 800,
    stageHeight: 600,
  } as any)
  // Stub rAF so the rAF-throttled mousemove handler fires its setState
  // synchronously inside act() — otherwise React's scheduler defers the
  // update past the assertion in the same tick.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('ElementHoverCard', () => {
  it('does not render when canvasHoveredId (hoveredId) is null', () => {
    render(<ElementHoverCard />)
    expect(screen.queryByTestId('element-hover-card')).toBeNull()
  })

  it('renders desk label + "Unassigned" after the 200ms delay for an unassigned desk', () => {
    vi.useFakeTimers()
    useElementsStore.setState({ elements: { d1: desk({ id: 'd1' }) } } as any)
    render(<ElementHoverCard />)

    act(() => {
      useUIStore.setState({ hoveredId: 'd1' } as any)
    })
    // Mousemove must arrive while the timer is running so coords are set
    // by the time the card flips to open.
    act(() => {
      moveMouse()
    })
    // Before the debounce elapses, nothing renders.
    expect(screen.queryByTestId('element-hover-card')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    const card = screen.getByTestId('element-hover-card')
    expect(card).toBeInTheDocument()
    expect(card).toHaveTextContent('Desk')
    expect(card).toHaveTextContent('D-101')
    expect(card).toHaveTextContent('Unassigned')
  })

  it('hides the assignee name when viewPII is false (share viewer)', () => {
    vi.useFakeTimers()
    useEmployeeStore.setState({
      employees: {
        e1: {
          id: 'e1',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          status: 'active',
        } as any,
      },
    } as any)
    useElementsStore.setState({
      elements: { d1: desk({ id: 'd1', assignedEmployeeId: 'e1' }) },
    } as any)
    // shareViewer is the synthetic role denied `viewPII`.
    useProjectStore.setState({
      currentOfficeRole: 'shareViewer',
      impersonatedRole: null,
    } as any)

    render(<ElementHoverCard />)
    act(() => {
      useUIStore.setState({ hoveredId: 'd1' } as any)
    })
    act(() => {
      moveMouse()
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    const card = screen.getByTestId('element-hover-card')
    expect(card).toHaveTextContent('Seat assigned')
    expect(card).not.toHaveTextContent('Ada Lovelace')
  })

  it('dismisses on Escape', () => {
    vi.useFakeTimers()
    useElementsStore.setState({ elements: { d1: desk({ id: 'd1' }) } } as any)
    render(<ElementHoverCard />)

    act(() => {
      useUIStore.setState({ hoveredId: 'd1' } as any)
    })
    act(() => {
      moveMouse()
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByTestId('element-hover-card')).toBeInTheDocument()

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(screen.queryByTestId('element-hover-card')).toBeNull()
    // Escape also clears the upstream hovered id so a re-arm doesn't
    // immediately reopen the card on the next render.
    expect(useUIStore.getState().hoveredId).toBeNull()
  })

  it('does not render in presentation mode', () => {
    vi.useFakeTimers()
    useElementsStore.setState({ elements: { d1: desk({ id: 'd1' }) } } as any)
    useUIStore.setState({ presentationMode: true } as any)
    render(<ElementHoverCard />)
    act(() => {
      useUIStore.setState({ hoveredId: 'd1', presentationMode: true } as any)
    })
    act(() => {
      moveMouse()
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.queryByTestId('element-hover-card')).toBeNull()
  })
})
