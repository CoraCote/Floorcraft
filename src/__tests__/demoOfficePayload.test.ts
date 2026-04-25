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
        // Workstations now store a sparse `(string|null)[]`; private
        // offices still store dense `string[]`. `.toContain` works
        // identically on both.
        expect(
          (el as { assignedEmployeeIds: Array<string | null> }).assignedEmployeeIds,
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

// ---------------------------------------------------------------------------
// Geometric invariants. Every CanvasElement uses CENTER-ORIGIN x/y
// coordinates (verified by reading ElementRenderer.tsx + RoomRenderer.tsx).
// The original demo author confused top-left vs center conventions in
// several places, leaving the reception in the negative quadrant, conference
// tables overhanging their rooms, and the design pod's desks outside the
// pod's common-area AABB. These tests pin the coordinate convention so we
// can never silently regress it.
// ---------------------------------------------------------------------------

interface AABB {
  x1: number
  y1: number
  x2: number
  y2: number
}

function aabbOf(el: { x: number; y: number; width: number; height: number }): AABB {
  return {
    x1: el.x - el.width / 2,
    y1: el.y - el.height / 2,
    x2: el.x + el.width / 2,
    y2: el.y + el.height / 2,
  }
}

function aabbContains(outer: AABB, inner: AABB, tolerance = 0.001): boolean {
  return (
    inner.x1 >= outer.x1 - tolerance &&
    inner.y1 >= outer.y1 - tolerance &&
    inner.x2 <= outer.x2 + tolerance &&
    inner.y2 <= outer.y2 + tolerance
  )
}

function aabbContainsPoint(outer: AABB, x: number, y: number): boolean {
  return x >= outer.x1 && x <= outer.x2 && y >= outer.y1 && y <= outer.y2
}

function aabbsOverlap(a: AABB, b: AABB): boolean {
  return !(a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1)
}

const FLOOR_BOUNDS: AABB = { x1: 0, y1: 0, x2: 1200, y2: 800 }

describe('buildDemoOfficePayload — geometric invariants', () => {
  const payload = buildDemoOfficePayload()

  it('every common area lives inside the floor bounds [0..1200, 0..800]', () => {
    for (const floor of payload.floors) {
      const commons = Object.values(floor.elements).filter(
        (e) => e.type === 'common-area',
      )
      for (const c of commons) {
        const box = aabbOf(c)
        expect(
          aabbContains(FLOOR_BOUNDS, box),
          `common area "${c.label}" on floor "${floor.name}" AABB ${JSON.stringify(box)} escapes floor bounds`,
        ).toBe(true)
      }
    }
  })

  it('no element extends into the negative quadrant (x < 0 or y < 0)', () => {
    for (const floor of payload.floors) {
      for (const el of Object.values(floor.elements)) {
        // Walls anchor at (0,0) by convention with their geometry living in
        // `points` — exclude them from the AABB-negative check since the
        // bounding box stored on the element doesn't reflect the actual
        // stroke footprint and they routinely sit on the perimeter.
        if (el.type === 'wall' || el.type === 'door' || el.type === 'window') continue
        const box = aabbOf(el)
        expect(
          box.x1 >= -0.001 && box.y1 >= -0.001,
          `${el.type} "${el.label}" on "${floor.name}" AABB ${JSON.stringify(box)} extends into negative quadrant`,
        ).toBe(true)
      }
    }
  })

  it('every conference table is fully contained in its enclosing room or common area', () => {
    for (const floor of payload.floors) {
      const els = Object.values(floor.elements)
      // A conference table can semantically live inside a conference-room
      // (the typical case) OR a common-area like a "Design pod" — both
      // are valid containers and both should fully enclose the table.
      const containers = els.filter(
        (e) => e.type === 'conference-room' || e.type === 'common-area',
      )
      const tables = els.filter((e) => e.type === 'table-conference')
      for (const t of tables) {
        const tBox = aabbOf(t)
        const containing = containers.find((c) => aabbContainsPoint(aabbOf(c), t.x, t.y))
        expect(
          containing,
          `conference table on "${floor.name}" at (${t.x}, ${t.y}) is not inside any conference room or common area`,
        ).toBeTruthy()
        if (containing) {
          const cBox = aabbOf(containing)
          expect(
            aabbContains(cBox, tBox),
            `table AABB ${JSON.stringify(tBox)} not fully inside container "${containing.label}" AABB ${JSON.stringify(cBox)}`,
          ).toBe(true)
        }
      }
    }
  })

  it('every conference table renders ABOVE its containing conference room (zIndex)', () => {
    // Only enforced for conference-room containers (the case where
    // overlapping zIndex causes flicker). Common-area containers paint at
    // zIndex 1, well below the table's zIndex 3, so they're trivially
    // satisfied — no need to assert.
    for (const floor of payload.floors) {
      const els = Object.values(floor.elements)
      const rooms = els.filter((e) => e.type === 'conference-room')
      const tables = els.filter((e) => e.type === 'table-conference')
      for (const t of tables) {
        const containingRoom = rooms.find((r) => aabbContainsPoint(aabbOf(r), t.x, t.y))
        if (containingRoom) {
          expect(
            t.zIndex,
            `table at (${t.x},${t.y}) has zIndex ${t.zIndex} but room "${containingRoom.label}" has zIndex ${containingRoom.zIndex} — table must paint on top`,
          ).toBeGreaterThan(containingRoom.zIndex)
        }
      }
    }
  })

  it('every desk is inside SOME zone (neighborhood, common area, or other seated container)', () => {
    for (const floor of payload.floors) {
      const els = Object.values(floor.elements)
      const desks = els.filter((e) => e.type === 'desk' || e.type === 'hot-desk')

      // Build the candidate-zone AABB list for the floor:
      //  - All neighborhood AABBs whose floorId matches.
      //  - All common-area, conference-room, private-office, workstation
      //    element AABBs (any container that semantically "owns" a seat).
      const zones: AABB[] = []
      for (const n of Object.values(payload.neighborhoods)) {
        if (n.floorId === floor.id) zones.push(aabbOf(n))
      }
      for (const e of els) {
        if (
          e.type === 'common-area' ||
          e.type === 'conference-room' ||
          e.type === 'private-office' ||
          e.type === 'workstation'
        ) {
          zones.push(aabbOf(e))
        }
      }

      for (const d of desks) {
        const inside = zones.some((z) => aabbContainsPoint(z, d.x, d.y))
        expect(
          inside,
          `desk "${d.label}" at (${d.x}, ${d.y}) on "${floor.name}" floats outside every defined zone`,
        ).toBe(true)
      }
    }
  })

  it('no two neighborhoods on the same floor have overlapping AABBs', () => {
    const byFloor = new Map<string, AABB[]>()
    const byFloorMeta = new Map<string, { name: string; box: AABB }[]>()
    for (const n of Object.values(payload.neighborhoods)) {
      const arr = byFloor.get(n.floorId) ?? []
      const meta = byFloorMeta.get(n.floorId) ?? []
      arr.push(aabbOf(n))
      meta.push({ name: n.name, box: aabbOf(n) })
      byFloor.set(n.floorId, arr)
      byFloorMeta.set(n.floorId, meta)
    }
    for (const [floorId, metas] of byFloorMeta) {
      for (let i = 0; i < metas.length; i++) {
        for (let j = i + 1; j < metas.length; j++) {
          expect(
            aabbsOverlap(metas[i].box, metas[j].box),
            `neighborhoods "${metas[i].name}" and "${metas[j].name}" overlap on floor ${floorId}`,
          ).toBe(false)
        }
      }
    }
  })

  it('every neighborhoods desk on the engineering floor is inside its squad neighborhood', () => {
    // Stronger version of "desk inside some zone": each engineering desk
    // belongs to a SPECIFIC squad neighborhood (matched by the desk label
    // prefix), and the desk's center must sit inside that exact squad.
    const engFloor = payload.floors.find((f) => f.name.includes('Engineering'))
    expect(engFloor).toBeTruthy()
    if (!engFloor) return

    const neighborhoods = Object.values(payload.neighborhoods).filter(
      (n) => n.floorId === engFloor.id,
    )
    expect(neighborhoods.length).toBeGreaterThanOrEqual(4)

    for (const n of neighborhoods) {
      const box = aabbOf(n)
      // Every desk whose label starts with the squad name should be in this box.
      const desks = Object.values(engFloor.elements).filter(
        (e) =>
          (e.type === 'desk' || e.type === 'hot-desk') &&
          typeof e.label === 'string' &&
          e.label.startsWith(n.name),
      )
      expect(
        desks.length,
        `squad ${n.name} should have desks labeled with its name`,
      ).toBeGreaterThan(0)
      for (const d of desks) {
        expect(
          aabbContainsPoint(box, d.x, d.y),
          `desk "${d.label}" at (${d.x}, ${d.y}) is outside neighborhood "${n.name}" AABB ${JSON.stringify(box)}`,
        ).toBe(true)
      }
    }
  })
})
