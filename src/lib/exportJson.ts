import type { CanvasElement } from '../types/elements'
import type { Employee } from '../types/employee'
import type { CanvasSettings } from '../types/project'
import type { Floor } from '../types/floor'

export interface FloocraftExport {
  version: string
  project: {
    name: string
    settings: CanvasSettings
  }
  elements: CanvasElement[]
  employees: Employee[]
  floors: Floor[]
  exportedAt: string
}

export function exportProjectJson(
  name: string,
  settings: CanvasSettings,
  elements: Record<string, CanvasElement>,
  employees: Record<string, Employee>,
  floors: Floor[],
  fileName?: string
) {
  const data: FloocraftExport = {
    version: '1.0',
    project: { name, settings },
    elements: Object.values(elements),
    employees: Object.values(employees),
    floors,
    exportedAt: new Date().toISOString(),
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = fileName || `${name.replace(/\s+/g, '-').toLowerCase()}.json`
  link.href = url
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
