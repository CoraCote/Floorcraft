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
  HTMLCanvasElement.prototype.getContext = () => mockCtx
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
    connectedWallIds: [],
    ...overrides,
  }
}

/** Snapshot the Konva node types produced for a given wall. */
function konvaKindsFor(el: WallElement): string[] {
  let stage: any
  const setStage = (s: any) => { stage = s }
  render(
    <Stage width={200} height={200} ref={setStage}>
      <Layer>
        <WallRenderer element={el} />
      </Layer>
    </Stage>,
  )
  const kinds: string[] = []
  stage.findOne('Group')?.getChildren().forEach((c: any) => kinds.push(c.getClassName()))
  return kinds
}

describe('WallRenderer', () => {
  it('bulges undefined → Line fast path', () => {
    expect(konvaKindsFor(wall({ bulges: undefined }))).toEqual(['Line'])
  })

  it('bulges all zero → Line fast path', () => {
    expect(konvaKindsFor(wall({ bulges: [0, 0] }))).toEqual(['Line'])
  })

  it('any non-zero bulge → Path', () => {
    expect(konvaKindsFor(wall({ bulges: [25, 0] }))).toEqual(['Path'])
  })

  it('negative bulge still routes to Path (bulge sign does not matter)', () => {
    expect(konvaKindsFor(wall({ bulges: [0, -25] }))).toEqual(['Path'])
  })

  it('mixed zero + non-zero bulges route to Path (any non-zero wins)', () => {
    expect(konvaKindsFor(wall({ bulges: [0, 10, 0] }))).toEqual(['Path'])
  })
})
