/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { Stage } from 'react-konva'
import { DimensionLayer } from '../components/editor/Canvas/DimensionLayer'
import { useElementsStore } from '../stores/elementsStore'
import { useCanvasStore } from '../stores/canvasStore'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'
import type { WallElement } from '../types/elements'

beforeAll(() => {
  const mockCtx = {
    scale: () => {},
    clearRect: () => {}, fillRect: () => {}, strokeRect: () => {},
    beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
    arc: () => {}, arcTo: () => {}, bezierCurveTo: () => {}, quadraticCurveTo: () => {},
    fill: () => {}, stroke: () => {}, save: () => {}, restore: () => {},
    translate: () => {}, rotate: () => {}, transform: () => {}, setTransform: () => {},
    drawImage: () => {},
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
    fillText: () => {}, strokeText: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
    clip: () => {}, rect: () => {}, isPointInPath: () => false,
    canvas: { width: 0, height: 0 },
  } as unknown as CanvasRenderingContext2D
  HTMLCanvasElement.prototype.getContext = (() =>
    mockCtx) as unknown as HTMLCanvasElement['getContext']
})

function wall(points: number[]): WallElement {
  return {
    id: 'w1', type: 'wall',
    x: 0, y: 0, width: 0, height: 0, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Wall', visible: true,
    style: { fill: '#000', stroke: '#111', strokeWidth: 4, opacity: 1 },
    points, thickness: 4, wallType: 'solid',
  }
}

function getLayerTexts(stage: any): string[] {
  // The DimensionLayer renders <Label><Tag/><Text text=.../></Label>.
  // Find every Text node under any layer and return its text prop.
  const texts: string[] = []
  for (const layer of stage.getLayers()) {
    layer.find('Text').forEach((t: any) => texts.push(t.text()))
  }
  return texts
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useCanvasStore.setState({ settings: { ...DEFAULT_CANVAS_SETTINGS } } as any)
})

describe('DimensionLayer', () => {
  it('renders nothing when showDimensions is false', () => {
    useElementsStore.setState({ elements: { w1: wall([0, 0, 100, 0]) } })
    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <DimensionLayer />
      </Stage>,
    )
    expect(getLayerTexts(stage)).toEqual([])
  })

  it('renders a label per segment with length * scale + scaleUnit', () => {
    useCanvasStore.setState({
      settings: { ...DEFAULT_CANVAS_SETTINGS, showDimensions: true, scale: 0.1, scaleUnit: 'ft' },
    } as any)
    // Two segments: horizontal (100px) + vertical (50px).
    useElementsStore.setState({
      elements: { w1: wall([0, 0, 100, 0, 100, 50]) },
    })

    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <DimensionLayer />
      </Stage>,
    )

    const texts = getLayerTexts(stage)
    expect(texts).toContain('10.0 ft')
    expect(texts).toContain('5.0 ft')
  })

  it('skips segments shorter than the minimum threshold', () => {
    useCanvasStore.setState({
      settings: { ...DEFAULT_CANVAS_SETTINGS, showDimensions: true, scale: 1, scaleUnit: 'ft' },
    } as any)
    // 2px segment is below threshold (4px).
    useElementsStore.setState({
      elements: { w1: wall([0, 0, 2, 0, 10, 0]) },
    })

    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <DimensionLayer />
      </Stage>,
    )

    const texts = getLayerTexts(stage)
    // Only the 8px segment should produce a label.
    expect(texts).toEqual(['8.0 ft'])
  })
})
