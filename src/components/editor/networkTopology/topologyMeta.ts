import {
  Globe,
  ShieldCheck,
  Server,
  Cloud,
  Wifi,
  Monitor,
  Network,
  Cable,
  type LucideIcon,
} from 'lucide-react'
import {
  type TopologyEdgeType,
  type TopologyNodeStatus,
  type TopologyNodeType,
} from '../../../types/networkTopology'

/**
 * Presentational metadata tables shared by `TopologyNode`,
 * `TopologyEdge`, the Properties panel, and the Add-node dropdown.
 *
 * Lives in its own file so the component files only export
 * components — eslint's `react-refresh/only-export-components` rule
 * wants HMR-friendly modules, and this is also where future
 * surfaces (template stamping in M6.5, BOM derivation in M6.3) will
 * read from.
 */

export interface NodeMeta {
  Icon: LucideIcon
  /** Tailwind utility classes for the colored accent border. */
  accent: string
  /** Tailwind classes for the icon-tile background. */
  tile: string
  /** Friendly type name for empty labels and dropdown rows. */
  typeName: string
}

export const NODE_META: Record<TopologyNodeType, NodeMeta> = {
  isp: {
    Icon: Globe,
    accent: 'border-cyan-500',
    tile: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
    typeName: 'ISP',
  },
  'wan-switch': {
    Icon: Cable,
    accent: 'border-sky-500',
    tile: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
    typeName: 'WAN switch',
  },
  firewall: {
    Icon: ShieldCheck,
    accent: 'border-rose-500',
    tile: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    typeName: 'Firewall',
  },
  cloud: {
    Icon: Cloud,
    accent: 'border-teal-500',
    tile: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
    typeName: 'Cloud',
  },
  'core-switch': {
    Icon: Server,
    accent: 'border-violet-500',
    tile: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
    typeName: 'Core switch',
  },
  'edge-switch': {
    Icon: Network,
    accent: 'border-blue-500',
    tile: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    typeName: 'Edge switch',
  },
  'access-point': {
    Icon: Wifi,
    accent: 'border-emerald-500',
    tile: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    typeName: 'Access point',
  },
  'endpoint-group': {
    Icon: Monitor,
    accent: 'border-gray-400',
    tile: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    typeName: 'Endpoints',
  },
}

/**
 * Status-pill color table. Mirrors M1 status colors so an operator who
 * knows the floor-plan device-status badges sees the same vocabulary
 * here. The pill is also the primary signal in the empty-vendor-data
 * case — a node without a model number still tells you whether it's
 * planned, installed, or live at a glance.
 */
export const STATUS_PILL: Record<TopologyNodeStatus, string> = {
  planned: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  installed: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  live: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  decommissioned: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  broken: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
}

export const STATUS_LABEL: Record<TopologyNodeStatus, string> = {
  planned: 'Planned',
  installed: 'Installed',
  live: 'Live',
  decommissioned: 'Decommissioned',
  broken: 'Broken',
}

export const STATUS_OPTIONS = Object.entries(STATUS_LABEL).map(
  ([value, label]) => ({ value: value as TopologyNodeStatus, label }),
)

export interface EdgeStyle {
  /** SVG stroke color (also used for the label pill border). */
  stroke: string
  /** SVG stroke-dasharray; null for a solid line. */
  dasharray?: string
}

/**
 * Edge stroke colors map directly to the PDF reference legend so the
 * canvas, the edge-type picker, and any future export render the same
 * vocabulary.
 */
export const EDGE_STYLE: Record<TopologyEdgeType, EdgeStyle> = {
  wan: { stroke: '#06b6d4' },
  'sfp-10g': { stroke: '#3b82f6' },
  'fiber-10g': { stroke: '#22c55e' },
  'sfp-distribution': { stroke: '#8b5cf6' },
  poe: { stroke: '#60a5fa' },
  'cloud-mgmt': { stroke: '#14b8a6', dasharray: '4 4' },
}

export const EDGE_LABEL: Record<TopologyEdgeType, string> = {
  wan: 'WAN',
  'sfp-10g': '10G SFP+',
  'fiber-10g': '10G Fiber',
  'sfp-distribution': '10G SFP+',
  poe: 'PoE',
  'cloud-mgmt': 'Cloud mgmt',
}
