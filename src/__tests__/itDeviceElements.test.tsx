import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { Stage, Layer } from 'react-konva'
import {
  isAccessPointElement,
  isNetworkJackElement,
  isDisplayElement,
  isVideoBarElement,
  isBadgeReaderElement,
  isOutletElement,
  isITDevice,
  itLayerOf,
  IT_DEVICE_TYPES,
  type CanvasElement,
  type AccessPointElement,
  type NetworkJackElement,
  type DisplayElement,
  type VideoBarElement,
  type BadgeReaderElement,
  type OutletElement,
  type DeskElement,
  type WallElement,
  type DoorElement,
  type SofaElement,
  type ElementStyle,
} from '../types/elements'
import { getDefaults } from '../lib/constants'
import { AccessPointRenderer } from '../components/editor/Canvas/AccessPointRenderer'
import { NetworkJackRenderer } from '../components/editor/Canvas/NetworkJackRenderer'
import { DisplayRenderer } from '../components/editor/Canvas/DisplayRenderer'
import { VideoBarRenderer } from '../components/editor/Canvas/VideoBarRenderer'
import { BadgeReaderRenderer } from '../components/editor/Canvas/BadgeReaderRenderer'
import { OutletRenderer } from '../components/editor/Canvas/OutletRenderer'

// jsdom does not implement HTMLCanvasElement.getContext; stub it so Konva
// can mount in the test environment without the full canvas npm package.
// Mirrors the pattern in WallRenderer.test.tsx.
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

const baseStyle: ElementStyle = { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 }

function makeAP(): AccessPointElement {
  const d = getDefaults('access-point')!
  return {
    id: 'ap1', type: 'access-point',
    x: 0, y: 0, width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 4,
    label: 'AP-1', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
    model: 'Cisco Meraki MR46',
    deviceStatus: 'live',
  }
}

function makeJack(): NetworkJackElement {
  const d = getDefaults('network-jack')!
  return {
    id: 'j1', type: 'network-jack',
    x: 0, y: 0, width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 4,
    label: 'J-101', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
    jackId: 'J-101',
    cableCategory: 'cat6',
  }
}

function makeDisplay(): DisplayElement {
  const d = getDefaults('display')!
  return {
    id: 'd1', type: 'display',
    x: 0, y: 0, width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 4,
    label: 'Lobby TV', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
    screenSizeInches: 65,
  }
}

function makeVideoBar(): VideoBarElement {
  const d = getDefaults('video-bar')!
  return {
    id: 'vb1', type: 'video-bar',
    x: 0, y: 0, width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 4,
    label: 'VB-1', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
    platform: 'teams',
  }
}

function makeBadgeReader(): BadgeReaderElement {
  const d = getDefaults('badge-reader')!
  return {
    id: 'br1', type: 'badge-reader',
    x: 0, y: 0, width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 4,
    label: 'Reader-A', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
    controlsDoorLabel: 'Main entrance',
  }
}

function makeOutlet(): OutletElement {
  const d = getDefaults('outlet')!
  return {
    id: 'o1', type: 'outlet',
    x: 0, y: 0, width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 3,
    label: 'O-1', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
    outletType: 'duplex',
    voltage: 120,
  }
}

