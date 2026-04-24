import { nanoid } from 'nanoid'
import type { CanvasElement, DeskElement } from '../../types/elements'
import type { Employee } from '../../types/employee'
import type { Floor } from '../../types/floor'
import { DEFAULT_CANVAS_SETTINGS } from '../../types/project'
import { createOpenPlanOfficeTemplate } from '../../data/templates/open-plan-office'
import {
  DEMO_EMPLOYEES,
  DEMO_DEPARTMENT_COLORS,
  type DemoEmployeeSeed,
} from './demoSeed'

/**
 * Serialized shape the Supabase `offices.payload` column holds. Mirrors
 * `buildCurrentPayload` in `useOfficeSync.ts` exactly — if that shape
 * drifts, the demo will still save but will fail to rehydrate cleanly,
 * so keeping them in lockstep matters.
 */
export interface DemoOfficePayload {
  version: 2
  elements: Record<string, CanvasElement>
  employees: Record<string, Employee>
  departmentColors: Record<string, string>
  floors: Floor[]
  activeFloorId: string
  settings: typeof DEFAULT_CANVAS_SETTINGS
}

/**
 * Assemble a fully seeded office payload — elements + employees +
 * managerId cross-links + seat assignments. Pure: no store writes, no
 * network. The caller persists the returned payload.
 *
 * The builder walks desks in template order and assigns people whose
 * `seatIndex` hits. Desks are stable within a single template call, but
 * their ids are fresh nanoids per invocation, so every demo office is
 * its own independent payload — no cross-office aliasing.
 */
export function buildDemoOfficePayload(
  seeds: DemoEmployeeSeed[] = DEMO_EMPLOYEES,
): DemoOfficePayload {
  // 1. Lay down the floor plan from the existing open-plan template.
  const elements = createOpenPlanOfficeTemplate()
  const elementsMap: Record<string, CanvasElement> = {}
  for (const el of elements) elementsMap[el.id] = el

  // 2. Extract desks in declaration order — the template pushes perimeter
  //    walls first, then desks. Filtering by type is safer than slicing.
  const desks = elements.filter(
    (e): e is DeskElement => e.type === 'desk',
  )

  // 3. Single floor, gets every element above.
  const floorId = nanoid()
  const floor: Floor = {
    id: floorId,
    name: 'Floor 1',
    order: 0,
    elements: elementsMap,
  }

  // 4. First pass: generate ids and build the base Employee records.
  //    A key→id map lets the second pass resolve `managerKey` references
  //    without caring about seed-array order.
  const keyToId: Record<string, string> = {}
  for (const seed of seeds) {
    keyToId[seed.key] = nanoid()
  }

  const now = new Date().toISOString()
  const employees: Record<string, Employee> = {}
  for (const seed of seeds) {
    const id = keyToId[seed.key]
    const seat =
      seed.seatIndex !== null && seed.seatIndex < desks.length
        ? desks[seed.seatIndex]
        : null

    const employee: Employee = {
      id,
      name: seed.name,
      email: seed.email,
      department: seed.department,
      team: null,
      title: seed.title,
      managerId: seed.managerKey ? keyToId[seed.managerKey] ?? null : null,
      employmentType: seed.employmentType,
      status: seed.status,
      officeDays: [...seed.officeDays],
      startDate: seed.startDate,
      endDate: seed.endDate,
      equipmentNeeds: [...seed.equipmentNeeds],
      equipmentStatus: seed.equipmentStatus,
      photoUrl: null,
      tags: [],
      accommodations: [],
      seatId: seat ? seat.id : null,
      floorId: seat ? floorId : null,
      leaveType: null,
      expectedReturnDate: null,
      coverageEmployeeId: null,
      leaveNotes: null,
      departureDate: null,
      createdAt: now,
    }
    employees[id] = employee
  }

  // 5. Second pass: mirror the seat assignments back onto the desk
  //    elements so the canvas shows the occupant. `assignEmployee` would
  //    do this at runtime; we're building a persisted payload so we do it
  //    up front to avoid a "flash of unassigned desk" on first open.
  for (const emp of Object.values(employees)) {
    if (!emp.seatId) continue
    const el = elementsMap[emp.seatId]
    if (!el || el.type !== 'desk') continue
    elementsMap[emp.seatId] = { ...el, assignedEmployeeId: emp.id }
  }

  // Mirror the updated elements map into the floor record so whichever
  // side the app reads from (active-floor elementsStore vs. floor.elements
  // for inactive floors) sees the same occupancy.
  floor.elements = { ...elementsMap }

  return {
    version: 2,
    elements: elementsMap,
    employees,
    departmentColors: { ...DEMO_DEPARTMENT_COLORS },
    floors: [floor],
    activeFloorId: floorId,
    settings: { ...DEFAULT_CANVAS_SETTINGS },
  }
}
