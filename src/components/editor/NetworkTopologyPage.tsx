import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Cloud,
  CloudOff,
  LayoutDashboard,
  RefreshCw,
  UploadCloud,
} from 'lucide-react'
import { nanoid } from 'nanoid'
import { Button } from '../ui'
import { useCan } from '../../hooks/useCan'
import { useProjectStore } from '../../stores/projectStore'
import { useNetworkTopologyStore } from '../../stores/networkTopologyStore'
import {
  createEmptyTopology,
  TOPOLOGY_EDGE_TYPES,
  type TopologyEdgeType,
  type TopologyNodeType,
} from '../../types/networkTopology'
// `nextDefaultPosition` is still used as a fallback when the topology
// is locked (the user has manually arranged things and we should NOT
// reshuffle on add). When unlocked, `addNode` itself runs the
// auto-layout pass so the supplied position is overwritten — but we
// still need a numerically-sensible default to satisfy the type.
import { TopologyCanvas } from './networkTopology/TopologyCanvas'
import { PropertiesPanel } from './networkTopology/PropertiesPanel'
import { AddNodeDropdown } from './networkTopology/AddNodeDropdown'
import {
  EDGE_LABEL,
  EDGE_STYLE,
  NODE_META,
} from './networkTopology/topologyMeta'
import { formatRelative } from '../../lib/time'

/**
 * M6.1 — Network Topology page.
 *
 * /t/:teamSlug/o/:officeSlug/network — sibling to the floor-plan
 * editor, owns its own canvas and Properties panel. The save state
 * piggybacks on the office payload's debounced sync (see
 * `useOfficeSync`); the indicator on this page mirrors the TopBar
 * idiom so the user gets the same visual vocabulary across pages.
 *
 * Permission-gated on `viewITLayer`. Users without the permission
 * see a friendly redirect-style message rather than a hard 403 — the
 * convention the rest of the editor uses (matches ReportsPage, the
 * audit page, etc.).
 *
 * # Why a separate page (not a tab on the floor plan)
 *
 * The topology is a logical diagram, not a physical layout. The
 * audience is IT consumers (vendor handoff, procurement, audit) who
 * don't care about the floor plan, and the diagram language —
 * vertical bands, typed connections — does not fit the Konva
 * floor-plan canvas. Keeping the surface separate also lets M6.4
 * (PDF export) stay scoped: the topology export is its own one-pager.
 */

type ConnectionDraft = { source: string; target: string }

