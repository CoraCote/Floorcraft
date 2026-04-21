/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { Stage } from 'react-konva'
import { WallEditOverlay } from '../components/editor/Canvas/WallEditOverlay'
import { applyBulgeFromDrag } from '../lib/wallEditing'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import type { WallElement } from '../types/elements'

// jsdom lacks canvas; stub getContext so Konva can mount.
beforeAll(() => {
  const mockCtx = {
    scale: () => {},
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    arcTo: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    fill: () => {},
    stroke: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    transform: () => {},
    setTransform: () => {},
    drawImage: () => {},
    measureText: () => ({
      width: 0,
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
    }),
    fillText: () => {},
    strokeText: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
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

function seedWall(partial: Partial<WallElement> = {}): WallElement {
  const w: WallElement = {
    id: 'w1',
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
    points: [0, 0, 100, 0, 200, 0],
    bulges: [0, 0],
    thickness: 6,
    connectedWallIds: [],
    ...partial,
  }
  useElementsStore.setState({ elements: { [w.id]: w } })
  return w
}

function renderOverlay() {
  let stage: any
  const result = render(
    <Stage width={400} height={300} ref={(s: any) => (stage = s)}>
      <WallEditOverlay />
    </Stage>,
  )
  return { ...result, getStage: () => stage }
}

describe('WallEditOverlay', () => {
  beforeEach(() => {
    useElementsStore.setState({ elements: {} })
    useUIStore.setState({ selectedIds: [] })
  })

  it('renders nothing when no wall is selected', () => {
    seedWall()
    useUIStore.setState({ selectedIds: [] })
    const { getStage } = renderOverlay()
    const stage = getStage()
    const circles = stage ? stage.find('Circle') : []
    expect(circles.length).toBe(0)
  })

  it('renders N endpoint handles + N-1 midpoint handles', () => {
    seedWall() // 3 vertices → 2 segments → 3 endpoint + 2 midpoint handles
    useUIStore.setState({ selectedIds: ['w1'] })
    const { getStage } = renderOverlay()
    const stage = getStage()
    const all = stage ? stage.find('Circle') : []
    const endpoints = all.filter(
      (n: any) => n.name() === 'wall-endpoint-handle',
    )
    const midpoints = all.filter(
      (n: any) => n.name() === 'wall-midpoint-handle',
    )
    expect(endpoints).toHaveLength(3)
    expect(midpoints).toHaveLength(2)
  })

  it('dragging a midpoint perpendicular to chord patches bulges[i]', () => {
    seedWall()
    useUIStore.setState({ selectedIds: ['w1'] })
    renderOverlay()
    act(() => {
      applyBulgeFromDrag('w1', 0, { x: 50, y: -20 })
    })
    const w = useElementsStore.getState().elements['w1'] as WallElement
    expect(w.bulges![0]).not.toBe(0)
  })

  it('dragging midpoint back to the chord snaps bulges[i] to 0', () => {
    seedWall({ bulges: [15, 0] })
    useUIStore.setState({ selectedIds: ['w1'] })
    renderOverlay()
    act(() => {
      applyBulgeFromDrag('w1', 0, { x: 50, y: 0.5 }) // within deadzone
    })
    const w = useElementsStore.getState().elements['w1'] as WallElement
    expect(w.bulges![0]).toBe(0)
  })

  it('dragging past chordLength/2 clamps the committed bulge', () => {
    seedWall()
    useUIStore.setState({ selectedIds: ['w1'] })
    renderOverlay()
    act(() => {
      applyBulgeFromDrag('w1', 0, { x: 50, y: -500 }) // huge pull
    })
    const w = useElementsStore.getState().elements['w1'] as WallElement
    // chord of segment 0 = 100 → clamp |bulge| ≤ 50
    expect(Math.abs(w.bulges![0])).toBeCloseTo(50, 1)
  })
})
