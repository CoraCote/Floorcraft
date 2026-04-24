/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { Stage } from 'react-konva'
import { AnnotationLayer } from '../components/editor/Canvas/AnnotationLayer'
import { useAnnotationsStore } from '../stores/annotationsStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import type { CanvasElement } from '../types/elements'

// Canvas mock for Konva — matches neighborhoodLayerRender.test setup.
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

function makeDesk(id: string, x: number, y: number): CanvasElement {
  return {
    id,
    type: 'desk',
    x,
    y,
    width: 60,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Desk',
    visible: true,
    style: { fill: '#ffffff', stroke: '#000000', strokeWidth: 1, opacity: 1 },
    deskId: '1',
    assignedEmployeeId: null,
    capacity: 1,
  } as CanvasElement
}

beforeEach(() => {
  useAnnotationsStore.getState().clearAll()
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({ activeFloorId: 'floor-1' })
})

describe('AnnotationLayer', () => {
  it('renders nothing when there are no annotations', () => {
    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AnnotationLayer onPinClick={() => {}} />
      </Stage>,
    )
    expect(stage.getLayers()[0].find('Circle')).toHaveLength(0)
  })

  it('renders one pin per OPEN annotation on the active floor', () => {
    useElementsStore.setState({
      elements: { desk1: makeDesk('desk1', 100, 100) },
    })
    useAnnotationsStore.getState().addAnnotation({
      body: 'element-anchored',
      authorName: 'a',
      anchor: { type: 'element', elementId: 'desk1' },
    })
    useAnnotationsStore.getState().addAnnotation({
      body: 'floor-anchored',
      authorName: 'a',
      anchor: { type: 'floor-position', floorId: 'floor-1', x: 200, y: 200 },
    })
    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AnnotationLayer onPinClick={() => {}} />
      </Stage>,
    )
    // One Circle per pin.
    expect(stage.getLayers()[0].find('Circle')).toHaveLength(2)
  })

  it('hides resolved annotations', () => {
    useElementsStore.setState({
      elements: { desk1: makeDesk('desk1', 100, 100) },
    })
    const open = useAnnotationsStore.getState().addAnnotation({
      body: 'open',
      authorName: 'a',
      anchor: { type: 'element', elementId: 'desk1' },
    })
    const resolved = useAnnotationsStore.getState().addAnnotation({
      body: 'done',
      authorName: 'a',
      anchor: { type: 'element', elementId: 'desk1' },
    })
    useAnnotationsStore
      .getState()
      .setResolved(resolved, '2026-04-24T00:00:00.000Z')
    // Sanity: still in the store so the panel can list it.
    expect(useAnnotationsStore.getState().annotations[resolved].resolvedAt)
      .toBeTruthy()
    expect(useAnnotationsStore.getState().annotations[open].resolvedAt).toBeNull()

    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AnnotationLayer onPinClick={() => {}} />
      </Stage>,
    )
    // Only the open one renders.
    expect(stage.getLayers()[0].find('Circle')).toHaveLength(1)
  })

  it('skips element-anchored annotations whose element is missing', () => {
    // desk1 not added to the element store — the annotation references
    // an id that no longer resolves, so the pin is silently dropped.
    useAnnotationsStore.getState().addAnnotation({
      body: 'orphan',
      authorName: 'a',
      anchor: { type: 'element', elementId: 'desk1' },
    })
    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AnnotationLayer onPinClick={() => {}} />
      </Stage>,
    )
    expect(stage.getLayers()[0].find('Circle')).toHaveLength(0)
  })

  it('skips floor-position annotations on other floors', () => {
    useAnnotationsStore.getState().addAnnotation({
      body: 'other floor',
      authorName: 'a',
      anchor: { type: 'floor-position', floorId: 'floor-2', x: 100, y: 100 },
    })
    useAnnotationsStore.getState().addAnnotation({
      body: 'active floor',
      authorName: 'a',
      anchor: { type: 'floor-position', floorId: 'floor-1', x: 200, y: 200 },
    })
    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AnnotationLayer onPinClick={() => {}} />
      </Stage>,
    )
    expect(stage.getLayers()[0].find('Circle')).toHaveLength(1)
  })
})
