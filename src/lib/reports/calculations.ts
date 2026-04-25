import type { CanvasElement } from '../../types/elements'
import type { Employee } from '../../types/employee'
import type { Floor } from '../../types/floor'
import { isAssignableElement } from '../../types/elements'

export interface FloorUtilRow {
  floorId: string
  floorName: string
  assigned: number
  capacity: number
  percent: number
}

export function floorUtilization(floors: Floor[]): FloorUtilRow[] {
  return floors.map((floor) => {
    let assigned = 0
    let capacity = 0
    for (const el of Object.values(floor.elements) as CanvasElement[]) {
      if (!isAssignableElement(el)) continue
      if (el.type === 'desk' || el.type === 'hot-desk') {
        capacity += 1
        if (el.assignedEmployeeId) assigned += 1
      } else if (el.type === 'workstation') {
        capacity += el.positions
        // Sparse positional array — count only filled slots.
        assigned += el.assignedEmployeeIds.filter((id) => !!id).length
      } else if (el.type === 'private-office') {
        capacity += el.capacity
        assigned += el.assignedEmployeeIds.length
      }
    }
    const percent = capacity === 0 ? 0 : (assigned / capacity) * 100
    return {
      floorId: floor.id,
      floorName: floor.name,
      assigned,
      capacity,
      percent,
    }
  })
}

export interface DeptRow {
  department: string
  count: number
  assigned: number
  assignmentRate: number
}

export function departmentHeadcount(employees: Record<string, Employee>): DeptRow[] {
  const buckets = new Map<string, { count: number; assigned: number }>()
  for (const e of Object.values(employees)) {
    const key = e.department?.trim() || '(None)'
    const row = buckets.get(key) ?? { count: 0, assigned: 0 }
    row.count += 1
    if (e.seatId) row.assigned += 1
    buckets.set(key, row)
  }
  const rows: DeptRow[] = Array.from(buckets.entries()).map(([department, { count, assigned }]) => ({
    department,
    count,
    assigned,
    assignmentRate: count === 0 ? 0 : (assigned / count) * 100,
  }))
  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.department.localeCompare(b.department)
  })
  return rows
}

export interface UnassignedRow {
  id: string
  name: string
  department: string | null
  email: string
}

export function unassignedEmployees(employees: Record<string, Employee>): UnassignedRow[] {
  const rows = Object.values(employees)
    .filter((e) => e.status === 'active' && !e.seatId)
    .map((e) => ({
      id: e.id,
      name: e.name,
      department: e.department,
      email: e.email,
    }))
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return rows
}
