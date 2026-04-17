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
  // Cast through unknown: getContext is an overloaded signature returning
  // different context types per id; this mock only covers '2d', which is
  // all Konva needs.
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
    connectedWallIds: [],
    ...overrides,
  }
}

/**
 * Collect the Konva class names rendered for a wall. The renderer now emits
 * a SINGLE <Path> regardless of whether any segment is curved — this is
 * intentional so Konva's node identity stays stable when the user toggles
 * a segment between straight and curved during an edit. The previous
 * behavior (swap between Line and Path) forced react-konva to destroy and
 * recreate the node, disrupting Transformer refs and in-flight drags.
 */
function konvaKindsFor(el: WallElement): string[] {
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
  const kinds: string[] = []
  // The renderer no longer wraps in an inner <Group>; its node is a direct
  // child of the test Layer. Collect all non-layer descendants.
  const layer = stage?.findOne('Layer')
  layer?.getChildren().forEach((c: any) => kinds.push(c.getClassName()))
  return kinds
}

describe('WallRenderer', () => {
  it('bulges undefined → single Path', () => {
    expect(konvaKindsFor(wall({ bulges: undefined }))).toEqual(['Path'])
  })

  it('bulges all zero → single Path (straight segments become L commands)', () => {
    expect(konvaKindsFor(wall({ bulges: [0, 0] }))).toEqual(['Path'])
  })

  it('any non-zero bulge → single Path', () => {
    expect(konvaKindsFor(wall({ bulges: [25, 0] }))).toEqual(['Path'])
  })

  it('negative bulge still a single Path (sign does not change node type)', () => {
    expect(konvaKindsFor(wall({ bulges: [0, -25] }))).toEqual(['Path'])
  })

  it('mixed zero + non-zero bulges still a single Path', () => {
    expect(konvaKindsFor(wall({ bulges: [0, 10, 0] }))).toEqual(['Path'])
  })
})
