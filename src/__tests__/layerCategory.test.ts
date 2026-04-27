import { describe, it, expect } from 'vitest'
import { categoryForElement } from '../lib/layerCategory'
import type { CanvasElement, ElementType } from '../types/elements'
import type { LayerCategory } from '../stores/layerVisibilityStore'

// Build a minimal element of each declared ElementType. We only need enough
// shape for `categoryForElement` to branch on `type` — all other fields are
// defaulted.
function el(type: ElementType): CanvasElement {
  const base = {
    id: type,
    type,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: '',
    visible: true,
    style: { fill: '#000', stroke: '#000', strokeWidth: 1, opacity: 1 },
  } as unknown as CanvasElement
  return base
}

// Exhaustive mapping every `ElementType` must satisfy. If a new element
// type is added, TypeScript will force the maintainer to either extend
// `ElementType` + this map or accept the 'furniture' default.
const EXPECTED: Record<ElementType, LayerCategory> = {
  wall: 'walls',
  door: 'walls',
  window: 'walls',
  desk: 'seating',
  'hot-desk': 'seating',
  workstation: 'seating',
  'private-office': 'seating',
  'conference-room': 'rooms',
  'phone-booth': 'rooms',
  'common-area': 'rooms',
  chair: 'furniture',
  counter: 'furniture',
  'table-rect': 'furniture',
  'table-conference': 'furniture',
  'table-round': 'furniture',
  'table-oval': 'furniture',
  divider: 'furniture',
  planter: 'furniture',
  'custom-shape': 'furniture',
  'text-label': 'annotations',
  'background-image': 'furniture',
  decor: 'furniture',
  'rect-shape': 'annotations',
  ellipse: 'annotations',
  'line-shape': 'annotations',
  arrow: 'annotations',
  'free-text': 'annotations',
  'custom-svg': 'furniture',
  sofa: 'furniture',
  plant: 'furniture',
  printer: 'furniture',
  whiteboard: 'furniture',
  // IT/AV/Network/Power layer (M1) — currently fall through the
  // `default` branch in `categoryForElement` to 'furniture' so they're
  // visible under the existing furniture toggle. M2 will introduce
  // dedicated `viewITLayer` / per-sub-layer toggles; until then
  // 'furniture' keeps these elements visible-by-default for legacy
  // offices that don't have any IT devices yet (no behaviour change)
  // and visible-but-grouped-with-decor for offices that do.
  'access-point': 'furniture',
  'network-jack': 'furniture',
  display: 'furniture',
  'video-bar': 'furniture',
  'badge-reader': 'furniture',
  outlet: 'furniture',
}

describe('categoryForElement', () => {
  it('maps every ElementType to exactly one LayerCategory', () => {
    for (const [type, expected] of Object.entries(EXPECTED) as [
      ElementType,
      LayerCategory,
    ][]) {
      expect(categoryForElement(el(type))).toBe(expected)
    }
  })

  it("unknown / future element types default to 'furniture'", () => {
    // Cast so TS lets us construct an element with an unrecognised type.
    const rogue = { ...el('decor'), type: 'hover-pod' } as unknown as CanvasElement
    expect(categoryForElement(rogue)).toBe('furniture')
  })

  it('structural types collapse into `walls`', () => {
    expect(categoryForElement(el('wall'))).toBe('walls')
    expect(categoryForElement(el('door'))).toBe('walls')
    expect(categoryForElement(el('window'))).toBe('walls')
  })

  it('all assignable seating types collapse into `seating`', () => {
    expect(categoryForElement(el('desk'))).toBe('seating')
    expect(categoryForElement(el('hot-desk'))).toBe('seating')
    expect(categoryForElement(el('workstation'))).toBe('seating')
    expect(categoryForElement(el('private-office'))).toBe('seating')
  })
})
