/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { Stage } from 'react-konva'
import { MeasureOverlay, type MeasureSession } from '../components/editor/Canvas/MeasureOverlay'

// Same canvas-context stub we use in the dimension-layer tests; Konva's
// hit-test layer touches the 2D context during mount even for `listening=false`
// overlays, so we need the full shim.
beforeAll(() => {
  const mockCtx = {
    scale: () => {}, clearRect: () => {}, fillRect: () => {}, strokeRect: () => {},
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

function getLayerTexts(stage: any): string[] {
  const texts: string[] = []
  for (const layer of stage.getLayers()) {
    layer.find('Text').forEach((t: any) => texts.push(t.text()))
  }
  return texts
}

function mount(session: MeasureSession, scale = 1, scaleUnit: 'ft' | 'm' | 'px' = 'ft') {
  let stage: any
  render(
    <Stage width={400} height={400} ref={(s) => { stage = s }}>
      <MeasureOverlay session={session} scale={scale} scaleUnit={scaleUnit} />
    </Stage>,
  )
  return stage
}

describe('MeasureOverlay', () => {
  it('renders nothing when there are no points and no cursor', () => {
    const stage = mount({ points: [], cursor: null, finalised: false })
    expect(getLayerTexts(stage)).toEqual([])
  })

  it('labels the live segment between the last committed point and the cursor', () => {
    // One committed vertex at (0,0); cursor 100 canvas px away → 100 ft at
    // scale=1. No total/area label yet (polyline has exactly one segment).
    const stage = mount(
      { points: [0, 0], cursor: { x: 100, y: 0 }, finalised: false },
      1,
      'ft',
    )
    const texts = getLayerTexts(stage)
    expect(texts).toContain('100.0 ft')
  })

  it('labels each segment and shows a running total for multi-segment sessions', () => {
    // Two committed vertices + cursor → 2 segments (100ft + 50ft) and total 150ft.
    const stage = mount(
      { points: [0, 0, 100, 0], cursor: { x: 100, y: 50 }, finalised: false },
      1,
      'ft',
    )
    const texts = getLayerTexts(stage)
    expect(texts).toContain('100.0 ft')
    expect(texts).toContain('50.0 ft')
    // Total is rendered in a single multi-line label so we search by contains.
    expect(texts.some((t) => t.includes('Total: 150.0 ft'))).toBe(true)
  })

  it('reports polygon area via the shoelace formula once 3+ vertices exist', () => {
    // A 100x100 canvas square closed back to the origin by the cursor.
    // Area = 10000 px² → 10000 ft² at scale=1.
    const stage = mount(
      {
        points: [0, 0, 100, 0, 100, 100],
        cursor: { x: 0, y: 100 },
        finalised: false,
      },
      1,
      'ft',
    )
    const texts = getLayerTexts(stage)
    // Total label contains Area line when 3+ vertices are present.
    expect(texts.some((t) => t.includes('Area: 10000.0 ft\u00B2'))).toBe(true)
  })

  it('still renders labels after finalisation (cursor ignored)', () => {
    // Finalised session keeps vertices + segment labels visible but ignores
    // cursor entirely, so a ghost polyline out to the cursor must not appear.
    const stage = mount(
      {
        points: [0, 0, 100, 0],
        cursor: { x: 100, y: 200 }, // Would be a 200ft live segment if honoured
        finalised: true,
      },
      1,
      'ft',
    )
    const texts = getLayerTexts(stage)
    // Committed segment rendered...
    expect(texts).toContain('100.0 ft')
    // ...but the live leg out to the cursor is NOT present.
    expect(texts).not.toContain('200.0 ft')
  })

  it('skips zero-length segments (e.g. dblclick at same spot)', () => {
    // Two coincident points + cursor far away → only one real segment.
    const stage = mount(
      { points: [50, 50, 50, 50], cursor: { x: 50, y: 150 }, finalised: false },
      1,
      'ft',
    )
    const texts = getLayerTexts(stage)
    // The committed degenerate segment must not produce a "0.0 ft" label.
    expect(texts).not.toContain('0.0 ft')
    // The live 100ft segment is still labelled.
    expect(texts).toContain('100.0 ft')
  })

  it('honours scale + unit (px pass-through vs real-world)', () => {
    // At scale=0.5 ft/px, 100 canvas px → 50 ft.
    const ftStage = mount(
      { points: [0, 0], cursor: { x: 100, y: 0 }, finalised: false },
      0.5,
      'ft',
    )
    expect(getLayerTexts(ftStage)).toContain('50.0 ft')

    // px unit is a pass-through regardless of scale.
    const pxStage = mount(
      { points: [0, 0], cursor: { x: 100, y: 0 }, finalised: false },
      0.5,
      'px',
    )
    expect(getLayerTexts(pxStage)).toContain('100.0 px')
  })
})
