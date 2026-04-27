import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, X, Link2, Unlink, ExternalLink, Wand2 } from 'lucide-react'
import { Button, Input } from '../../ui'
import { useNetworkTopologyStore } from '../../../stores/networkTopologyStore'
import { useFloorStore } from '../../../stores/floorStore'
import {
  type TopologyNode,
  type TopologyNodeStatus,
  TOPOLOGY_NODE_STATUSES,
} from '../../../types/networkTopology'
import { NODE_META, STATUS_OPTIONS } from './topologyMeta'
import { LinkFloorElementModal } from './LinkFloorElementModal'
import {
  COMPATIBLE_FLOOR_TYPES,
  findElementsBySerial,
  findUnlinkedFloorElements,
} from '../../../lib/networkTopologyLinkage'

/**
 * M6.1 — Floating properties panel for the selected topology node.
 *
 * Lives inline within `NetworkTopologyPage` rather than as a new tab on
 * the editor's RightSidebar because:
 *
 *   1. The topology page is a separate surface from the floor plan; the
 *      RightSidebar is tightly coupled to canvas-mode state (selected
 *      element id from elementsStore, layer-visibility toggles,
 *      Devices panel from M3). Cross-wiring would smear topology
 *      concerns into floor-plan code paths.
 *   2. The panel only exists when a node is selected. A floating
 *      surface that slides in/out beside the canvas is a cleaner
 *      affordance than reusing the global tab strip.
 *
 * Edits commit on blur (text inputs) or change (select), matching the
 * floor-plan PropertiesPanel idiom — there's no "save" button on the
 * panel itself; the page-level save indicator covers the whole flow.
 *
 * # Why two components
 *
 * The form fields keep local state for the typing buffer (so we don't
 * fire a debounced save on every keystroke). When the selected node
 * changes the local state must reset, which an effect-driven reset
 * would handle but trips the `set-state-in-effect` lint rule. Instead
 * we render the form as a separate `<NodeForm key={node.id} />`
 * component — React tears down and remounts on key change, giving us
 * a fresh instance with state seeded from the new node's props. No
 * effect, no cascading render, no rule violation.
 */

interface Props {
  /** Selected node id, or null when nothing is selected. */
  selectedId: string | null
  onClose: () => void
}

export function PropertiesPanel({ selectedId, onClose }: Props) {
  const node = useNetworkTopologyStore((s) =>
    selectedId ? (s.topology?.nodes[selectedId] ?? null) : null,
  )
  if (!node) return null
  return <NodeForm key={node.id} node={node} onClose={onClose} />
}

/**
 * Per-node form. The `key={node.id}` on the wrapper ensures this
 * component remounts when the user picks a different node, which
 * naturally resets the local state with seeds from the new node's
 * fields — no effect-based reset required.
 */
