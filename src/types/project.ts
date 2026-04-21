import type { Floor } from './floor'

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
  buildingName: string | null
  floors: Floor[]
  activeFloorId: string
  canvasSettings: CanvasSettings
  thumbnailUrl: string | null
  createdAt: string
  updatedAt: string
}

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  gridSize: 12,
  scale: 1,
  scaleUnit: 'ft',
  showGrid: true,
}
