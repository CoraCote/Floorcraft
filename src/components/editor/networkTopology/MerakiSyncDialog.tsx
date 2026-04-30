import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Info,
  Lock,
} from 'lucide-react'
import { Button, Modal, ModalBody, ModalFooter } from '../../ui'
import { useNetworkTopologyStore } from '../../../stores/networkTopologyStore'
import { loadSampleMerakiSnapshot } from '../../../lib/integrations/meraki/fixtures'
import {
  buildSyncPlan,
  summarizeSyncPlan,
  type SyncEntry,
  type SyncPlan,
} from '../../../lib/integrations/meraki/reconcile'
import { NODE_META, STATUS_LABEL } from './topologyMeta'

/**
 * M4 Phase A — Cisco Meraki sync dialog.
 *
 * # User flow
 *
 *   Step 1: Connect      — Pick the data source. Phase A only ships
 *                          "Try with sample data" (fixture loader);
 *                          the real "Use my API key" path is locked
 *                          behind a "Coming soon" badge so the user
 *                          can see it's the next milestone.
 *
 *   Step 2: Preview      — Render the reconcile output: per-device
 *                          rows with action badges (NEW / UPDATE /
 *                          NO CHANGE / SKIP), tickboxes for opt-in/out,
 *                          and an orphan callout for topology nodes
 *                          whose serials weren't seen.
 *
 *   Step 3: Apply        — Implicit; happens when the user clicks the
 *                          primary CTA on the preview step. We call
 *                          `addNode`/`updateNode` per selected entry,
 *                          then a single `applyAutoLayout` to settle
 *                          newly-added nodes into their canonical band.
 *                          Dialog closes on success.
 *
 * # Why no toast
 *
 * The editor doesn't have a global toast system today. The dialog
 * itself surfaces success state in the header before closing
 * (auto-dismiss after 800ms) — an in-context confirmation a user
 * can't miss while they're still looking at the modal.
 *
 * # Phase B notes
 *
 * The `'connect'` step is the only place that needs to grow when we
 * wire the real client: swap the "Coming soon" disabled card for an
 * API-key input + organization picker. Everything downstream of
 * `setSnapshot()` already works against the real shape.
 */

interface Props {
  open: boolean
  onClose: () => void
}

type Step = 'connect' | 'preview' | 'success'

export function MerakiSyncDialog({ open, onClose }: Props) {
  // Gate component pattern (mirrors CSVImportDialog) — body re-mounts
  // fresh every open so we never carry stale step state across two
  // separate sync sessions.
  if (!open) return null
  return <MerakiSyncDialogBody onClose={onClose} />
}

