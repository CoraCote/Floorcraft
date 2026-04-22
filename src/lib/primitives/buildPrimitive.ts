/**
 * Pure factories that convert a drag-rectangle (start + end canvas coords)
 * into a freshly-minted primitive element. Keeping these outside of the
 * Konva event handlers means the drag→element math can be unit-tested
 * without the rendering stack.
 */
import { nanoid } from 'nanoid'
import type {
  RectShapeElement,
  EllipseElement,
  LineShapeElement,
  ArrowElement,
  FreeTextElement,
  ElementStyle,
} from '../../types/elements'

export const PRIMITIVE_DRAG_THRESHOLD = 4

const DEFAULT_STYLE: ElementStyle = {
  fill: 'rgba(59, 130, 246, 0.15)',
  stroke: '#1F2937',
  strokeWidth: 2,
  opacity: 1,
}

function baseFields(id: string, zIndex: number) {
  return {
    id,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex,
    visible: true,
  }
}

export interface DragCoords {
  startX: number
  startY: number
  endX: number
  endY: number
}

/** Did the pointer travel far enough to count as a drag (not a click)? */
export function isDragCommit(d: DragCoords): boolean {
  const dx = d.endX - d.startX
  const dy = d.endY - d.startY
  return dx * dx + dy * dy >= PRIMITIVE_DRAG_THRESHOLD * PRIMITIVE_DRAG_THRESHOLD
}

/** Center + width/height from a drag rectangle. Width/height are absolute. */
function rectFromDrag(d: DragCoords) {
  const x = (d.startX + d.endX) / 2
  const y = (d.startY + d.endY) / 2
  const width = Math.max(1, Math.abs(d.endX - d.startX))
  const height = Math.max(1, Math.abs(d.endY - d.startY))
  return { x, y, width, height }
}

export function buildRectShape(
  d: DragCoords,
  zIndex: number,
  style: ElementStyle = DEFAULT_STYLE,
): RectShapeElement {
  const { x, y, width, height } = rectFromDrag(d)
  return {
    ...baseFields(nanoid(), zIndex),
    type: 'rect-shape',
    x,
    y,
    width,
    height,
    label: 'Rectangle',
    style: { ...style },
  }
}

export function buildEllipse(
  d: DragCoords,
  zIndex: number,
  style: ElementStyle = DEFAULT_STYLE,
): EllipseElement {
  const { x, y, width, height } = rectFromDrag(d)
  return {
    ...baseFields(nanoid(), zIndex),
    type: 'ellipse',
    x,
    y,
    width,
    height,
    label: 'Ellipse',
    style: { ...style },
  }
}

export function buildLineShape(
  d: DragCoords,
  zIndex: number,
  style: ElementStyle = DEFAULT_STYLE,
): LineShapeElement {
  const { x, y, width, height } = rectFromDrag(d)
  return {
    ...baseFields(nanoid(), zIndex),
    type: 'line-shape',
    x,
    y,
    width,
    height,
    label: 'Line',
    points: [d.startX, d.startY, d.endX, d.endY],
    style: { ...style, fill: 'transparent' },
  }
}

export function buildArrow(
  d: DragCoords,
  zIndex: number,
  style: ElementStyle = DEFAULT_STYLE,
): ArrowElement {
  const { x, y, width, height } = rectFromDrag(d)
  return {
    ...baseFields(nanoid(), zIndex),
    type: 'arrow',
    x,
    y,
    width,
    height,
    label: 'Arrow',
    points: [d.startX, d.startY, d.endX, d.endY],
    style: { ...style, fill: style.stroke },
  }
}

export function buildFreeText(
  posX: number,
  posY: number,
  zIndex: number,
  text = 'Text',
  fontSize = 18,
): FreeTextElement {
  return {
    ...baseFields(nanoid(), zIndex),
    type: 'free-text',
    x: posX,
    y: posY,
    width: Math.max(40, text.length * fontSize * 0.6),
    height: fontSize * 1.4,
    label: 'Text',
    text,
    fontSize,
    style: {
      fill: 'transparent',
      stroke: '#111827',
      strokeWidth: 0,
      opacity: 1,
    },
  }
}
