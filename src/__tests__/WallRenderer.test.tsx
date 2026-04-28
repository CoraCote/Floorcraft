/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { Stage, Layer } from 'react-konva'
import { WallRenderer } from '../components/editor/Canvas/WallRenderer'
import type { WallElement } from '../types/elements'

// jsdom does not implement HTMLCanvasElement.getContext; stub it so Konva can
// mount in the test environment without the full canvas npm package.
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
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
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

function wall(overrides: Partial<WallElement> = {}): WallElement {
  return {
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
    points: [0, 0, 100, 0, 100, 100],
    thickness: 6,
    wallType: 'solid',
    ...overrides,
  }
}

/**
 * Render a wall and return the stage so tests can introspect Konva nodes.
 * Walls now emit a `<Line closed>` polygon body plus optional accents
 * (half-height rail, demountable "M", dashed centerline overlay) — the
 * polygon is the stable surface, accents are conditional.
 */
function renderWall(el: WallElement) {
  let stage: any
  const setStage = (s: any) => {
    stage = s
  }
  render(
    <Stage width={200} height={200} ref={setStage}>
      <Layer>
        <WallRenderer element={el} />
      </Layer>
    </Stage>,
  )
  return stage
}

function lines(stage: any): any[] {
  const out: any[] = []
  stage.find('Line').forEach((l: any) => out.push(l))
  return out
}

describe('WallRenderer (P3 polygon body)', () => {
  it('renders a single closed Line polygon for a straight wall', () => {
    const stage = renderWall(wall({ points: [0, 0, 100, 0], bulges: undefined }))
    const ls = lines(stage)
    expect(ls).toHaveLength(1)
    const poly = ls[0]
    expect(poly.closed()).toBe(true)
    // Polygon has 4 vertices for a single straight segment (8 numbers).
    expect(poly.points()).toHaveLength(8)
    // Fill is set (not undefined / not transparent).
    expect(poly.fill()).toBeTruthy()
  })

  it('selection: outline switches to the selection color', () => {
    // Default (unselected): outline uses the wall's stored stroke (#111827).
    const stage1 = renderWall(wall({ id: 'a' }))
    const poly1 = lines(stage1)[0]
    expect(poly1.stroke()).toBe('#111827')
    // We don't have a real selectedIds fixture here — exercise the path by
    // rendering with the same id NOT in selectedIds, since the test stub
    // returns an empty array. Selection-active assertion lives in the
    // wallTypeRender test where we exercise the selection store; here we
    // just confirm the outline IS a real color when not selected.
    expect(poly1.strokeWidth()).toBeGreaterThan(0)
  })

  it('any non-zero bulge still emits a single closed Line (node identity stable)', () => {
    const stage = renderWall(wall({ bulges: [25, 0] }))
    const ls = lines(stage)
    expect(ls).toHaveLength(1)
    expect(ls[0].closed()).toBe(true)
  })

  it('mixed zero + non-zero bulges still a single closed Line', () => {
    const stage = renderWall(wall({ bulges: [0, 10, 0] }))
    const ls = lines(stage)
    expect(ls).toHaveLength(1)
    expect(ls[0].closed()).toBe(true)
  })

  it('hit testing: polygon listens (clickable) when wall is unlocked', () => {
    const stage = renderWall(wall({ locked: false }))
    const poly = lines(stage)[0]
    expect(poly.listening()).toBe(true)
  })

  it('hit testing: polygon does NOT listen when wall is locked', () => {
    const stage = renderWall(wall({ locked: true }))
    const poly = lines(stage)[0]
    expect(poly.listening()).toBe(false)
  })
})
