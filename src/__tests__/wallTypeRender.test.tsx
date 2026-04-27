/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { Stage, Layer } from 'react-konva'
import { WallRenderer } from '../components/editor/Canvas/WallRenderer'
import type { WallElement, WallType } from '../types/elements'

// jsdom does not implement HTMLCanvasElement.getContext; stub it so Konva
// can mount. We only need the identity of the nodes + their props, not a
// real draw, so a no-op 2d context is enough.
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

function renderWall(type: WallType) {
  let stage: any
  render(
    <Stage width={200} height={200} ref={(s: any) => { stage = s }}>
      <Layer>
        <WallRenderer element={wall({ wallType: type })} />
      </Layer>
    </Stage>,
  )
  return stage
}

function paths(stage: any): any[] {
  // Walk every descendant and pick out every Path node, regardless of the
  // Group nesting the renderer introduces.
  const out: any[] = []
  stage.find('Path').forEach((p: any) => out.push(p))
  return out
}

function texts(stage: any): any[] {
  const out: any[] = []
  stage.find('Text').forEach((t: any) => out.push(t))
  return out
}

describe('WallRenderer wall types', () => {
  it('solid → one Path, full opacity, default stroke, no dash', () => {
    const stage = renderWall('solid')
    const ps = paths(stage)
    expect(ps).toHaveLength(1)
    expect(ps[0].getAttr('stroke')).toBe('#111827')
    // Group opacity wraps the stroke — assert via the wrapping node.
    const group = ps[0].getParent()
    expect(group.opacity()).toBe(1)
    expect(ps[0].dash()).toBeUndefined()
  })

  it('glass → lighter stroke + 0.4 opacity on wrapping group', () => {
    const stage = renderWall('glass')
    const ps = paths(stage)
    expect(ps).toHaveLength(1)
    expect(ps[0].getAttr('stroke')).toBe('#93C5FD')
    expect(ps[0].getParent().opacity()).toBeCloseTo(0.4)
  })

  it('half-height → a secondary Path (dashed rail) is painted on top', () => {
    const stage = renderWall('half-height')
    const ps = paths(stage)
    // Main stroke + dashed rail = two Paths. The main path has no dash;
    // the rail path carries the dash array.
    expect(ps).toHaveLength(2)
    const dashed = ps.find((p) => p.dash() && p.dash().length > 0)
    expect(dashed).toBeTruthy()
    // Rail is thinner than the main stroke (signals "short wall").
    const undashed = ps.find((p) => !p.dash() || p.dash().length === 0)
    expect(dashed.strokeWidth()).toBeLessThan(undashed.strokeWidth())
  })

  it('demountable → dashed main stroke + an "M" Text marker at the midpoint', () => {
    const stage = renderWall('demountable')
    const ps = paths(stage)
    expect(ps).toHaveLength(1)
    // Dash is implied by wallType even without explicit dashStyle.
    expect(ps[0].dash()).toEqual([15, 9]) // thickness(6) * 2.5, thickness * 1.5
    const ts = texts(stage)
    const marker = ts.find((t) => t.text() === 'M')
    expect(marker).toBeTruthy()
  })
})
