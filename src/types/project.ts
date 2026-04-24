import type { Floor } from './floor'
import type { LengthUnit } from '../lib/units'

export interface CanvasSettings {
  gridSize: number
  scale: number
  scaleUnit: LengthUnit
  showGrid: boolean
  /**
   * When true, a label appears at the midpoint of each wall segment showing
   * its length in `scale * pixels` rounded to 1 decimal + `scaleUnit`. Off by
   * default so the canvas stays uncluttered for new plans.
   */
  showDimensions: boolean
  /**
   * Heading (in degrees, 0-360) of the on-canvas north arrow. 0 means the
   * arrow points straight up. The user can drag the floating compass to
   * reorient the plan for wayfinding/exports. Optional for backward
   * compatibility with persisted projects that predate the field — readers
   * should treat `undefined` as `0`.
   */
  northRotation?: number
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
  showDimensions: false,
  northRotation: 0,
}
