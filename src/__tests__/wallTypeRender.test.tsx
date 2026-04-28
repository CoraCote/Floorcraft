/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { Stage, Layer } from 'react-konva'
import { WallRenderer } from '../components/editor/Canvas/WallRenderer'
import type { WallElement, WallType } from '../types/elements'

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
  HTMLCanvasElement.prototype.getContext = (() => mockCtx) as unknown as HTMLCanvasElement['getContext']
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
    points: [0, 0, 100, 0],
    thickness: 6,
    wallType: 'solid',
    ...overrides,
  }
}

function renderWall(type: WallType, extra: Partial<WallElement> = {}) {
  let stage: any
  render(
    <Stage width={200} height={200} ref={(s: any) => { stage = s }}>
      <Layer>
        <WallRenderer element={wall({ wallType: type, ...extra })} />
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

function paths(stage: any): any[] {
  const out: any[] = []
  stage.find('Path').forEach((p: any) => out.push(p))
  return out
}

function texts(stage: any): any[] {
  const out: any[] = []
  stage.find('Text').forEach((t: any) => out.push(t))
  return out
}

describe('WallRenderer wall types (P3 polygon body)', () => {
  it('solid → one closed Line polygon, full opacity, no centerline overlay', () => {
    const stage = renderWall('solid')
    const ls = lines(stage)
    expect(ls).toHaveLength(1)
    expect(ls[0].closed()).toBe(true)
    // No accents on solid: no Path centerline overlay.
    expect(paths(stage)).toHaveLength(0)
    // Group opacity wraps the polygon.
    expect(ls[0].getParent().opacity()).toBe(1)
  })

  it('glass → polygon body with translucent group opacity (~0.55)', () => {
    const stage = renderWall('glass')
    const ls = lines(stage)
    expect(ls).toHaveLength(1)
    expect(ls[0].getParent().opacity()).toBeCloseTo(0.55)
  })

  it('half-height → polygon body + secondary dashed rail (Path) on top', () => {
    const stage = renderWall('half-height')
    expect(lines(stage)).toHaveLength(1)
    const ps = paths(stage)
    // One dashed rail Path painted on the centerline.
    expect(ps).toHaveLength(1)
    expect(ps[0].dash()?.length).toBeGreaterThan(0)
    // The rail is non-listening so the underlying polygon stays clickable.
    expect(ps[0].listening()).toBe(false)
  })

  it('demountable → polygon body + dashed centerline overlay + "M" Text marker', () => {
    const stage = renderWall('demountable')
    expect(lines(stage)).toHaveLength(1)
    const ps = paths(stage)
    // Dashed centerline overlay (implied by demountable even without dashStyle).
    expect(ps).toHaveLength(1)
    expect(ps[0].dash()).toEqual([15, 9]) // thickness(6)*2.5, thickness*1.5
    const ts = texts(stage)
    const marker = ts.find((t) => t.text() === 'M')
    expect(marker).toBeTruthy()
  })

  it('explicit dashStyle: dashed → dashed centerline overlay paints on top of polygon', () => {
    const stage = renderWall('solid', { dashStyle: 'dashed' })
    expect(lines(stage)).toHaveLength(1)
    const ps = paths(stage)
    expect(ps).toHaveLength(1)
    expect(ps[0].dash()).toEqual([15, 9])
  })

  it('explicit dashStyle: dotted → short-dash centerline overlay', () => {
    const stage = renderWall('solid', { dashStyle: 'dotted' })
    const ps = paths(stage)
    expect(ps).toHaveLength(1)
    const dash = ps[0].dash()!
    expect(dash[0]).toBeCloseTo(0.1)
    expect(dash[1]).toBeCloseTo(8.4) // thickness(6)*1.4
  })
})
