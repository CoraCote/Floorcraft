import { describe, it, expect, beforeAll } from 'vitest'
import {
  isAccessPointElement,
  isNetworkJackElement,
  isDisplayElement,
  isVideoBarElement,
  isBadgeReaderElement,
  isOutletElement,
  type CanvasElement,
  type AccessPointElement,
  type NetworkJackElement,
  type DisplayElement,
  type VideoBarElement,
  type BadgeReaderElement,
  type OutletElement,
  type ElementStyle,
} from '../types/elements'
import { getDefaults } from '../lib/constants'
import { loadAutoSave } from '../lib/offices/loadFromLegacyPayload'

const SAVE_KEY = 'floocraft-autosave'

// localStorage shim — Node 25's experimental localStorage doesn't expose
// `.clear()`; mirror the pattern used in furnitureCatalog.test.ts.
beforeAll(() => {
  const store = new Map<string, string>()
  const shim: Storage = {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => { store.delete(k) },
    setItem: (k, v) => { store.set(k, String(v)) },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    configurable: true,
    writable: true,
  })
})

const baseStyle: ElementStyle = { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 }

function makeAP(): AccessPointElement {
  const d = getDefaults('access-point')!
  return {
    id: 'ap1', type: 'access-point',
    x: 12, y: 34, width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 4,
    label: 'AP-1', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
    model: 'Cisco Meraki MR46',
    serialNumber: 'Q2XX-AAAA-BBBB',
    macAddress: 'aa:bb:cc:dd:ee:ff',
    ipAddress: '10.0.1.42',
    vendor: 'Acme IT',
    installDate: '2025-09-15',
    deviceStatus: 'live',
  }
}
function makeJack(): NetworkJackElement {
  const d = getDefaults('network-jack')!
  return {
    id: 'j1', type: 'network-jack',
    x: 50, y: 50, width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 4,
    label: 'J-101', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
    jackId: 'J-101',
    cableCategory: 'cat6',
    upstreamSwitchLabel: 'IDF-A',
    upstreamSwitchPort: 'Gi1/0/24',
  }
}
function makeDisplay(): DisplayElement {
  const d = getDefaults('display')!
  return {
    id: 'd1', type: 'display',
    x: 70, y: 80, width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 4,
    label: 'Lobby TV', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
    model: 'Samsung QM55B',
    screenSizeInches: 55,
    connectedDevice: 'Apple TV',
  }
}
function makeVideoBar(): VideoBarElement {
  const d = getDefaults('video-bar')!
  return {
    id: 'vb1', type: 'video-bar',
    x: 90, y: 100, width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 4,
    label: 'VB-1', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
    model: 'Logitech Rally Bar',
    platform: 'teams',
  }
}
function makeBadgeReader(): BadgeReaderElement {
  const d = getDefaults('badge-reader')!
  return {
    id: 'br1', type: 'badge-reader',
    x: 110, y: 120, width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 4,
    label: 'Reader-A', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
    model: 'HID Signo 20',
    controlsDoorLabel: 'Main entrance',
  }
}
function makeOutlet(): OutletElement {
  const d = getDefaults('outlet')!
  return {
    id: 'o1', type: 'outlet',
    x: 130, y: 140, width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 3,
    label: 'O-1', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
    outletType: 'duplex',
    voltage: 120,
    circuit: 'Panel A · Breaker 12',
  }
}

