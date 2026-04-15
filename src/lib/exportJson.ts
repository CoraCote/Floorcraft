import type { CanvasElement } from '../types/elements'
import type { Guest } from '../types/guests'
import type { CanvasSettings } from '../types/project'

export interface FloocraftExport {
  version: string
  project: {
    name: string
    settings: CanvasSettings
  }
  elements: CanvasElement[]
  guests: Guest[]
  exportedAt: string
}

export function exportProjectJson(
  name: string,
  settings: CanvasSettings,
  elements: Record<string, CanvasElement>,
  guests: Record<string, Guest>,
  fileName?: string
) {
  const data: FloocraftExport = {
    version: '1.0',
    project: { name, settings },
    elements: Object.values(elements),
    guests: Object.values(guests),
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
