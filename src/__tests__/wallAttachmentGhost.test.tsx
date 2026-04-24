/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { Stage } from 'react-konva'
import { AttachmentGhost } from '../components/editor/Canvas/AttachmentGhost'
import { useElementsStore } from '../stores/elementsStore'
import type { WallElement } from '../types/elements'

// jsdom does not implement HTMLCanvasElement.getContext; stub it so Konva can
// mount in the test environment without the full `canvas` npm dependency.
beforeAll(() => {
  const mockCtx = {
    scale: () => {},
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    transform: () => {},
    setTransform: () => {},
    drawImage: () => {},
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
    clip: () => {},
    rect: () => {},
    isPointInPath: () => false,
    canvas: { width: 0, height: 0 },
  } as unknown as CanvasRenderingContext2D
  HTMLCanvasElement.prototype.getContext = (() =>
    mockCtx) as unknown as HTMLCanvasElement['getContext']
})

function makeWall(overrides: Partial<WallElement> = {}): WallElement {
  return {
    id: 'wall-1',
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
    points: [0, 0, 200, 0],
    bulges: [0],
    thickness: 6,
    connectedWallIds: [],
    wallType: 'solid',
    ...overrides,
  }
}

function renderGhost(props: {
  tool: string
  cursor: { x: number; y: number } | null
}) {
  let stage: any
  render(
    <Stage width={400} height={400} ref={(s) => { stage = s }}>
      <AttachmentGhost
        tool={props.tool}
        cursor={props.cursor}
        stageScale={1}
        snapPx={24}
      />
    </Stage>,
  )
  return stage
}

/** Count Layer children added by the ghost (Stage has no built-in layers). */
function ghostLayerCount(stage: any): number {
  return (stage?.getLayers() ?? []).length
}

describe('AttachmentGhost', () => {
  beforeEach(() => {
    // Reset the elements store between tests so each test gets a clean slate.
    useElementsStore.setState({ elements: {} })
  })

  it('renders nothing when the active tool is not door/window', () => {
    const stage = renderGhost({ tool: 'select', cursor: { x: 50, y: 5 } })
    expect(ghostLayerCount(stage)).toBe(0)
  })

  it('renders nothing when the cursor is null (cursor left the canvas)', () => {
    useElementsStore.setState({ elements: { 'wall-1': makeWall() } })
    const stage = renderGhost({ tool: 'door', cursor: null })
    expect(ghostLayerCount(stage)).toBe(0)
  })

  it('renders a ghost layer when hovering near a wall with the door tool', () => {
    // Wall runs (0,0) → (200,0). Cursor at (50, 5) is 5 units off the wall
    // — well within the 24-unit snap radius.
    useElementsStore.setState({ elements: { 'wall-1': makeWall() } })
    const stage = renderGhost({ tool: 'door', cursor: { x: 50, y: 5 } })
    expect(ghostLayerCount(stage)).toBe(1)
    // The ghost layer should contain a Group (the transformed door preview).
    const layer = stage.getLayers()[0]
    const kinds: string[] = []
    layer.getChildren().forEach((c: any) => kinds.push(c.getClassName()))
    expect(kinds).toContain('Group')
  })

  it('renders the no-target crosshair when no wall is within snap range', () => {
    // Cursor at (50, 500) — 500 units away from the wall, far outside the
    // 24-unit snap radius. Ghost should render the greyed crosshair, NOT
    // a Group preview.
    useElementsStore.setState({ elements: { 'wall-1': makeWall() } })
    const stage = renderGhost({ tool: 'window', cursor: { x: 50, y: 500 } })
    expect(ghostLayerCount(stage)).toBe(1)
    const layer = stage.getLayers()[0]
    const kinds: string[] = []
    layer.getChildren().forEach((c: any) => kinds.push(c.getClassName()))
    // The crosshair is drawn from a Circle + two Lines; no Group wrapper.
    expect(kinds).not.toContain('Group')
    expect(kinds).toContain('Circle')
    expect(kinds.filter((k) => k === 'Line').length).toBe(2)
  })
})
