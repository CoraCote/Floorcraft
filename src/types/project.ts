import type { CanvasElement } from './elements'
import type { Guest } from './guests'

export interface CanvasSettings {
  gridSize: number
  scale: number
  scaleUnit: 'ft' | 'm' | 'cm' | 'in'
  showGrid: boolean
}

export interface Project {
  id: string
  ownerId: string | null
  name: string
  slug: string
  sharePermission: 'private' | 'view' | 'comment' | 'edit'
  canvasData: Record<string, CanvasElement>
  canvasSettings: CanvasSettings
  thumbnailUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectVersion {
  id: string
  projectId: string
  name: string | null
  canvasData: Record<string, CanvasElement>
  guestData: Guest[]
  createdAt: string
}

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  gridSize: 12,
  scale: 1,
  scaleUnit: 'ft',
  showGrid: true,
}