describe('IT device migration — round-trip through loadFromLegacyPayload', () => {
  it('payload with all six new IT types loads without dropping or mutating any of them', () => {
    const elements: Record<string, CanvasElement> = {
      ap1: makeAP(),
      j1:  makeJack(),
      d1:  makeDisplay(),
      vb1: makeVideoBar(),
      br1: makeBadgeReader(),
      o1:  makeOutlet(),
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ elements, employees: {} }))

    const loaded = loadAutoSave()
    expect(loaded).not.toBeNull()
    const out = loaded!.elements

    // Same six ids out as in.
    expect(Object.keys(out).sort()).toEqual(['ap1', 'br1', 'd1', 'j1', 'o1', 'vb1'])

    // Each survives the trip with its discriminant intact.
    expect(isAccessPointElement(out.ap1 as CanvasElement)).toBe(true)
    expect(isNetworkJackElement(out.j1 as CanvasElement)).toBe(true)
    expect(isDisplayElement(out.d1 as CanvasElement)).toBe(true)
    expect(isVideoBarElement(out.vb1 as CanvasElement)).toBe(true)
    expect(isBadgeReaderElement(out.br1 as CanvasElement)).toBe(true)
    expect(isOutletElement(out.o1 as CanvasElement)).toBe(true)

    // Type-specific attributes survive verbatim — the migration must
    // NOT scrub fields it doesn't know about.
    const ap = out.ap1 as AccessPointElement
    expect(ap.model).toBe('Cisco Meraki MR46')
    expect(ap.serialNumber).toBe('Q2XX-AAAA-BBBB')
    expect(ap.macAddress).toBe('aa:bb:cc:dd:ee:ff')
    expect(ap.ipAddress).toBe('10.0.1.42')
    expect(ap.vendor).toBe('Acme IT')
    expect(ap.installDate).toBe('2025-09-15')
    expect(ap.deviceStatus).toBe('live')

    const j = out.j1 as NetworkJackElement
    expect(j.jackId).toBe('J-101')
    expect(j.cableCategory).toBe('cat6')
    expect(j.upstreamSwitchLabel).toBe('IDF-A')
    expect(j.upstreamSwitchPort).toBe('Gi1/0/24')

    const d = out.d1 as DisplayElement
    expect(d.model).toBe('Samsung QM55B')
    expect(d.screenSizeInches).toBe(55)
    expect(d.connectedDevice).toBe('Apple TV')

    const vb = out.vb1 as VideoBarElement
    expect(vb.model).toBe('Logitech Rally Bar')
    expect(vb.platform).toBe('teams')

    const br = out.br1 as BadgeReaderElement
    expect(br.model).toBe('HID Signo 20')
    expect(br.controlsDoorLabel).toBe('Main entrance')

    const o = out.o1 as OutletElement
    expect(o.outletType).toBe('duplex')
    expect(o.voltage).toBe(120)
    expect(o.circuit).toBe('Panel A · Breaker 12')

    // Positions and base BaseElement fields survive.
    expect(out.ap1.x).toBe(12)
    expect(out.ap1.y).toBe(34)
    expect(out.o1.zIndex).toBe(3)
  })

  it('payload mixing new IT types with legacy walls does not corrupt either', () => {
    const elements = {
      ap1: makeAP(),
      // Legacy wall WITHOUT bulges/connectedWallIds/wallType — exercises
      // the wall back-fill path so we know the IT types don't share a
      // code path that would accidentally depend on it.
      w1: {
        id: 'w1', type: 'wall',
        x: 0, y: 0, width: 0, height: 0,
        rotation: 0, locked: false, groupId: null, zIndex: 0,
        label: '', visible: true, style: baseStyle,
        points: [0, 0, 100, 0, 200, 0],
        thickness: 4,
      },
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ elements, employees: {} }))
    const loaded = loadAutoSave()
    expect(loaded).not.toBeNull()
    const out = loaded!.elements
    expect(out.ap1).toBeDefined()
    expect(isAccessPointElement(out.ap1 as CanvasElement)).toBe(true)
    // Wall back-fill ran (bulges length === segments, wallType defaulted).
    const w = out.w1 as unknown as { bulges: number[]; wallType: string; connectedWallIds: string[] }
    expect(w.bulges).toEqual([0, 0])
    expect(w.wallType).toBe('solid')
    expect(w.connectedWallIds).toEqual([])
  })
})
