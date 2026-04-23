import Papa from 'papaparse'
import type { FloorUtilRow, DeptRow, UnassignedRow } from './calculations'

export function utilizationCsv(rows: FloorUtilRow[]): string {
  return Papa.unparse(
    rows.map((r) => ({
      floor: r.floorName,
      assigned: r.assigned,
      capacity: r.capacity,
      percent: r.percent.toFixed(1),
    })),
    { columns: ['floor', 'assigned', 'capacity', 'percent'] },
  )
}

export function headcountCsv(rows: DeptRow[]): string {
  return Papa.unparse(
    rows.map((r) => ({
      department: r.department,
      count: r.count,
      assigned: r.assigned,
      assignmentRate: r.assignmentRate.toFixed(1),
    })),
    { columns: ['department', 'count', 'assigned', 'assignmentRate'] },
  )
}

export function unassignedCsv(rows: UnassignedRow[]): string {
  return Papa.unparse(
    rows.map((r) => ({
      name: r.name,
      department: r.department ?? '',
      email: r.email,
    })),
    { columns: ['name', 'department', 'email'] },
  )
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
