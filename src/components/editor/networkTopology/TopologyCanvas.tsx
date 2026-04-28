import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node as RFNode,
  type Edge as RFEdge,
  type Connection,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useRef } from 'react'
import { useNetworkTopologyStore } from '../../../stores/networkTopologyStore'
import {
  captureTopologyImage,
  type CapturedTopologyImage,
} from './captureTopologyImage'
import { useFloorStore } from '../../../stores/floorStore'
import { TopologyNodeCard, type TopologyNodeData } from './TopologyNode'
import {
  TopologyEdgeRenderer,
  type TopologyEdgeData,
} from './TopologyEdge'

/**
 * M6.1 — react-flow wrapper that bridges our zustand topology store
 * to react-flow's controlled-state API.
 *
 * # Why a thin bridge
 *
 * react-flow expects `nodes: Node[]` and `edges: Edge[]` arrays. Our
 * store keeps `Record<id, TopologyNode>` for O(1) updates and a stable
 * key for the persistence layer. The transform happens in `useMemo`
 * here so neither side has to know about the other's shape.
 *
 * # Connection drawing
 *
 * Drawing a connection from one node to another fires `onConnect` with
 * a `Connection { source, target }`. We surface that to the caller via
 * `onRequestConnection` so the page can prompt for an edge type before
 * the edge actually lands in the store — without that hop we'd have
 * to default the edge type to a single value and force the user to
 * change it after the fact.
 *
 * # Strict mode + JSDOM
 *
 * react-flow needs a non-zero parent size to render. The page sets a
 * `min-h-[640px]` on the surrounding card, which is enough for the
 * canvas to mount cleanly. JSDOM tests SHOULD NOT mount this
 * component directly — they should mock at the test boundary.
 */

/**
 * Imperative capture handle wired up via `onCaptureReady` so the page
 * (`NetworkTopologyPage`) can trigger a PDF export from outside the
 * react-flow provider. We can't expose `useReactFlow` directly to the
 * page — it only resolves inside `ReactFlowProvider`. The handle
 * pattern keeps the provider boundary clean while still letting the
 * outer toolbar drive the export.
 */
export type TopologyCaptureFn = () => Promise<CapturedTopologyImage | null>

interface Props {
  selectedId: string | null
  onSelectNode: (id: string | null) => void
  onRequestConnection: (source: string, target: string) => void
  /**
   * Receives a capture function once the canvas has mounted. The page
   * stores the ref + invokes it on Export PDF. Pass `null` when the
   * caller doesn't need export support (tests, future read-only
   * surfaces).
   */
  onCaptureReady?: (capture: TopologyCaptureFn | null) => void
}

const NODE_TYPES: NodeTypes = { topology: TopologyNodeCard }
const EDGE_TYPES: EdgeTypes = { topology: TopologyEdgeRenderer }

function CanvasInner({
  selectedId,
  onSelectNode,
  onRequestConnection,
  onCaptureReady,
}: Props) {
  const topology = useNetworkTopologyStore((s) => s.topology)
  const applyNodeChanges = useNetworkTopologyStore((s) => s.applyNodeChanges)
  const applyEdgeChanges = useNetworkTopologyStore((s) => s.applyEdgeChanges)
  const reactFlow = useReactFlow()
  const containerRef = useRef<HTMLDivElement | null>(null)
  // M6.6: pull floors so the per-node link badge can resolve a friendly
  // "AP-12 on Engineering loft" tooltip. The dependency means the badge
  // re-renders if the linked element is renamed or its floor renamed —
  // both rare events but worth getting right.
  const floors = useFloorStore((s) => s.floors)

  // Transform store → react-flow shape. Recomputes on every topology
  // change; cheap because the maps are small (target ~50 nodes for an
  // enterprise office) and react-flow diffs internally.
  const nodes = useMemo<RFNode<TopologyNodeData>[]>(() => {
    if (!topology) return []
    return Object.values(topology.nodes).map((n) => {
      let linkedLabel: string | null = null
      if (n.floorElementId) {
        // Walk floors for the element + owning floor name. O(floors ×
        // elements) on a miss but only for linked nodes; an
        // unenterprise office tops out at ~5 floors × 500 elements.
        for (const f of floors) {
          const el = f.elements[n.floorElementId]
          if (el) {
            linkedLabel = `${el.label || el.id} on ${f.name}`
            break
          }
        }
      }
      return {
        id: n.id,
        type: 'topology',
        position: n.position,
        data: {
          type: n.type,
          label: n.label,
          model: n.model,
          status: n.status,
          floorElementId: n.floorElementId ?? null,
          linkedLabel,
        },
        selected: n.id === selectedId,
      }
    })
  }, [topology, selectedId, floors])

  const edges = useMemo<RFEdge<TopologyEdgeData>[]>(() => {
    if (!topology) return []
    return Object.values(topology.edges).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'topology',
      data: { type: e.type, label: e.label },
    }))
  }, [topology])

  const onNodesChange: OnNodesChange = (changes) => {
    applyNodeChanges(changes)
    // Surface select changes to the parent so the Properties panel
    // can open. We deliberately read selection *changes* (not the
    // node's selection state in our store) because react-flow owns
    // the selection UI.
    for (const c of changes) {
      if (c.type === 'select') {
        onSelectNode(c.selected ? c.id : null)
      }
    }
  }

  const onEdgesChange: OnEdgesChange = (changes) => {
    applyEdgeChanges(changes)
  }

  const onConnect: OnConnect = (conn: Connection) => {
    if (!conn.source || !conn.target) return
    if (conn.source === conn.target) return
    onRequestConnection(conn.source, conn.target)
  }

  // Register the capture function with the parent. Re-runs when
  // `reactFlow` is replaced (cheap and rare); we rebuild the closure
  // each time so `getNodes()` reads the latest measured-dimension
  // snapshot react-flow holds internally.
  useEffect(() => {
    if (!onCaptureReady) return
    const capture: TopologyCaptureFn = async () => {
      const container = containerRef.current
      if (!container) return null
      // `reactFlow.getNodes()` returns nodes with `measured` width/height
      // populated by react-flow's internal observer — exactly what
      // `getNodesBounds` needs to compute a non-degenerate bounding box.
      const measured = reactFlow.getNodes()
      return captureTopologyImage({ container, nodes: measured })
    }
    onCaptureReady(capture)
    return () => onCaptureReady(null)
  }, [onCaptureReady, reactFlow])

  // Wrapper div owns the ref because `<ReactFlow ref>` types vary across
  // xyflow minor versions; an outer div is type-stable and gives us a
  // single querySelector root for the capture helper.
  return (
    <div ref={containerRef} className="w-full h-full">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onPaneClick={() => onSelectNode(null)}
      fitView
      // 12px snap to keep the layered hierarchy aligned without the
      // user fighting pixel drift.
      snapToGrid
      snapGrid={[12, 12]}
      // M6.2: smoothstep is the default routing for any edge that
      // doesn't get re-keyed through our custom `topology` renderer.
      // The custom renderer already uses `getSmoothStepPath`, so this
      // is belt-and-braces for the brief window between connect and
      // store-write where react-flow may render with a default style.
      defaultEdgeOptions={{ type: 'smoothstep' }}
      proOptions={{ hideAttribution: true }}
      colorMode="system"
    >
      <Background gap={24} size={1} />
      <Controls position="bottom-left" />
      <MiniMap
        position="bottom-right"
        pannable
        zoomable
        maskColor="rgba(15, 23, 42, 0.06)"
      />
    </ReactFlow>
    </div>
  )
}

export function TopologyCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}
