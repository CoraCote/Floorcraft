import { describe, it, expect, beforeAll } from 'vitest'
import {
  isSofaElement,
  isPlantElement,
  isPrinterElement,
  isWhiteboardElement,
  isAssignableElement,
  type CanvasElement,
  type SofaElement,
  type PlantElement,
  type PrinterElement,
  type WhiteboardElement,
  type ElementStyle,
} from '../types/elements'
import { getDefaults } from '../lib/constants'
import { loadAutoSave } from '../lib/offices/loadFromLegacyPayload'

const SAVE_KEY = 'floocraft-autosave'

// Node 25 ships an experimental localStorage that doesn't support .clear();
// match the pattern used by autoSaveSafety.test.ts for the legacy-payload
// round-trip assertion below.
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

function makeSofa(): SofaElement {
  const d = getDefaults('sofa')!
  return {
    id: 's1',
    type: 'sofa',
    x: 0, y: 0,
    width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 1,
    label: 'Sofa', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
  }
}

function makePlant(): PlantElement {
  const d = getDefaults('plant')!
  return {
    id: 'p1',
    type: 'plant',
    x: 10, y: 10,
    width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 2,
    label: 'Plant', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
  }
}

function makePrinter(): PrinterElement {
  const d = getDefaults('printer')!
  return {
    id: 'pr1',
    type: 'printer',
    x: 20, y: 20,
    width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 3,
    label: 'Printer', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
  }
}

function makeWhiteboard(): WhiteboardElement {
  const d = getDefaults('whiteboard')!
  return {
    id: 'w1',
    type: 'whiteboard',
    x: 30, y: 30,
    width: d.width, height: d.height,
    rotation: 0, locked: false, groupId: null, zIndex: 4,
    label: 'Whiteboard', visible: true,
    style: { ...baseStyle, fill: d.fill, stroke: d.stroke },
  }
}

describe('furniture catalog — type guards', () => {
  it('isSofaElement matches only sofas', () => {
    expect(isSofaElement(makeSofa())).toBe(true)
    expect(isSofaElement(makePlant() as CanvasElement)).toBe(false)
    expect(isSofaElement(makePrinter() as CanvasElement)).toBe(false)
    expect(isSofaElement(makeWhiteboard() as CanvasElement)).toBe(false)
  })

  it('isPlantElement matches only plants', () => {
    expect(isPlantElement(makePlant())).toBe(true)
    expect(isPlantElement(makeSofa() as CanvasElement)).toBe(false)
  })

  it('isPrinterElement matches only printers', () => {
    expect(isPrinterElement(makePrinter())).toBe(true)
    expect(isPrinterElement(makeSofa() as CanvasElement)).toBe(false)
  })

  it('isWhiteboardElement matches only whiteboards', () => {
    expect(isWhiteboardElement(makeWhiteboard())).toBe(true)
    expect(isWhiteboardElement(makePrinter() as CanvasElement)).toBe(false)
  })
})

describe('furniture catalog — default sizes', () => {
  it('sofa defaults are 200x80', () => {
    const d = getDefaults('sofa')!
    expect(d.width).toBe(200)
    expect(d.height).toBe(80)
  })

  it('plant defaults are 40x40', () => {
    const d = getDefaults('plant')!
    expect(d.width).toBe(40)
    expect(d.height).toBe(40)
  })

  it('printer defaults are 60x50', () => {
    const d = getDefaults('printer')!
    expect(d.width).toBe(60)
    expect(d.height).toBe(50)
  })

  it('whiteboard defaults are 180x20', () => {
    const d = getDefaults('whiteboard')!
    expect(d.width).toBe(180)
    expect(d.height).toBe(20)
  })
})

describe('furniture catalog — non-assignable', () => {
  it('none of the new types are assignable (no seats / no employee binding)', () => {
    expect(isAssignableElement(makeSofa() as CanvasElement)).toBe(false)
    expect(isAssignableElement(makePlant() as CanvasElement)).toBe(false)
    expect(isAssignableElement(makePrinter() as CanvasElement)).toBe(false)
    expect(isAssignableElement(makeWhiteboard() as CanvasElement)).toBe(false)
  })
})

describe('furniture catalog — legacy payload round-trip', () => {
  it('sofa/plant/printer/whiteboard survive a save+load cycle without loss', () => {
    const elements: Record<string, CanvasElement> = {
      s1: makeSofa(),
      p1: makePlant(),
      pr1: makePrinter(),
      w1: makeWhiteboard(),
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ elements, employees: {} }))
    const loaded = loadAutoSave()
    expect(loaded).not.toBeNull()
    const out = loaded!.elements
    expect(Object.keys(out).sort()).toEqual(['p1', 'pr1', 's1', 'w1'])
    expect(isSofaElement(out.s1 as CanvasElement)).toBe(true)
    expect(isPlantElement(out.p1 as CanvasElement)).toBe(true)
    expect(isPrinterElement(out.pr1 as CanvasElement)).toBe(true)
    expect(isWhiteboardElement(out.w1 as CanvasElement)).toBe(true)
    // Dimensions preserved exactly.
    expect(out.s1.width).toBe(200)
    expect(out.s1.height).toBe(80)
    expect(out.p1.width).toBe(40)
    expect(out.pr1.width).toBe(60)
    expect(out.w1.width).toBe(180)
    expect(out.w1.height).toBe(20)
  })
})
