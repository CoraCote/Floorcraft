import { describe, it, expect } from 'vitest'
import { buildDemoOfficePayload } from '../lib/demo/createDemoOffice'
import { DEMO_EMPLOYEES } from '../lib/demo/demoSeed'
import { isDeskElement } from '../types/elements'

/**
 * The demo office is marketing-copy meets onboarding aid — if it
 * silently loses its manager links or seats nobody, it stops showing
 * off the features it was built to demonstrate. These tests lock in
 * the seed's internal consistency so edits to `demoSeed.ts` that
 * accidentally orphan a manager or collide a seat index fail the
 * build instead of shipping a silently-broken demo.
 */

describe('buildDemoOfficePayload — shape', () => {
  const payload = buildDemoOfficePayload()

  it('returns a version-2 payload with one floor', () => {
    expect(payload.version).toBe(2)
    expect(payload.floors).toHaveLength(1)
    expect(payload.activeFloorId).toBe(payload.floors[0].id)
  })

  it('creates a distinct Employee for every seed key', () => {
    const empCount = Object.keys(payload.employees).length
    expect(empCount).toBe(DEMO_EMPLOYEES.length)
    // All ids are unique.
    const ids = Object.values(payload.employees).map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every managerId resolves to an existing employee', () => {
    for (const emp of Object.values(payload.employees)) {
      if (emp.managerId === null) continue
      expect(payload.employees[emp.managerId]).toBeTruthy()
    }
  })

  it('every seated employee points at a desk that exists on the active floor', () => {
    const activeFloor = payload.floors.find((f) => f.id === payload.activeFloorId)!
    for (const emp of Object.values(payload.employees)) {
      if (!emp.seatId) continue
      expect(emp.floorId).toBe(payload.activeFloorId)
      const el = activeFloor.elements[emp.seatId]
      expect(el).toBeTruthy()
      expect(isDeskElement(el)).toBe(true)
    }
  })

  it('no two employees are assigned to the same desk', () => {
    const seats = Object.values(payload.employees)
      .map((e) => e.seatId)
      .filter((s): s is string => s !== null)
    expect(new Set(seats).size).toBe(seats.length)
  })

  it('desks mirror their occupant in assignedEmployeeId', () => {
    const activeFloor = payload.floors.find((f) => f.id === payload.activeFloorId)!
    for (const emp of Object.values(payload.employees)) {
      if (!emp.seatId) continue
      const el = activeFloor.elements[emp.seatId]
      expect(isDeskElement(el)).toBe(true)
      if (isDeskElement(el)) {
        expect(el.assignedEmployeeId).toBe(emp.id)
      }
    }
  })

  it('floor.elements and payload.elements share the same map content', () => {
    const floorElements = payload.floors[0].elements
    for (const [id, el] of Object.entries(payload.elements)) {
      expect(floorElements[id]).toEqual(el)
    }
  })
})

describe('buildDemoOfficePayload — feature coverage', () => {
  const payload = buildDemoOfficePayload()
  const emps = Object.values(payload.employees)

  it('includes at least one departed employee who still holds a seat (cascade demo)', () => {
    const departedSeated = emps.filter(
      (e) => e.status === 'departed' && e.seatId !== null,
    )
    expect(departedSeated.length).toBeGreaterThan(0)
  })

  it('includes at least one duplicate name+department pair (rehire badge demo)', () => {
    const counts = new Map<string, number>()
    for (const e of emps) {
      if (!e.department || !e.name) continue
      const k = `${e.name.toLowerCase()}|${e.department.toLowerCase()}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    const dup = [...counts.values()].some((n) => n > 1)
    expect(dup).toBe(true)
  })

  it('includes at least one pending-equipment row', () => {
    expect(emps.some((e) => e.equipmentStatus === 'pending')).toBe(true)
  })

  it('includes at least one on-leave employee', () => {
    expect(emps.some((e) => e.status === 'on-leave')).toBe(true)
  })

  it('includes at least one employee whose endDate is within the next 30 days', () => {
    const now = new Date()
    const limit = new Date(now)
    limit.setUTCDate(limit.getUTCDate() + 30)
    const soon = emps.some((e) => {
      if (!e.endDate) return false
      const d = new Date(e.endDate)
      return d.getTime() >= now.getTime() - 86400000 && d.getTime() <= limit.getTime()
    })
    expect(soon).toBe(true)
  })

  it('registers department colors for every department referenced', () => {
    const depts = new Set(emps.map((e) => e.department).filter(Boolean) as string[])
    for (const d of depts) {
      expect(payload.departmentColors[d]).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})

describe('buildDemoOfficePayload — isolation', () => {
  it('fresh invocation returns fresh ids (no cross-call aliasing)', () => {
    const a = buildDemoOfficePayload()
    const b = buildDemoOfficePayload()
    expect(a.activeFloorId).not.toBe(b.activeFloorId)
    // Employee ids should be pairwise distinct across the two payloads.
    const aIds = new Set(Object.keys(a.employees))
    for (const id of Object.keys(b.employees)) {
      expect(aIds.has(id)).toBe(false)
    }
  })
})
