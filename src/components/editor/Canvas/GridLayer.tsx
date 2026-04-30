import { Layer, Line } from 'react-konva'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useShallow } from 'zustand/react/shallow'
import { useTheme } from '../../../lib/theme'

interface GridLayerProps {
  width: number
  height: number
}

/**
 * Two-tier blueprint grid.
 *
 * Konva is HTML5 canvas — it can't read CSS variables, so theme-aware
 * colors flow through React props. The minor grid (every `gridSize`
 * units) is a hairline using the paper-line color; the major grid
 * (every 6 minor cells, or whatever the operator's grid size produces
 * as a 48-unit-ish module) is the same color but at higher alpha so it
 * reads as a stronger reference line. The two-tier pattern is the
 * defining visual signature of an architectural drawing — a flat
 * single-tier grid reads as a CAD scaffold or a spreadsheet, neither
 * of which matches the product's drafting-studio identity.
 */
export function GridLayer({ width, height }: GridLayerProps) {
  const { stageX, stageY, stageScale, settings } = useCanvasStore(useShallow((s) => ({
    stageX: s.stageX,
    stageY: s.stageY,
    stageScale: s.stageScale,
    settings: s.settings,
  })))
  const { resolvedTheme } = useTheme()
  // Light: warm paper-line (#E8E4D8). Dark: deep slate-blue hairline so
  // the cyan accent in elements still has somewhere to read against. We
  // keep both within ~1.6:1 of the page background so the grid recedes
  // when no element is selected and emerges when the eye looks for it.
  const lineColor = resolvedTheme === 'dark' ? '#1E2A40' : '#E8E4D8'
  const majorColor = resolvedTheme === 'dark' ? '#243352' : '#D8D2BF'

  if (!settings.showGrid) return null

  const gridSize = settings.gridSize
  // Major grid is every 6 minor cells. Operators usually pick gridSize=8
  // (default) or 16; both produce a major grid that lines up with desk
  // dimensions (≈48-96 units = real-world workstation widths).
  const majorMod = 6

  const minorLines: React.ReactNode[] = []
  const majorLines: React.ReactNode[] = []

  const startX = Math.floor(-stageX / stageScale / gridSize) * gridSize - gridSize
  const startY = Math.floor(-stageY / stageScale / gridSize) * gridSize - gridSize
  const endX = startX + width / stageScale + gridSize * 2
  const endY = startY + height / stageScale + gridSize * 2

  // Vertical lines
  for (let x = startX; x <= endX; x += gridSize) {
    const isMajor = Math.round(x / gridSize) % majorMod === 0
    const target = isMajor ? majorLines : minorLines
    target.push(
      <Line
        key={`v-${x}`}
        points={[x, startY, x, endY]}
        stroke={isMajor ? majorColor : lineColor}
        strokeWidth={(isMajor ? 1 : 0.5) / stageScale}
        listening={false}
      />,
    )
  }

  // Horizontal lines
  for (let y = startY; y <= endY; y += gridSize) {
    const isMajor = Math.round(y / gridSize) % majorMod === 0
    const target = isMajor ? majorLines : minorLines
    target.push(
      <Line
        key={`h-${y}`}
        points={[startX, y, endX, y]}
        stroke={isMajor ? majorColor : lineColor}
        strokeWidth={(isMajor ? 1 : 0.5) / stageScale}
        listening={false}
      />,
    )
  }

  // Minor lines first so major lines paint on top — gives the major
  // grid a crisper read at the intersections.
  return (
    <Layer listening={false}>
      {minorLines}
      {majorLines}
    </Layer>
  )
}
