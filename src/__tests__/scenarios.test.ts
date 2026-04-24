import { describe, it, expect } from 'vitest'
import {
  projectScenario,
  baselineProjection,
  UNASSIGNED_DEPARTMENT,
  type ScenarioAdjustment,
  type ScenarioBaseSnapshot,
} from '../lib/scenarios'

function base(over: Partial<ScenarioBaseSnapshot> = {}): ScenarioBaseSnapshot {
  return {
    activeEmployees: 30,
    employeesByDepartment: { Engineering: 20, Design: 5, Sales: 5 },
    totalSeats: 40,
    assignedSeats: 25,
    ...over,
  }
}

describe('projectScenario', () => {
  it('is a no-op with an empty adjustment list', () => {
    const snap = base()
    const p = projectScenario(snap, [])
    expect(p.activeEmployees).toBe(snap.activeEmployees)
    expect(p.totalSeats).toBe(snap.totalSeats)
    expect(p.employeesByDepartment).toEqual(snap.employeesByDepartment)
    expect(p.occupancyRatio).toBeCloseTo(30 / 40, 5)
  })

  it('does not mutate the base snapshot map', () => {
    const snap = base()
    const before = { ...snap.employeesByDepartment }
    const adj: ScenarioAdjustment[] = [
      { id: 'a1', type: 'add-headcount', department: 'Engineering', count: 10 },
    ]
    projectScenario(snap, adj)
    expect(snap.employeesByDepartment).toEqual(before)
  })

  it('add-headcount increments both the department bucket and the total', () => {
    const p = projectScenario(base(), [
      { id: 'a1', type: 'add-headcount', department: 'Engineering', count: 10 },
    ])
    expect(p.activeEmployees).toBe(40)
    expect(p.employeesByDepartment.Engineering).toBe(30)
    expect(p.totalSeats).toBe(40) // untouched
  })

  it('add-headcount creates a new department bucket when the name is new', () => {
    const p = projectScenario(base(), [
      { id: 'a1', type: 'add-headcount', department: 'Research', count: 3 },
    ])
    expect(p.employeesByDepartment.Research).toBe(3)
    expect(p.activeEmployees).toBe(33)
  })

  it('add-headcount routes an empty department name to "Unassigned"', () => {
    const p = projectScenario(base({ employeesByDepartment: {} }), [
      { id: 'a1', type: 'add-headcount', department: '', count: 2 },
    ])
    expect(p.employeesByDepartment[UNASSIGNED_DEPARTMENT]).toBe(2)
  })

  it('remove-headcount decrements both the bucket and the total', () => {
    const p = projectScenario(base(), [
      { id: 'a1', type: 'remove-headcount', department: 'Design', count: 2 },
    ])
    expect(p.employeesByDepartment.Design).toBe(3)
    expect(p.activeEmployees).toBe(28)
  })

  it('remove-headcount clamps at zero — cannot push a department negative', () => {
    const p = projectScenario(base(), [
      { id: 'a1', type: 'remove-headcount', department: 'Design', count: 100 },
    ])
    expect(p.employeesByDepartment.Design).toBe(0)
    // Only 5 were actually removed (Design had 5), so the overall total
    // drops by 5, not by 100.
    expect(p.activeEmployees).toBe(25)
  })

  it('remove-headcount on an unknown department is a no-op', () => {
    const p = projectScenario(base(), [
      { id: 'a1', type: 'remove-headcount', department: 'Ghosts', count: 5 },
    ])
    expect(p.activeEmployees).toBe(30)
    expect(p.employeesByDepartment).toEqual(base().employeesByDepartment)
  })

  it('add-seats bumps totalSeats without touching headcount', () => {
    const p = projectScenario(base(), [
      { id: 'a1', type: 'add-seats', count: 40 },
    ])
    expect(p.totalSeats).toBe(80)
    expect(p.activeEmployees).toBe(30)
  })

  it('ignores non-positive counts on every adjustment type', () => {
    const p = projectScenario(base(), [
      { id: 'a1', type: 'add-headcount', department: 'Engineering', count: 0 },
      { id: 'a2', type: 'remove-headcount', department: 'Engineering', count: -5 },
      { id: 'a3', type: 'add-seats', count: 0 },
    ])
    expect(p.activeEmployees).toBe(30)
    expect(p.totalSeats).toBe(40)
    expect(p.employeesByDepartment).toEqual(base().employeesByDepartment)
  })

  it('chains multiple adjustments in order', () => {
    const adjs: ScenarioAdjustment[] = [
      { id: 'a1', type: 'add-headcount', department: 'Engineering', count: 10 },
      { id: 'a2', type: 'remove-headcount', department: 'Sales', count: 2 },
      { id: 'a3', type: 'add-seats', count: 15 },
      { id: 'a4', type: 'add-headcount', department: 'Research', count: 4 },
    ]
    const p = projectScenario(base(), adjs)
    expect(p.activeEmployees).toBe(30 + 10 - 2 + 4)
    expect(p.totalSeats).toBe(40 + 15)
    expect(p.employeesByDepartment.Engineering).toBe(30)
    expect(p.employeesByDepartment.Sales).toBe(3)
    expect(p.employeesByDepartment.Research).toBe(4)
    expect(p.occupancyRatio).toBeCloseTo(42 / 55, 5)
  })

  it('reports zero occupancy when there are no seats', () => {
    const p = projectScenario(base({ totalSeats: 0 }), [])
    expect(p.occupancyRatio).toBe(0)
  })
})

describe('baselineProjection', () => {
  it('equals projectScenario(base, [])', () => {
    const snap = base()
    expect(baselineProjection(snap)).toEqual(projectScenario(snap, []))
  })
})