function NodeForm({ node, onClose }: { node: TopologyNode; onClose: () => void }) {
  const updateNode = useNetworkTopologyStore((s) => s.updateNode)
  const removeNode = useNetworkTopologyStore((s) => s.removeNode)
  const unlinkNode = useNetworkTopologyStore((s) => s.unlinkNode)
  const linkNodeToElement = useNetworkTopologyStore((s) => s.linkNodeToElement)
  const topology = useNetworkTopologyStore((s) => s.topology)
  const floors = useFloorStore((s) => s.floors)

  const navigate = useNavigate()
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()

  const [label, setLabel] = useState(node.label ?? '')
  const [model, setModel] = useState(node.model ?? '')
  const [sku, setSku] = useState(node.sku ?? '')
  const [vendor, setVendor] = useState(node.vendor ?? '')
  const [serialNumber, setSerialNumber] = useState(node.serialNumber ?? '')
  const [notes, setNotes] = useState(node.notes ?? '')
  const [linkModalOpen, setLinkModalOpen] = useState(false)

  const meta = NODE_META[node.type]
  const Icon = meta.Icon

  // Resolve the linked floor element + owning floor for the read-only
  // "Linked to ..." display. Computed inline — the React Compiler
  // tracks dependencies automatically and re-runs only when the inputs
  // change. The lookup is O(floors × elements) on a miss, fine for an
  // enterprise office (~50–500 elements / floor).
  let linkedDetails: {
    floor: (typeof floors)[number]
    element: (typeof floors)[number]['elements'][string]
  } | null = null
  if (node.floorElementId) {
    for (const floor of floors) {
      const el = floor.elements[node.floorElementId]
      if (el) {
        linkedDetails = { floor, element: el }
        break
      }
    }
  }

  // "Auto-link by serial" affordance on the unlinked-state view —
  // counts the candidates so the link-button can show "3 candidates by
  // serial number" as a one-click CTA. Computed inline (rather than
  // memoised manually) so the React Compiler can manage memoisation
  // without fighting our useMemo wrapper.
  let candidateCount = 0
  if (!node.floorElementId) {
    const candidates = findUnlinkedFloorElements(floors, topology, node.type)
    const matches = findElementsBySerial(floors, node.serialNumber).filter((m) =>
      candidates.some((c) => c.element.id === m.element.id),
    )
    candidateCount = matches.length
  }

  // Compatibility gate — node types whose `COMPATIBLE_FLOOR_TYPES`
  // entry is empty have no floor representation in M1 (ISP, cloud,
  // endpoint group, switches). For those we still render the section
  // header but show a disabled affordance with explanatory copy
  // rather than a button that would open an empty picker.
  const linkable = COMPATIBLE_FLOOR_TYPES[node.type].length > 0

  const handleAutoLink = () => {
    if (!node.serialNumber) return
    const candidates = findUnlinkedFloorElements(floors, topology, node.type)
    const matches = findElementsBySerial(floors, node.serialNumber).filter((m) =>
      candidates.some((c) => c.element.id === m.element.id),
    )
    if (matches.length === 0) return
    linkNodeToElement(node.id, matches[0].element.id)
  }

  const handleOpenOnFloorPlan = () => {
    if (!linkedDetails || !teamSlug || !officeSlug) return
    // The MapView ?focus=<id> handler walks every floor for an element
    // with that id and switches to the owning floor + pans the canvas
    // to it (M6.1 verified in research). The id alone is enough; we
    // don't need to pass `floor=` because the focus handler picks the
    // right floor automatically.
    navigate(
      `/t/${teamSlug}/o/${officeSlug}/map?focus=${encodeURIComponent(linkedDetails.element.id)}`,
    )
  }

  /**
   * Commit a single text field. Empty strings coerce to `null` so an
   * "unset" field round-trips through migration as missing rather
   * than empty — keeps the BOM-derivation (M6.3) simple to reason
   * about.
   */
  const commit = (key: keyof TopologyNode, value: string) => {
    const trimmed = value.trim()
    updateNode(node.id, { [key]: trimmed.length > 0 ? trimmed : null })
  }

  return (
    <aside
      role="region"
      aria-label="Node properties"
      className="absolute top-3 right-3 bottom-3 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg flex flex-col overflow-hidden"
    >
      {/* Header — type icon, editable label, close button. */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-gray-800">
        <span
          className={[
            'flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded',
            meta.tile,
          ].join(' ')}
        >
          <Icon size={16} aria-hidden="true" />
        </span>
        <Input
          aria-label="Node label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={(e) =>
            updateNode(node.id, { label: e.target.value.trim() || meta.typeName })
          }
          size="sm"
          className="flex-1"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close properties panel"
          className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Identity section — vendor metadata that drives the BOM. */}
        <Section title="Identity">
          <Field label="Vendor">
            <Input
              size="sm"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              onBlur={(e) => commit('vendor', e.target.value)}
              placeholder="e.g. Cisco Meraki"
            />
          </Field>
          <Field label="Model">
            <Input
              size="sm"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onBlur={(e) => commit('model', e.target.value)}
              placeholder="e.g. MX450"
            />
          </Field>
          <Field label="SKU">
            <Input
              size="sm"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              onBlur={(e) => commit('sku', e.target.value)}
              placeholder="Stock-keeping unit"
              className="tabular-nums"
            />
          </Field>
          <Field label="Serial number">
            <Input
              size="sm"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              onBlur={(e) => commit('serialNumber', e.target.value)}
              placeholder="e.g. Q2XX-XXXX-XXXX"
              className="tabular-nums"
            />
          </Field>
        </Section>

        {/* Status section. The 5 states match the M1 deviceStatus
            enum so a node linked to a floor-plan element (M6.6) keeps
            the same vocabulary. */}
        <Section title="Status">
          <select
            aria-label="Operational status"
            value={node.status ?? ''}
            onChange={(e) => {
              const v = e.target.value as TopologyNodeStatus | ''
              updateNode(node.id, {
                status:
                  v === '' || !TOPOLOGY_NODE_STATUSES.includes(v as TopologyNodeStatus)
                    ? null
                    : (v as TopologyNodeStatus),
              })
            }}
            className="block w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <option value="">— Unset —</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Section>

        {/* Free-form notes. Surfaces in the BOM (M6.3) as a "Notes"
            column and on hover in M6.2. */}
        <Section title="Notes">
          <textarea
            aria-label="Node notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={(e) => commit('notes', e.target.value)}
            rows={3}
            className="block w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            placeholder="Anything contextual — VLANs, ports, runbook links…"
          />
        </Section>

        {/* Floor placement section — M6.6.
            When linked: read-out + Open-on-floor-plan + Unlink.
            When unlinked: Link-to-floor-element opens the picker, with
            a secondary "Auto-link by serial" link-button when the
            node has a serial that matches one or more compatible
            floor elements. */}
        <Section title="Floor placement">
          {node.floorElementId ? (
            <div className="space-y-2">
              {linkedDetails ? (
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  Linked to{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {linkedDetails.element.label || linkedDetails.element.id}
                  </span>{' '}
                  on{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {linkedDetails.floor.name}
                  </span>
                </div>
              ) : (
                // The link points at an id we couldn't find — could
                // happen mid-deletion or after a failed sync. Surface
                // the dangling id so the operator can unlink and move
                // on rather than seeing a silent empty state.
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  Linked to a floor element that's no longer on any floor
                  (<span className="font-mono">{node.floorElementId}</span>). Unlink to clean up.
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<ExternalLink size={12} aria-hidden="true" />}
                  onClick={handleOpenOnFloorPlan}
                  disabled={!linkedDetails || !teamSlug || !officeSlug}
                >
                  Open on floor plan
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Unlink size={12} aria-hidden="true" />}
                  onClick={() => unlinkNode(node.id)}
                >
                  Unlink
                </Button>
              </div>
            </div>
          ) : linkable ? (
            <div className="space-y-2">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Link2 size={12} aria-hidden="true" />}
                onClick={() => setLinkModalOpen(true)}
              >
                Link to floor element
              </Button>
              {candidateCount > 0 && (
                <button
                  type="button"
                  onClick={handleAutoLink}
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300 hover:underline"
                >
                  <Wand2 size={11} aria-hidden="true" />
                  Auto-link by serial — {candidateCount} candidate
                  {candidateCount === 1 ? '' : 's'}
                </button>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              {meta.typeName} nodes don't have a physical floor representation.
            </div>
          )}
        </Section>
      </div>

      {/* Destructive footer — single delete button. Removing the node
          cascades to its incident edges (see store cascade comment). */}
      <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <Button
          variant="danger"
          size="sm"
          leftIcon={<Trash2 size={12} aria-hidden="true" />}
          onClick={() => {
            removeNode(node.id)
            onClose()
          }}
        >
          Delete node
        </Button>
      </div>

      {/* Picker modal renders into a portal so it overlays the canvas
          rather than being clipped to the Properties aside. */}
      {linkModalOpen && (
        <LinkFloorElementModal
          open={linkModalOpen}
          node={node}
          onClose={() => setLinkModalOpen(false)}
        />
      )}
    </aside>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-600 dark:text-gray-300 mb-0.5">
        {label}
      </span>
      {children}
    </label>
  )
}