export function NetworkTopologyPage() {
  const canViewIT = useCan('viewITLayer')
  const officeId = useProjectStore((s) => s.officeId)
  const saveState = useProjectStore((s) => s.saveState)
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt)

  const topology = useNetworkTopologyStore((s) => s.topology)
  const setTopology = useNetworkTopologyStore((s) => s.setTopology)
  const addNode = useNetworkTopologyStore((s) => s.addNode)
  const addEdge = useNetworkTopologyStore((s) => s.addEdge)
  const applyAutoLayout = useNetworkTopologyStore((s) => s.applyAutoLayout)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // Belt-and-braces: ProjectShell hydrates the store, but if the user
  // navigates here on a brand-new office that the shell hasn't yet
  // back-filled, drop in an empty topology so the page renders without
  // null-checks everywhere.
  useEffect(() => {
    if (!topology && officeId) {
      setTopology(createEmptyTopology(officeId))
    }
  }, [topology, officeId, setTopology])

  /**
   * M6.6 — `?focus=<nodeId>` query param. Floor PropertiesPanel
   * navigates here from "Open in topology" with the linked node's id;
   * we select it (so the Properties panel opens) and strip the param
   * from the URL so a back-button doesn't re-trigger the focus on
   * subsequent visits.
   *
   * The topology view doesn't have a programmatic pan/zoom API exposed
   * outside react-flow's context (it's owned by `useReactFlow`, which
   * only resolves inside the canvas). Selecting the node is sufficient
   * for the flow described in the spec — the Properties panel opens,
   * the canvas highlights the selection ring, and the user has a clear
   * visual landing.
   */
  useEffect(() => {
    const focusId = searchParams.get('focus')
    if (!focusId) return
    if (!topology) return
    if (topology.nodes[focusId]) {
      // External-system sync: the URL param is the input, our local
      // selection is the output. The lint rule's general guidance is
      // "don't `setState` in effects," but URL-param-driven selection
      // is exactly the legitimate "subscribe to external state" use
      // case the React docs call out as an exception. The same shape
      // is used in CanvasStage's tool-switch sync effects.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(focusId)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, topology])

  // Tick a state every 10s so the "Saved Xs ago" label stays fresh —
  // same idiom the TopBar uses for its save indicator.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 10_000)
    return () => clearInterval(id)
  }, [])

  /**
   * Pick a starting position for a new node. We try to place it near
   * the canvas center on the first add, then offset subsequent adds
   * by a small diagonal so a user clicking "Add node" several times
   * in a row sees each new card instead of stacking them at the same
   * spot. The offset wraps after a few hops to stay on-canvas.
   *
   * Declared before the permission gate so the hook order stays
   * stable regardless of whether the user has `viewITLayer`.
   */
  const nextDefaultPosition = useMemo(() => {
    return () => {
      const count = topology ? Object.keys(topology.nodes).length : 0
      const baseX = 280
      const baseY = 200
      const offset = (count % 6) * 40
      return { x: baseX + offset, y: baseY + offset }
    }
  }, [topology])

  if (!canViewIT) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            The network topology page is restricted to editors and admins
            with IT access. Ask a team admin if you need access.
          </p>
        </div>
      </div>
    )
  }

  const nodes = topology ? Object.values(topology.nodes) : []
  const isEmpty = nodes.length === 0

  const handleAddNode = (type: TopologyNodeType) => {
    const id = `node-${nanoid(8)}`
    const meta = NODE_META[type]
    addNode({
      id,
      type,
      label: `New ${meta.typeName}`,
      position: nextDefaultPosition(),
      status: 'planned',
    })
    setSelectedId(id)
  }

  const handleConnectionRequest = (source: string, target: string) => {
    setConnectionDraft({ source, target })
  }

  const handleCommitConnection = (edgeType: TopologyEdgeType) => {
    if (!connectionDraft) return
    addEdge({
      id: `edge-${nanoid(8)}`,
      source: connectionDraft.source,
      target: connectionDraft.target,
      type: edgeType,
      label: null,
    })
    setConnectionDraft(null)
  }

  /**
   * "Reset layout" — the user's escape hatch from a messy manual
   * arrangement. Does NOT remove nodes or edges; just runs
   * `applyAutoLayout`, which clears `layoutLocked` and snaps every
   * node back to its band-correct position. M6.2 deliberately moved
   * away from M6.1's destructive "wipe everything" semantics — the
   * only path to wholesale removal is now the per-node delete in the
   * Properties panel.
   */
  const handleResetLayout = () => {
    applyAutoLayout()
  }

  /**
   * "Auto-arrange" — primary entry point for the layered layout. We
   * keep it as a separate button (alongside Reset layout) because the
   * mental model is different: Auto-arrange is "tidy up what I have",
   * while Reset layout is the same thing PLUS clearing the manual
   * lock flag. In M6.2 they actually do the same work — `applyAutoLayout`
   * clears the lock either way — but the UI surfaces both names for
   * discoverability.
   */
  const handleAutoArrange = () => {
    applyAutoLayout()
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10">
        {/* Page header. Title + description on the left, action cluster
            (save indicator, add-node, reset) on the right. */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              Network topology
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 max-w-2xl">
              Design and document your office network. Layered hierarchy,
              typed connections, ready for vendor handoff.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SaveIndicator saveState={saveState} lastSavedAt={lastSavedAt} />
            <AddNodeDropdown onSelect={handleAddNode} variant="primary" />
            <Button
              variant="secondary"
              leftIcon={<LayoutDashboard size={14} aria-hidden="true" />}
              onClick={handleAutoArrange}
              disabled={isEmpty}
              title={
                isEmpty
                  ? 'Nothing to arrange — the topology is empty'
                  : 'Snap every node to its band-correct position'
              }
            >
              Auto-arrange
            </Button>
            <Button
              variant="secondary"
              leftIcon={<RefreshCw size={14} aria-hidden="true" />}
              onClick={handleResetLayout}
              disabled={isEmpty}
              title={
                isEmpty
                  ? 'Nothing to reset — the topology is empty'
                  : 'Reset positions back to the layered hierarchy'
              }
            >
              Reset layout
            </Button>
          </div>
        </div>

        {/* Canvas card. min-h-[640px] gives react-flow enough room to
            mount and renders comfortably above the fold on a 13" laptop. */}
        <div
          className="relative rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden"
          style={{ height: 'min(75vh, 800px)', minHeight: 640 }}
        >
          {isEmpty ? (
            <EmptyState onSelect={handleAddNode} />
          ) : (
            <>
              <TopologyCanvas
                selectedId={selectedId}
                onSelectNode={setSelectedId}
                onRequestConnection={handleConnectionRequest}
              />
              {selectedId && (
                <PropertiesPanel
                  selectedId={selectedId}
                  onClose={() => setSelectedId(null)}
                />
              )}
            </>
          )}
        </div>

        {/* Edge-type picker — popover that prompts the user when a new
            connection is drawn. We render inline (not a Modal) because
            the user is mid-flow and a full modal would feel heavyweight
            for a single-choice picker. */}
        {connectionDraft && (
          <EdgeTypePicker
            onPick={handleCommitConnection}
            onCancel={() => setConnectionDraft(null)}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Empty-state card. Shows a centered "Add your first device to get
 * started" prompt with a dropdown of node types. Mirrors the empty
 * states in ReportsPage / RosterPage so the cross-page idiom stays
 * consistent.
 */
function EmptyState({ onSelect }: { onSelect: (type: TopologyNodeType) => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Add your first device to get started
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Pick a node type below — typically you'd start with the ISP at
          the top, then a firewall, then your core switch and edge
          switches downstream.
        </p>
        <div className="mt-5 inline-flex">
          <AddNodeDropdown onSelect={onSelect} variant="primary" label="Add your first node" />
        </div>
      </div>
    </div>
  )
}

/**
 * Compact picker shown after the user draws a connection between two
 * nodes. Each row is colored to match the legend on the canvas so a
 * user can pick by color rather than by reading the type name. Dismiss
 * with Escape or by clicking the backdrop.
 */
function EdgeTypePicker({
  onPick,
  onCancel,
}: {
  onPick: (t: TopologyEdgeType) => void
  onCancel: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/30 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-label="Choose connection type"
        className="relative w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Choose connection type
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            The color matches the canvas legend.
          </p>
        </div>
        <div className="p-1.5 max-h-80 overflow-y-auto">
          {TOPOLOGY_EDGE_TYPES.map((type) => {
            const style = EDGE_STYLE[type]
            return (
              <button
                key={type}
                type="button"
                onClick={() => onPick(type)}
                className="flex items-center gap-3 w-full px-3 py-2 rounded text-left text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                data-testid={`edge-type-option-${type}`}
              >
                <span
                  aria-hidden="true"
                  className="inline-block w-8 h-0.5"
                  style={{
                    backgroundColor: style.stroke,
                    backgroundImage: style.dasharray
                      ? `repeating-linear-gradient(90deg, ${style.stroke}, ${style.stroke} 4px, transparent 4px, transparent 8px)`
                      : undefined,
                  }}
                />
                <span className="font-medium">{EDGE_LABEL[type]}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {type}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Mirrors the TopBar `SaveIndicator` style/copy so a user moving
 * between the floor plan and the topology page sees the same chip.
 * We pull state directly from `projectStore` because `useOfficeSync`
 * runs at the shell level and writes status there.
 */
function SaveIndicator({
  saveState,
  lastSavedAt,
}: {
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt: string | null
}) {
  if (saveState === 'saving') {
    return (
      <span
        className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap"
        aria-live="polite"
      >
        <UploadCloud size={14} className="animate-pulse" aria-hidden="true" />
        Saving…
      </span>
    )
  }
  if (saveState === 'error') {
    return (
      <span
        className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 whitespace-nowrap"
        aria-live="polite"
      >
        <CloudOff size={14} aria-hidden="true" />
        Save failed — retrying
      </span>
    )
  }
  const relative = formatRelative(lastSavedAt)
  if (!relative) return null
  return (
    <span
      className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 whitespace-nowrap"
      aria-live="polite"
    >
      <Cloud size={14} aria-hidden="true" />
      Saved {relative}
    </span>
  )
}