function MerakiSyncDialogBody({ onClose }: { onClose: () => void }) {
  const topology = useNetworkTopologyStore((s) => s.topology)
  const addNode = useNetworkTopologyStore((s) => s.addNode)
  const updateNode = useNetworkTopologyStore((s) => s.updateNode)
  const applyAutoLayout = useNetworkTopologyStore((s) => s.applyAutoLayout)

  const [step, setStep] = useState<Step>('connect')
  const [plan, setPlan] = useState<SyncPlan | null>(null)
  const [appliedSummary, setAppliedSummary] = useState<{
    added: number
    updated: number
  } | null>(null)

  function handleLoadSample() {
    if (!topology) return
    const snap = loadSampleMerakiSnapshot()
    setPlan(buildSyncPlan(snap, topology))
    setStep('preview')
  }

  function toggleEntry(idx: number) {
    if (!plan) return
    const next = [...plan.entries]
    const entry = next[idx]
    // Skips are inert — the checkbox is rendered disabled, but guard
    // the toggle anyway so a programmatic call can't flip it.
    if (entry.action === 'skip') return
    next[idx] = { ...entry, selected: !entry.selected } as SyncEntry
    setPlan({ ...plan, entries: next })
  }

  function handleApply() {
    if (!plan || !topology) return
    let added = 0
    let updated = 0
    for (const entry of plan.entries) {
      if (!entry.selected) continue
      if (entry.action === 'add') {
        addNode(entry.proposedNode)
        added++
      } else if (entry.action === 'update') {
        if (Object.keys(entry.proposedPatch).length === 0) continue
        updateNode(entry.existingNode.id, entry.proposedPatch)
        updated++
      }
    }
    // One layout pass after the batch so the import settles into the
    // layered hierarchy; per-add re-flows would shuffle the canvas
    // mid-import (jarring) and burn store updates we don't need.
    if (added > 0) applyAutoLayout()
    setAppliedSummary({ added, updated })
    setStep('success')
    // Auto-dismiss after a beat so the user sees the success state
    // but doesn't have to click twice. 1200ms is comfortable on
    // a desktop monitor without feeling like the modal vanished.
    setTimeout(onClose, 1200)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Sync from Cisco Meraki"
      size="lg"
      preventBackdropClose={step === 'success'}
    >
      {step === 'connect' && <ConnectStep onLoadSample={handleLoadSample} />}
      {step === 'preview' && plan && (
        <PreviewStep
          plan={plan}
          onToggleEntry={toggleEntry}
          onBack={() => setStep('connect')}
          onApply={handleApply}
        />
      )}
      {step === 'success' && appliedSummary && (
        <SuccessStep summary={appliedSummary} />
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Step: Connect
// ---------------------------------------------------------------------------

function ConnectStep({ onLoadSample }: { onLoadSample: () => void }) {
  return (
    <>
      <ModalBody>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Pull device inventory and live status from your Cisco Meraki
          dashboard. Devices match against the topology by serial
          number, so anything you've already added by hand keeps its
          place — only the model, vendor, and status get refreshed.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onLoadSample}
            data-testid="meraki-load-sample"
            className="text-left rounded-lg border border-[color:var(--color-blueprint)]/40 dark:border-[color:var(--color-blueprint)]/40 bg-[color:var(--color-blueprint-soft)]/60 dark:bg-[color:var(--color-blueprint-soft)] p-4 hover:bg-[color:var(--color-blueprint-soft)] dark:hover:bg-[color:var(--color-blueprint-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
          >
            <div className="flex items-center gap-2 text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]">
              <Cloud size={16} aria-hidden="true" />
              <span className="text-sm font-semibold">Try with sample data</span>
            </div>
            <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-400">
              Loads a curated 14-device organization (1 firewall, 4
              switches, 7 APs, plus a camera + sensor that get
              skipped). Useful for previewing the workflow without an
              API key.
            </p>
          </button>

          <div
            aria-disabled
            className="text-left rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-sunken)] dark:bg-gray-900/60 p-4 cursor-not-allowed"
          >
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <Lock size={16} aria-hidden="true" />
              <span className="text-sm font-semibold">Use my Meraki API key</span>
              <span className="ml-auto text-[10px] uppercase tracking-wider rounded bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 text-gray-600 dark:text-gray-400">
                Coming soon
              </span>
            </div>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-500">
              Live sync against your Meraki organization. Ships in
              Phase&nbsp;B with team-level key storage and a
              server-side proxy (Meraki blocks browser CORS).
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-md border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-sunken)]/80 dark:bg-gray-900/40 p-3 text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2">
          <Info size={14} aria-hidden="true" className="mt-0.5 text-gray-500" />
          <span>
            Read-only: nothing is sent to your Meraki dashboard from
            this dialog. The sync only updates topology nodes here in
            Floorcraft.
          </span>
        </div>
      </ModalBody>
    </>
  )
}

// ---------------------------------------------------------------------------
// Step: Preview
// ---------------------------------------------------------------------------

function PreviewStep({
  plan,
  onToggleEntry,
  onBack,
  onApply,
}: {
  plan: SyncPlan
  onToggleEntry: (idx: number) => void
  onBack: () => void
  onApply: () => void
}) {
  const summary = useMemo(() => summarizeSyncPlan(plan), [plan])
  const selectedCount = useMemo(
    () => plan.entries.filter((e) => e.selected).length,
    [plan.entries],
  )

  return (
    <>
      <ModalBody>
        <div
          className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4"
          data-testid="meraki-summary"
        >
          <SummaryChip label="To add" value={summary.toAdd} tone="positive" />
          <SummaryChip label="To update" value={summary.toUpdate} tone="info" />
          <SummaryChip label="No change" value={summary.noChange} tone="muted" />
          <SummaryChip label="Skipped" value={summary.skipped} tone="muted" />
          <SummaryChip
            label="Orphaned"
            value={summary.orphaned}
            tone={summary.orphaned > 0 ? 'warning' : 'muted'}
          />
        </div>

        {plan.orphans.length > 0 && (
          <div
            className="mb-4 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2"
            data-testid="meraki-orphan-callout"
          >
            <AlertTriangle size={14} aria-hidden="true" className="mt-0.5" />
            <div>
              <strong className="font-semibold">
                {plan.orphans.length} topology node
                {plan.orphans.length === 1 ? '' : 's'} not in the snapshot.
              </strong>{' '}
              These nodes have a serial that wasn't seen in this Meraki
              org. We won't change them — clear the serial in the
              Properties panel if it's stale.
              <ul className="mt-1.5 ml-2 list-disc list-inside">
                {plan.orphans.slice(0, 5).map((o) => (
                  <li key={o.topologyNode.id} className="truncate">
                    <span className="font-mono">{o.topologyNode.serialNumber}</span>{' '}
                    — {o.topologyNode.label || '(unnamed)'}
                  </li>
                ))}
                {plan.orphans.length > 5 && (
                  <li className="opacity-70">
                    …and {plan.orphans.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}

        <div
          className="rounded-md border border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-hidden"
          data-testid="meraki-entries-table"
        >
          <div className="grid grid-cols-[28px_minmax(0,2fr)_minmax(0,1.4fr)_120px_120px] font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 bg-[color:var(--color-paper-sunken)] dark:bg-gray-900/60 border-b border-[color:var(--color-paper-line)] dark:border-gray-800">
            <div className="px-2 py-2"></div>
            <div className="px-2 py-2">Device</div>
            <div className="px-2 py-2">Maps to</div>
            <div className="px-2 py-2">Status</div>
            <div className="px-2 py-2">Action</div>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {plan.entries.map((entry, idx) => (
              <EntryRow
                key={entry.device.serial}
                entry={entry}
                onToggle={() => onToggleEntry(idx)}
              />
            ))}
          </ul>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="primary"
          onClick={onApply}
          disabled={selectedCount === 0}
          data-testid="meraki-apply"
        >
          {selectedCount === 0
            ? 'Nothing selected'
            : `Apply ${selectedCount} change${selectedCount === 1 ? '' : 's'}`}
        </Button>
      </ModalFooter>
    </>
  )
}

function EntryRow({
  entry,
  onToggle,
}: {
  entry: SyncEntry
  onToggle: () => void
}) {
  const checkable = entry.action !== 'skip'
  const empty = entry.action === 'update' && Object.keys(entry.proposedPatch).length === 0

  let mapsToLabel = '—'
  let statusLabel = '—'
  if (entry.action === 'add') {
    const meta = NODE_META[entry.proposedNode.type]
    mapsToLabel = meta.typeName
    if (entry.proposedNode.status) {
      statusLabel = STATUS_LABEL[entry.proposedNode.status]
    }
  } else if (entry.action === 'update') {
    const meta = NODE_META[entry.existingNode.type]
    mapsToLabel = meta.typeName
    const nextStatus = entry.proposedPatch.status ?? entry.existingNode.status
    if (nextStatus) statusLabel = STATUS_LABEL[nextStatus]
  } else {
    mapsToLabel = '(no mapping)'
  }

  let actionBadge: { label: string; classes: string }
  if (entry.action === 'add') {
    actionBadge = {
      label: 'New',
      classes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    }
  } else if (entry.action === 'skip') {
    actionBadge = {
      label: 'Skip',
      classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    }
  } else if (empty) {
    actionBadge = {
      label: 'No change',
      classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    }
  } else {
    actionBadge = {
      label: 'Update',
      classes: 'bg-[color:var(--color-blueprint-soft)] text-[color:var(--color-blueprint-strong)] dark:bg-[color:var(--color-blueprint-soft)] dark:text-[color:var(--color-blueprint)]',
    }
  }

  return (
    <li
      className="grid grid-cols-[28px_minmax(0,2fr)_minmax(0,1.4fr)_120px_120px] items-center text-xs border-b last:border-b-0 border-[color:var(--color-paper-line)] dark:border-gray-800/60 hover:bg-[color:var(--color-paper-sunken)]/80 dark:hover:bg-gray-900/30"
      data-testid={`meraki-entry-${entry.device.serial}`}
    >
      <div className="px-2 py-2 flex items-center justify-center">
        <input
          type="checkbox"
          aria-label={`Include ${entry.device.serial}`}
          checked={entry.selected}
          disabled={!checkable}
          onChange={onToggle}
          // Even when an update has an empty patch we let the user
          // tick / untick — it's already inert (we skip on apply when
          // the patch is empty), but the affordance keeps the row
          // consistent with the others.
          className="h-3.5 w-3.5 accent-blue-600 disabled:opacity-30"
        />
      </div>
      <div className="px-2 py-2 min-w-0">
        <div className="font-medium text-gray-800 dark:text-gray-200 truncate">
          {entry.device.name ?? `${entry.device.model} · ${entry.device.serial.slice(-4)}`}
        </div>
        <div className="font-mono text-[10px] text-gray-500 dark:text-gray-500 truncate">
          {entry.device.serial} · {entry.device.model}
        </div>
      </div>
      <div className="px-2 py-2 text-gray-700 dark:text-gray-300 truncate">
        {mapsToLabel}
      </div>
      <div className="px-2 py-2 text-gray-700 dark:text-gray-300">
        {statusLabel}
      </div>
      <div className="px-2 py-2">
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${actionBadge.classes}`}
        >
          {actionBadge.label}
        </span>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Step: Success
// ---------------------------------------------------------------------------

function SuccessStep({
  summary,
}: {
  summary: { added: number; updated: number }
}) {
  return (
    <ModalBody>
      <div className="flex items-center gap-3 text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 size={20} aria-hidden="true" />
        <div>
          <h3 className="text-base font-semibold">Sync complete</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            Added {summary.added} device{summary.added === 1 ? '' : 's'} and
            updated {summary.updated}.
          </p>
        </div>
      </div>
    </ModalBody>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TONE_CLASS: Record<'positive' | 'info' | 'warning' | 'muted', string> = {
  positive:
    'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900',
  info: 'bg-[color:var(--color-blueprint-soft)] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] border-[color:var(--color-blueprint)]/40 dark:border-[color:var(--color-blueprint)]/40',
  warning:
    'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900',
  muted:
    'bg-[color:var(--color-paper-sunken)] dark:bg-gray-900/40 text-gray-700 dark:text-gray-300 border-[color:var(--color-paper-line)] dark:border-gray-800',
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'positive' | 'info' | 'warning' | 'muted'
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-md border px-2 py-2 ${TONE_CLASS[tone]}`}
    >
      <div className="text-lg font-semibold leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wider mt-1 opacity-80">
        {label}
      </div>
    </div>
  )
}

