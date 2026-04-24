/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { Stage } from 'react-konva'
import { NeighborhoodLayer } from '../components/editor/Canvas/NeighborhoodLayer'
import { useNeighborhoodStore } from '../stores/neighborhoodStore'
import { useFloorStore } from '../stores/floorStore'
import type { Neighborhood } from '../types/neighborhood'

// Canvas mock — Konva paints through getContext('2d'); jsdom returns
// null for it. Mirrors the DimensionLayer test setup.
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

function nb(overrides: Partial<Neighborhood> = {}): Neighborhood {
  return {
    id: 'n1',
    name: 'Engineering Pod A',
    color: '#3B82F6',
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    floorId: 'floor-1',
    ...overrides,
  }
}

beforeEach(() => {
  useNeighborhoodStore.getState().clearAll()
  useFloorStore.setState({ activeFloorId: 'floor-1' })
})

describe('NeighborhoodLayer', () => {
  it('renders nothing when there are no neighborhoods', () => {
    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <NeighborhoodLayer />
      </Stage>,
    )
    const allLayers = stage.getLayers()
    expect(allLayers).toHaveLength(1)
    expect(allLayers[0].find('Rect')).toHaveLength(0)
    expect(allLayers[0].find('Text')).toHaveLength(0)
  })

  it('renders one rectangle and one label per neighborhood on the active floor', () => {
    useNeighborhoodStore.getState().addNeighborhood(nb({ id: 'n1', name: 'Pod A' }))
    useNeighborhoodStore.getState().addNeighborhood(nb({ id: 'n2', name: 'Pod B', x: 300, y: 200 }))

    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <NeighborhoodLayer />
      </Stage>,
    )
    const layer = stage.getLayers()[0]
    // One Rect per neighborhood.
    expect(layer.find('Rect')).toHaveLength(2)
    // One Text label per neighborhood, with the name as the text content.
    const texts = layer.find('Text').map((t: any) => t.text()).sort()
    expect(texts).toEqual(['Pod A', 'Pod B'])
  })

  it('ignores neighborhoods on other floors', () => {
    useNeighborhoodStore.getState().addNeighborhood(nb({ id: 'n1', floorId: 'floor-1' }))
    useNeighborhoodStore.getState().addNeighborhood(nb({ id: 'n2', floorId: 'floor-2' }))
    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <NeighborhoodLayer />
      </Stage>,
    )
    const layer = stage.getLayers()[0]
    expect(layer.find('Rect')).toHaveLength(1)
    expect(layer.find('Text')).toHaveLength(1)
  })
})
