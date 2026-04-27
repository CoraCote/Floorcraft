import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react'
import { type TopologyEdgeType } from '../../../types/networkTopology'
import { EDGE_LABEL, EDGE_STYLE } from './topologyMeta'

/**
 * M6.1 — typed edge renderer.
 *
 * Stroke colors + dash styles live in `topologyMeta.ts` so the canvas,
 * the edge-type picker, and (M6.4) the PDF export render the same
 * vocabulary without duplicating tables.
 *
 * Layout: smooth-step paths render orthogonal-with-rounded-corners,
 * which mirrors the JSON-Crack idiom and keeps a layered topology
 * crossing-free when nodes sit in vertical bands.
 *
 * Labels render inside a small white pill via `EdgeLabelRenderer` (a
 * portal that drops the label outside the SVG so we can use real DOM
 * — text wrapping, dark-mode text colors — without fighting SVG's
 * `foreignObject` quirks).
 */

export interface TopologyEdgeData extends Record<string, unknown> {
  type: TopologyEdgeType
  label?: string | null
}

export function TopologyEdgeRenderer({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
}: EdgeProps) {
  const d = (data as TopologyEdgeData | undefined) ?? { type: 'sfp-10g' as TopologyEdgeType }
  const style = EDGE_STYLE[d.type] ?? EDGE_STYLE['sfp-10g']
  const labelText = d.label ?? EDGE_LABEL[d.type]

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: style.stroke,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: style.dasharray,
        }}
      />
      {labelText && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className="absolute pointer-events-none px-1.5 py-0.5 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-[10px] font-semibold text-gray-700 dark:text-gray-200 shadow-sm tabular-nums"
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
