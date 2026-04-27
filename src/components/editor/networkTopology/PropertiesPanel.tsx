import { useState } from 'react'
import { Trash2, X, Link2 } from 'lucide-react'
import { Button, Input } from '../../ui'
import { useNetworkTopologyStore } from '../../../stores/networkTopologyStore'
import {
  type TopologyNode,
  type TopologyNodeStatus,
  TOPOLOGY_NODE_STATUSES,
} from '../../../types/networkTopology'
import { NODE_META, STATUS_OPTIONS } from './topologyMeta'

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

  const [label, setLabel] = useState(node.label ?? '')
  const [model, setModel] = useState(node.model ?? '')
  const [sku, setSku] = useState(node.sku ?? '')
  const [vendor, setVendor] = useState(node.vendor ?? '')
  const [serialNumber, setSerialNumber] = useState(node.serialNumber ?? '')
  const [notes, setNotes] = useState(node.notes ?? '')

  const meta = NODE_META[node.type]
  const Icon = meta.Icon

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

        {/* Floor placement section — M6.6 will wire this; M6.1 just
            shows the read-only state when a link already exists, and
            renders a non-functional "Link to floor element" affordance
            with a tooltip when no link is set. */}
        <Section title="Floor placement">
          {node.floorElementId ? (
            <div className="text-xs text-gray-600 dark:text-gray-300">
              Linked to{' '}
              <span className="font-mono text-gray-900 dark:text-gray-100">
                {node.floorElementId}
              </span>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Link2 size={12} aria-hidden="true" />}
              disabled
              title="Coming soon — M6.6 will wire bidirectional sync with the floor plan"
            >
              Link to floor element
            </Button>
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