// Non-IT shapes used to assert negative cases for the type guards.
function makeDesk(): DeskElement {
  return {
    id: 'desk1', type: 'desk',
    x: 0, y: 0, width: 72, height: 48,
    rotation: 0, locked: false, groupId: null, zIndex: 2,
    label: 'D-101', visible: true,
    style: baseStyle,
    deskId: 'D-101',
    assignedEmployeeId: null,
    capacity: 1,
  }
}
function makeWall(): WallElement {
  return {
    id: 'w1', type: 'wall',
    x: 0, y: 0, width: 0, height: 0,
    rotation: 0, locked: false, groupId: null, zIndex: 0,
    label: '', visible: true, style: baseStyle,
    points: [0, 0, 100, 0],
    thickness: 4, wallType: 'solid',
  }
}
function makeDoor(): DoorElement {
  return {
    id: 'd1', type: 'door',
    x: 0, y: 0, width: 24, height: 4,
    rotation: 0, locked: false, groupId: null, zIndex: 1,
    label: '', visible: true, style: baseStyle,
    parentWallId: 'w1', positionOnWall: 0.5,
    swingDirection: 'left', openAngle: 90,
  }
}
function makeSofa(): SofaElement {
  return {
    id: 's1', type: 'sofa',
    x: 0, y: 0, width: 200, height: 80,
    rotation: 0, locked: false, groupId: null, zIndex: 1,
    label: 'Sofa', visible: true, style: baseStyle,
  }
}

// Konva renderers must mount inside a Stage > Layer parent. Wrap each
// component-under-test in this harness so the test asserts only that
// the renderer doesn't throw / crash on a representative element.
function mountInStage(node: React.ReactNode) {
  return render(
    <Stage width={400} height={400}>
      <Layer>{node}</Layer>
    </Stage>,
  )
}

describe('IT device elements — IT_DEVICE_TYPES', () => {
  it('contains exactly the six expected type strings', () => {
    expect([...IT_DEVICE_TYPES].sort()).toEqual(
      ['access-point', 'badge-reader', 'display', 'network-jack', 'outlet', 'video-bar'].sort(),
    )
  })
})

describe('IT device elements — type guards', () => {
  it('isAccessPointElement matches only access points', () => {
    expect(isAccessPointElement(makeAP())).toBe(true)
    expect(isAccessPointElement(makeJack() as CanvasElement)).toBe(false)
    expect(isAccessPointElement(makeDesk() as CanvasElement)).toBe(false)
  })
  it('isNetworkJackElement matches only jacks', () => {
    expect(isNetworkJackElement(makeJack())).toBe(true)
    expect(isNetworkJackElement(makeAP() as CanvasElement)).toBe(false)
  })
  it('isDisplayElement matches only displays', () => {
    expect(isDisplayElement(makeDisplay())).toBe(true)
    expect(isDisplayElement(makeVideoBar() as CanvasElement)).toBe(false)
  })
  it('isVideoBarElement matches only video bars', () => {
    expect(isVideoBarElement(makeVideoBar())).toBe(true)
    expect(isVideoBarElement(makeDisplay() as CanvasElement)).toBe(false)
  })
  it('isBadgeReaderElement matches only badge readers', () => {
    expect(isBadgeReaderElement(makeBadgeReader())).toBe(true)
    expect(isBadgeReaderElement(makeOutlet() as CanvasElement)).toBe(false)
  })
  it('isOutletElement matches only outlets', () => {
    expect(isOutletElement(makeOutlet())).toBe(true)
    expect(isOutletElement(makeBadgeReader() as CanvasElement)).toBe(false)
  })
})

describe('IT device elements — isITDevice', () => {
  it('returns true for every IT device type', () => {
    expect(isITDevice(makeAP())).toBe(true)
    expect(isITDevice(makeJack())).toBe(true)
    expect(isITDevice(makeDisplay())).toBe(true)
    expect(isITDevice(makeVideoBar())).toBe(true)
    expect(isITDevice(makeBadgeReader())).toBe(true)
    expect(isITDevice(makeOutlet())).toBe(true)
  })
  it('returns false for non-IT elements (desk/wall/door/sofa)', () => {
    expect(isITDevice(makeDesk() as CanvasElement)).toBe(false)
    expect(isITDevice(makeWall() as CanvasElement)).toBe(false)
    expect(isITDevice(makeDoor() as CanvasElement)).toBe(false)
    expect(isITDevice(makeSofa() as CanvasElement)).toBe(false)
  })
})

