import { describe, it, expect } from 'vitest'
import { buildDemoOfficePayload } from '../lib/demo/createDemoOffice'
import {
  isDeskElement,
  isWallElement,
  isDoorElement,
  isWindowElement,
  isAssignableElement,
  type CanvasElement,
} from '../types/elements'

/**
 * Look up an element by id across the entire payload. `payload.elements`
 * carries ONLY the active floor's elements (matching the live-app
 * contract — see the comment on `buildDemoOfficePayload`'s return), so
 * resolving a seat that belongs to a non-active floor requires walking
 * `payload.floors[i].elements` instead. Tests that previously consulted
 * `payload.elements` directly would miss roughly two-thirds of the
 * seeded seats — this helper centralises the "find anywhere" lookup.
 */
type DemoPayload = ReturnType<typeof buildDemoOfficePayload>
function findElement(p: DemoPayload, id: string): CanvasElement | undefined {
  if (p.elements[id]) return p.elements[id]
  for (const f of p.floors) {
    if (f.elements[id]) return f.elements[id]
  }
  return undefined
}

/**
 * Wave 17B — the demo office is the landing experience for new users
 * who click "Load sample content". If it silently loses a floor, orphans
 * a neighborhood, or mis-sizes the roster, the feature surface it was
 * built to showcase stops showing up. These tests lock in the payload
 * shape + coverage so future edits to the seed can't ship a silently
 * broken onboarding path.
 */

