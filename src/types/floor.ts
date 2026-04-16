import type { CanvasElement } from './elements'

export interface Floor {
  id: string
  name: string
  order: number
  elements: Record<string, CanvasElement>
}
