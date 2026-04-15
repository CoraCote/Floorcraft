import { Layer, Line } from 'react-konva'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useShallow } from 'zustand/react/shallow'

interface GridLayerProps {
  width: number
  height: number
}

export function GridLayer({ width, height }: GridLayerProps) {
  const { stageX, stageY, stageScale, settings } = useCanvasStore(useShallow((s) => ({ stageX: s.stageX, stageY: s.stageY, stageScale: s.stageScale, settings: s.settings })))

  if (!settings.showGrid) return null

  const gridSize = settings.gridSize
  const lines: React.ReactNode[] = []

  const startX = Math.floor(-stageX / stageScale / gridSize) * gridSize - gridSize
  const startY = Math.floor(-stageY / stageScale / gridSize) * gridSize - gridSize
  const endX = startX + width / stageScale + gridSize * 2
  const endY = startY + height / stageScale + gridSize * 2

  for (let x = startX; x <= endX; x += gridSize) {
    lines.push(
      <Line key={`v-${x}`} points={[x, startY, x, endY]} stroke="#E5E7EB" strokeWidth={0.5 / stageScale} listening={false} />
    )
  }

  for (let y = startY; y <= endY; y += gridSize) {
    lines.push(
      <Line key={`h-${y}`} points={[startX, y, endX, y]} stroke="#E5E7EB" strokeWidth={0.5 / stageScale} listening={false} />
    )
  }

  return <Layer listening={false}>{lines}</Layer>
}
