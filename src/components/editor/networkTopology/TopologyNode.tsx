import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  type TopologyNodeStatus,
  type TopologyNodeType,
} from '../../../types/networkTopology'
import { NODE_META, STATUS_LABEL, STATUS_PILL } from './topologyMeta'

/**
 * M6.1 — single node renderer for every `TopologyNodeType`.
 *
 * The branching by type lives inside one component (rather than
 * eight separate ones registered with react-flow's `nodeTypes` map)
 * because:
 *
 *   1. The visual shape is uniform across types — a card with an icon,
 *      a title, optional model subtext, and a status pill. Splitting
 *      into eight components would copy that chrome eight times.
 *   2. The type-driven differences (icon, accent color, default
 *      handle layout) are a small lookup table — kept in
 *      `topologyMeta.ts` because the Properties panel and the
 *      Add-node dropdown read from the same table.
 *
 * react-flow registers this as a single custom node type
 * `'topology'`; the actual `TopologyNodeType` discriminant is read
 * from `data.type` at render time.
 */

export interface TopologyNodeData extends Record<string, unknown> {
  type: TopologyNodeType
  label: string
  model?: string | null
  status?: TopologyNodeStatus | null
}

/**
 * Card-style topology node. The handles sit on the top and bottom edges
 * because the canonical Meraki layout is a vertical hierarchy
 * (Internet at the top, endpoints at the bottom) — most edges flow
 * vertically, and surfacing both poles lets the user draw an
 * upstream-or-downstream connection without dragging through the card.
 */
export function TopologyNodeCard({ data, selected }: NodeProps) {
  const d = data as TopologyNodeData
  const meta = NODE_META[d.type]
  const Icon = meta.Icon

  return (
    <div
      className={[
        'relative w-[180px] rounded-lg border-2 bg-white dark:bg-gray-900 shadow-sm transition-all',
        meta.accent,
        selected
          ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-gray-950'
          : '',
      ].join(' ')}
    >
      {/* Top handle — incoming connections (e.g. an upstream switch). */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white dark:!border-gray-900"
      />

      <div className="px-3 py-2.5 flex items-start gap-2.5">
        <div
          className={[
            'flex-shrink-0 w-8 h-8 rounded flex items-center justify-center',
            meta.tile,
          ].join(' ')}
        >
          <Icon size={18} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">
            {d.label || meta.typeName}
          </div>
          {d.model ? (
            <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate tabular-nums">
              {d.model}
            </div>
          ) : (
            <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
              {meta.typeName}
            </div>
          )}
        </div>
      </div>

      {d.status && (
        <div className="px-3 pb-2">
          <span
            className={[
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
              STATUS_PILL[d.status],
            ].join(' ')}
          >
            {STATUS_LABEL[d.status]}
          </span>
        </div>
      )}

      {/* Bottom handle — outgoing connections (e.g. to an edge switch). */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white dark:!border-gray-900"
      />
    </div>
  )
}