describe('IT device elements — itLayerOf', () => {
  it('routes APs and jacks to network', () => {
    expect(itLayerOf(makeAP())).toBe('network')
    expect(itLayerOf(makeJack())).toBe('network')
  })
  it('routes displays and video bars to av', () => {
    expect(itLayerOf(makeDisplay())).toBe('av')
    expect(itLayerOf(makeVideoBar())).toBe('av')
  })
  it('routes badge readers to security', () => {
    expect(itLayerOf(makeBadgeReader())).toBe('security')
  })
  it('routes outlets to power', () => {
    expect(itLayerOf(makeOutlet())).toBe('power')
  })
  it('returns null for non-IT elements', () => {
    expect(itLayerOf(makeDesk() as CanvasElement)).toBe(null)
    expect(itLayerOf(makeWall() as CanvasElement)).toBe(null)
    expect(itLayerOf(makeDoor() as CanvasElement)).toBe(null)
    expect(itLayerOf(makeSofa() as CanvasElement)).toBe(null)
  })
})

describe('IT device renderers — mount without crashing', () => {
  it('AccessPointRenderer renders for a representative element', () => {
    expect(() => mountInStage(<AccessPointRenderer element={makeAP()} />)).not.toThrow()
  })
  it('NetworkJackRenderer renders for a representative element', () => {
    expect(() => mountInStage(<NetworkJackRenderer element={makeJack()} />)).not.toThrow()
  })
  it('DisplayRenderer renders for a representative element', () => {
    expect(() => mountInStage(<DisplayRenderer element={makeDisplay()} />)).not.toThrow()
  })
  it('VideoBarRenderer renders for a representative element', () => {
    expect(() => mountInStage(<VideoBarRenderer element={makeVideoBar()} />)).not.toThrow()
  })
  it('BadgeReaderRenderer renders for a representative element', () => {
    expect(() => mountInStage(<BadgeReaderRenderer element={makeBadgeReader()} />)).not.toThrow()
  })
  it('OutletRenderer renders for a representative element', () => {
    expect(() => mountInStage(<OutletRenderer element={makeOutlet()} />)).not.toThrow()
  })

  // Status overrides exercise different code paths (red stroke when
  // broken, dashed outline when planned). Not visual-regression checks
  // — just smoke tests that the renderers don't throw on those branches.
  it('AccessPointRenderer renders broken status without crashing', () => {
    const ap: AccessPointElement = { ...makeAP(), deviceStatus: 'broken' }
    expect(() => mountInStage(<AccessPointRenderer element={ap} />)).not.toThrow()
  })
  it('OutletRenderer renders planned status without crashing', () => {
    const o: OutletElement = { ...makeOutlet(), deviceStatus: 'planned' }
    expect(() => mountInStage(<OutletRenderer element={o} />)).not.toThrow()
  })
})

describe('IT device defaults — sizes match the M1 spec', () => {
  it('access-point defaults are 30×30', () => {
    const d = getDefaults('access-point')!
    expect(d.width).toBe(30)
    expect(d.height).toBe(30)
  })
  it('network-jack defaults are 18×18', () => {
    const d = getDefaults('network-jack')!
    expect(d.width).toBe(18)
    expect(d.height).toBe(18)
  })
  it('display defaults are 80×16', () => {
    const d = getDefaults('display')!
    expect(d.width).toBe(80)
    expect(d.height).toBe(16)
  })
  it('video-bar defaults are 90×18', () => {
    const d = getDefaults('video-bar')!
    expect(d.width).toBe(90)
    expect(d.height).toBe(18)
  })
  it('badge-reader defaults are 18×24', () => {
    const d = getDefaults('badge-reader')!
    expect(d.width).toBe(18)
    expect(d.height).toBe(24)
  })
  it('outlet defaults are 16×24', () => {
    const d = getDefaults('outlet')!
    expect(d.width).toBe(16)
    expect(d.height).toBe(24)
  })
})