describe('buildDemoOfficePayload — shape', () => {
  const payload = buildDemoOfficePayload()

  it('returns a version-2 payload with three floors', () => {
    expect(payload.version).toBe(2)
    expect(payload.floors).toHaveLength(3)
  })

  it('activeFloorId resolves to one of the built floors', () => {
    const ids = new Set(payload.floors.map((f) => f.id))
    expect(ids.has(payload.activeFloorId)).toBe(true)
  })

  it('each floor has a unique id and increasing order', () => {
    const ids = payload.floors.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    const orders = payload.floors.map((f) => f.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('employees dictionary contains at least 40 people', () => {
    const emps = Object.values(payload.employees)
    expect(emps.length).toBeGreaterThanOrEqual(40)
  })

  it('at least 70% of employees are seated', () => {
    const emps = Object.values(payload.employees)
    const seated = emps.filter((e) => e.seatId !== null)
    const ratio = seated.length / emps.length
    expect(ratio).toBeGreaterThanOrEqual(0.7)
  })

  it('every seated employee references an element that actually exists', () => {
    for (const emp of Object.values(payload.employees)) {
      if (!emp.seatId) continue
      // Seats may live on any floor — `payload.elements` is the active
      // floor only, so walk all floors via the shared helper.
      expect(findElement(payload, emp.seatId)).toBeTruthy()
      // floorId must resolve to one of the floors
      const floorIds = new Set(payload.floors.map((f) => f.id))
      expect(floorIds.has(emp.floorId!)).toBe(true)
    }
  })

  it('seat assignments are unique across 1:1 desk elements', () => {
    const deskSeats = Object.values(payload.employees)
      .filter((e) => e.seatId !== null)
      .map((e) => e.seatId!)
      .filter((id) => {
        const el = findElement(payload, id)
        return el && (el.type === 'desk' || el.type === 'hot-desk')
      })
    expect(new Set(deskSeats).size).toBe(deskSeats.length)
  })

  it('desks mirror their occupant in assignedEmployeeId / assignedEmployeeIds', () => {
    for (const emp of Object.values(payload.employees)) {
      if (!emp.seatId) continue
      const el = findElement(payload, emp.seatId)
      expect(el).toBeTruthy()
      expect(isAssignableElement(el!)).toBe(true)
      if (el!.type === 'desk' || el!.type === 'hot-desk') {
        if (isDeskElement(el!)) {
          expect(el!.assignedEmployeeId).toBe(emp.id)
        }
      } else if (el!.type === 'workstation' || el!.type === 'private-office') {
        expect(
          (el as { assignedEmployeeIds: string[] }).assignedEmployeeIds,
        ).toContain(emp.id)
      }
    }
  })

  it('payload.elements carries ONLY the active floor (matches the live-app contract)', () => {
    // Regression guard for the bug fixed in this PR. The previous
    // implementation merged all floors' elements into payload.elements,
    // which caused every floor's walls/desks/decor to render on top of
    // the active floor when the seeder hydrated `useElementsStore`.
    const activeFloor = payload.floors.find((f) => f.id === payload.activeFloorId)
    expect(activeFloor).toBeTruthy()
    const activeIds = new Set(Object.keys(activeFloor!.elements))
    const elementsIds = new Set(Object.keys(payload.elements))
    expect(elementsIds).toEqual(activeIds)
    // And no element id from a non-active floor leaks into the top-level.
    for (const f of payload.floors) {
      if (f.id === payload.activeFloorId) continue
      for (const id of Object.keys(f.elements)) {
        expect(payload.elements[id]).toBeUndefined()
      }
    }
  })
})

describe('buildDemoOfficePayload — chrome per floor', () => {
  const payload = buildDemoOfficePayload()

  it('every floor has at least one wall, one door, and one window', () => {
    for (const floor of payload.floors) {
      const els = Object.values(floor.elements)
      expect(els.some((e) => isWallElement(e))).toBe(true)
      expect(els.some((e) => isDoorElement(e))).toBe(true)
      expect(els.some((e) => isWindowElement(e))).toBe(true)
    }
  })

  it('every floor has at least one plant or sofa (ambient decor)', () => {
    for (const floor of payload.floors) {
      const els = Object.values(floor.elements)
      expect(els.some((e) => e.type === 'plant' || e.type === 'sofa')).toBe(true)
    }
  })
})

describe('buildDemoOfficePayload — neighborhoods + annotations', () => {
  const payload = buildDemoOfficePayload()

  it('includes at least 3 neighborhoods', () => {
    expect(Object.keys(payload.neighborhoods).length).toBeGreaterThanOrEqual(3)
  })

  it('every neighborhood references a floor id that exists', () => {
    const floorIds = new Set(payload.floors.map((f) => f.id))
    for (const n of Object.values(payload.neighborhoods)) {
      expect(floorIds.has(n.floorId)).toBe(true)
    }
  })

  it('includes at least 3 annotations anchored to real floors or elements', () => {
    const annotations = Object.values(payload.annotations)
    expect(annotations.length).toBeGreaterThanOrEqual(3)
    const floorIds = new Set(payload.floors.map((f) => f.id))
    for (const a of annotations) {
      if (a.anchor.type === 'floor-position') {
        expect(floorIds.has(a.anchor.floorId)).toBe(true)
      } else {
        // Element-anchored annotations may target an element on any
        // floor; payload.elements only carries the active floor, so
        // walk all floors.
        expect(findElement(payload, a.anchor.elementId)).toBeTruthy()
      }
    }
  })
})

describe('buildDemoOfficePayload — department colors + coverage', () => {
  const payload = buildDemoOfficePayload()

  it('every department used by an employee has a registered color', () => {
    const depts = new Set(
      Object.values(payload.employees)
        .map((e) => e.department)
        .filter((d): d is string => d !== null),
    )
    for (const d of depts) {
      expect(payload.departmentColors[d]).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('includes at least one on-leave employee (status badge demo)', () => {
    const emps = Object.values(payload.employees)
    expect(emps.some((e) => e.status === 'on-leave')).toBe(true)
  })

  it('includes at least 2 employees with accommodations (badge demo)', () => {
    const emps = Object.values(payload.employees)
    const withAccommodations = emps.filter((e) => e.accommodations.length > 0)
    expect(withAccommodations.length).toBeGreaterThanOrEqual(2)
  })
})

describe('buildDemoOfficePayload — serialisability', () => {
  it('round-trips through JSON.stringify/parse cleanly', () => {
    const payload = buildDemoOfficePayload()
    const serialised = JSON.stringify(payload)
    const parsed = JSON.parse(serialised) as typeof payload
    expect(parsed.version).toBe(2)
    expect(parsed.floors).toHaveLength(3)
    expect(Object.keys(parsed.employees).length).toBe(
      Object.keys(payload.employees).length,
    )
  })
})

describe('buildDemoOfficePayload — isolation', () => {
  it('fresh invocation returns fresh ids (no cross-call aliasing)', () => {
    const a = buildDemoOfficePayload()
    const b = buildDemoOfficePayload()
    const aFloorIds = new Set(a.floors.map((f) => f.id))
    for (const f of b.floors) {
      expect(aFloorIds.has(f.id)).toBe(false)
    }
    const aEmpIds = new Set(Object.keys(a.employees))
    for (const id of Object.keys(b.employees)) {
      expect(aEmpIds.has(id)).toBe(false)
    }
  })
})
