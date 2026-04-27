/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { Stage } from 'react-konva'
import { ElementRenderer } from '../components/editor/Canvas/ElementRenderer'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useLayerVisibilityStore } from '../stores/layerVisibilityStore'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'
import type {
  CanvasElement,
  WallElement,
  DeskElement,
  FreeTextElement,
  ConferenceRoomElement,
  DecorElement,
} from '../types/elements'

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
  HTMLCanvasElement.prototype.getContext = (() => mockCtx) as unknown as HTMLCanvasElement['getContext']
})

function wall(id: string): WallElement {
  return {
    id, type: 'wall', x: 0, y: 0, width: 0, height: 0, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Wall', visible: true,
    style: { fill: '#000', stroke: '#111', strokeWidth: 4, opacity: 1 },
    points: [0, 0, 100, 0], thickness: 4, wallType: 'solid',
  }
}

function desk(id: string): DeskElement {
  return {
    id, type: 'desk', x: 50, y: 50, width: 40, height: 20, rotation: 0,
    locked: false, groupId: null, zIndex: 2,
    label: 'Desk', visible: true,
    style: { fill: '#eee', stroke: '#999', strokeWidth: 1, opacity: 1 },
    deskId: 'D-1', assignedEmployeeId: null, capacity: 1,
  }
}

function text(id: string): FreeTextElement {
  return {
    id, type: 'free-text', x: 10, y: 10, width: 80, height: 20, rotation: 0,
    locked: false, groupId: null, zIndex: 3,
    label: 'Note', visible: true,
    style: { fill: '#000', stroke: 'transparent', strokeWidth: 0, opacity: 1 },
    text: 'Hello', fontSize: 14,
  }
}

function room(id: string): ConferenceRoomElement {
  return {
    id, type: 'conference-room', x: 200, y: 200, width: 120, height: 80, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Room', visible: true,
    style: { fill: '#eef', stroke: '#88a', strokeWidth: 1, opacity: 1 },
    roomName: 'A', capacity: 4,
  }
}

function couch(id: string): DecorElement {
  return {
    id, type: 'decor', shape: 'couch',
    x: 300, y: 300, width: 60, height: 30, rotation: 0,
    locked: false, groupId: null, zIndex: 2,
    label: 'Couch', visible: true,
    style: { fill: '#f0e0d0', stroke: '#b0a090', strokeWidth: 1, opacity: 1 },
  }
}

function seedElements(...els: CanvasElement[]) {
  const map: Record<string, CanvasElement> = {}
  for (const e of els) map[e.id] = e
  useElementsStore.setState({ elements: map })
}

function renderedIds(stage: any): string[] {
  // ElementRenderer wraps each element in a Konva Group with
  // id="element-<id>". Query every Group's id and strip the prefix.
  const ids: string[] = []
  for (const layer of stage.getLayers()) {
    layer.find('Group').forEach((g: any) => {
      const kid = g.id()
      if (typeof kid === 'string' && kid.startsWith('element-')) {
        ids.push(kid.slice('element-'.length))
      }
    })
  }
  return ids
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useUIStore.setState({ selectedIds: [] } as any)
  useCanvasStore.setState({ settings: { ...DEFAULT_CANVAS_SETTINGS } } as any)
  useLayerVisibilityStore.getState().reset()
})

describe('ElementRenderer layer visibility filter', () => {
  it('renders all categories when every layer is on', () => {
    seedElements(wall('w1'), desk('d1'), room('r1'), couch('c1'), text('t1'))
    let stage: any
    render(
      <Stage width={500} height={500} ref={(s: any) => { stage = s }}>
        <ElementRenderer />
      </Stage>,
    )
    const ids = renderedIds(stage)
    expect(ids).toEqual(expect.arrayContaining(['w1', 'd1', 'r1', 'c1', 't1']))
  })

  it('hiding `seating` filters desks but leaves walls/rooms/furniture/annotations', () => {
    seedElements(wall('w1'), desk('d1'), room('r1'), couch('c1'), text('t1'))
    useLayerVisibilityStore.getState().hide('seating')
    let stage: any
    render(
      <Stage width={500} height={500} ref={(s: any) => { stage = s }}>
        <ElementRenderer />
      </Stage>,
    )
    const ids = renderedIds(stage)
    expect(ids).not.toContain('d1')
    expect(ids).toEqual(expect.arrayContaining(['w1', 'r1', 'c1', 't1']))
  })

  it('hiding `annotations` filters free-text only', () => {
    seedElements(wall('w1'), desk('d1'), text('t1'))
    useLayerVisibilityStore.getState().hide('annotations')
    let stage: any
    render(
      <Stage width={500} height={500} ref={(s: any) => { stage = s }}>
        <ElementRenderer />
      </Stage>,
    )
    const ids = renderedIds(stage)
    expect(ids).not.toContain('t1')
    expect(ids).toEqual(expect.arrayContaining(['w1', 'd1']))
  })

  it('hiding `walls` filters walls, doors, and windows', () => {
    seedElements(wall('w1'), desk('d1'))
    useLayerVisibilityStore.getState().hide('walls')
    let stage: any
    render(
      <Stage width={500} height={500} ref={(s: any) => { stage = s }}>
        <ElementRenderer />
      </Stage>,
    )
    const ids = renderedIds(stage)
    expect(ids).not.toContain('w1')
    expect(ids).toContain('d1')
  })

  it('per-element visible=false still hides even when the category is on', () => {
    const invisibleDesk = { ...desk('d1'), visible: false }
    seedElements(invisibleDesk)
    let stage: any
    render(
      <Stage width={500} height={500} ref={(s: any) => { stage = s }}>
        <ElementRenderer />
      </Stage>,
    )
    expect(renderedIds(stage)).not.toContain('d1')
  })
})
