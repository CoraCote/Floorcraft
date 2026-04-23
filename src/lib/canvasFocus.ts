import type Konva from 'konva'
import { getActiveStage } from './stageRegistry'
import { useCanvasStore } from '../stores/canvasStore'
import { useUIStore } from '../stores/uiStore'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Viewport {
  width: number
  height: number
}

export interface CenteringInput {
  element: Rect
  viewport: Viewport
  scale: number
}

/**
 * Given an element's rect and the current viewport + scale, return the
 * stage position (stageX, stageY) that places the element's center at
 * the viewport center.
 */
export function computeCenteringPosition(input: CenteringInput): { x: number; y: number } {
  const { element, viewport, scale } = input
  const ecx = element.x + element.width / 2
  const ecy = element.y + element.height / 2
  const vcx = viewport.width / 2
  const vcy = viewport.height / 2
  return {
    x: vcx - ecx * scale,
    y: vcy - ecy * scale,
  }
}

/**
 * Pan the active stage so `element` sits at the viewport center, using
 * the current scale (no zoom change). Writes `flashingElementId` to
 * uiStore and clears it after 1500ms.
 */
export function focusOnElement(element: Rect, elementId: string): void {
  const stage: Konva.Stage | null = getActiveStage()
  if (!stage) return

  const scale = useCanvasStore.getState().stageScale
  const viewport = { width: stage.width(), height: stage.height() }
  const pos = computeCenteringPosition({ element, viewport, scale })

  stage.position(pos)
  stage.batchDraw()
  useCanvasStore.getState().setStagePosition(pos.x, pos.y)

  useUIStore.getState().setFlashingElementId(elementId)
  setTimeout(() => {
    if (useUIStore.getState().flashingElementId === elementId) {
      useUIStore.getState().setFlashingElementId(null)
    }
  }, 1500)
}
