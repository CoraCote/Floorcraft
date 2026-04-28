import { useMemo, useState } from 'react'
import { CheckCircle2, LayoutTemplate, Sparkles } from 'lucide-react'
import { Button, Modal, ModalBody, ModalFooter } from '../../ui'
import { useNetworkTopologyStore } from '../../../stores/networkTopologyStore'
import {
  buildTopologyTemplate,
  listTopologyTemplates,
  type TopologyTemplateId,
  type TopologyTemplateSummary,
} from '../../../lib/networkTopology/templates'

/**
 * M6.5 — Topology templates dialog.
 *
 * # User flow
 *
 *   Step 1: Choose      — Three template cards (Single-site SMB, HQ +
 *                          branch, Hub-and-spoke 3-branch). Picking one
 *                          highlights it; the user can re-pick before
 *                          confirming.
 *
 *   Step 2: Confirm     — When the topology is non-empty, an explicit
 *                          "this will merge ## new nodes into your
 *                          existing graph" callout appears so the user
 *                          knows we're not wiping. (Empty topology
 *                          skips the warning entirely.)
 *
 *   Step 3: Apply       — Walk the template's nodes through `addNode`
 *                          one at a time, then edges through `addEdge`,
 *                          then a single `applyAutoLayout()` so the
 *                          new nodes settle into their canonical band.
 *                          Dialog closes on success.
 *
 * # Why merge instead of replace
 *
 * "Replace" would force a clear-and-rebuild flow that destroys
 * anything the user typed (custom labels, serial numbers, links to
 * floor elements). Merge is non-destructive — the user can apply a
 * template into a partially-built topology and clean up afterwards
 * via the existing remove-node UI. The button copy makes this
 * explicit ("Add ## nodes" rather than "Apply template").
 */

interface Props {
  open: boolean
  onClose: () => void
}

export function TemplatesDialog({ open, onClose }: Props) {
  // Gate component pattern (mirrors MerakiSyncDialog) — body re-mounts
  // fresh every open so we never carry stale selection state across
  // two separate apply sessions.
  if (!open) return null
  return <TemplatesDialogBody onClose={onClose} />
}

function TemplatesDialogBody({ onClose }: { onClose: () => void }) {
  const topology = useNetworkTopologyStore((s) => s.topology)
  const addNode = useNetworkTopologyStore((s) => s.addNode)
  const addEdge = useNetworkTopologyStore((s) => s.addEdge)
  const applyAutoLayout = useNetworkTopologyStore((s) => s.applyAutoLayout)

  const templates = useMemo(() => listTopologyTemplates(), [])
  const [selectedId, setSelectedId] = useState<TopologyTemplateId | null>(null)
  const [applying, setApplying] = useState(false)
  const [appliedSummary, setAppliedSummary] = useState<{
    name: string
    added: number
  } | null>(null)

  const existingNodeCount = topology
    ? Object.keys(topology.nodes).length
    : 0
  const isEmpty = existingNodeCount === 0

  const selected = templates.find((t) => t.id === selectedId) ?? null

  function handleApply() {
    if (!topology || !selected || applying) return
    setApplying(true)
    const { nodes, edges } = buildTopologyTemplate(selected.id)
    for (const node of nodes) addNode(node)
    for (const edge of edges) addEdge(edge)
    // One layout pass after the batch — insertions auto-layout per
    // node by default, but a single explicit pass at the end lands
    // the whole template in one consistent dispatch tick.
    applyAutoLayout()
    setAppliedSummary({ name: selected.name, added: nodes.length })
    // Auto-dismiss matches MerakiSyncDialog's 1.2s success pattern.
    setTimeout(onClose, 1200)
  }

  if (appliedSummary) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Template added"
        size="lg"
        preventBackdropClose
      >
        <SuccessStep summary={appliedSummary} />
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Start from a template" size="lg">
      <ModalBody>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Pick a starter scaffold. We'll add the nodes and edges into
          your topology and run auto-arrange so they settle into the
          canonical layered layout.
        </p>

        {!isEmpty && (
          <div
            className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
            role="note"
          >
            <Sparkles size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              Your topology already has {existingNodeCount}{' '}
              {existingNodeCount === 1 ? 'node' : 'nodes'}. Templates
              merge — we'll add new nodes alongside what's there, never
              overwrite. Untick or remove anything you don't want
              afterwards.
            </span>
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              selected={selectedId === t.id}
              onSelect={() => setSelectedId(t.id)}
            />
          ))}
        </div>

        {selected && (
          <div className="mt-5 rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-800 dark:text-blue-300">
            <span className="font-semibold">{selected.name}:</span>{' '}
            {selected.description}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={applying}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleApply}
          disabled={!selected || applying || !topology}
          data-testid="templates-apply"
        >
          {selected
            ? `Add ${selected.nodeCount} ${
                selected.nodeCount === 1 ? 'node' : 'nodes'
              }`
            : 'Add nodes'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Template card
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: TopologyTemplateSummary
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`templates-card-${template.id}`}
      aria-pressed={selected}
      className={[
        'relative text-left rounded-lg border p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        selected
          ? 'border-blue-500 ring-2 ring-blue-500/40 bg-blue-50/60 dark:bg-blue-950/30'
          : 'border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-800 hover:bg-gray-50 dark:hover:bg-gray-900/40',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
        <LayoutTemplate size={16} aria-hidden="true" />
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {template.name}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {template.tagline}
      </p>
      <div className="mt-3 flex gap-2 text-[11px] text-gray-600 dark:text-gray-400">
        <span className="inline-flex items-center rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5">
          {template.nodeCount} nodes
        </span>
        <span className="inline-flex items-center rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5">
          {template.edgeCount} links
        </span>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Success step
// ---------------------------------------------------------------------------

function SuccessStep({
  summary,
}: {
  summary: { name: string; added: number }
}) {
  return (
    <ModalBody>
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2
          size={36}
          className="text-emerald-500"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Added "{summary.name}"
          </p>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            {summary.added}{' '}
            {summary.added === 1 ? 'node' : 'nodes'} dropped onto the
            canvas. Auto-arrange has settled the layout.
          </p>
        </div>
      </div>
    </ModalBody>
  )
}
