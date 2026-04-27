import { useMemo, useState } from 'react'
import { Link2, Wand2 } from 'lucide-react'
import { Button, Modal, ModalBody, ModalFooter } from '../../ui'
import { useFloorStore } from '../../../stores/floorStore'
import { useNetworkTopologyStore } from '../../../stores/networkTopologyStore'
import {
  findUnlinkedFloorElements,
  findElementsBySerial,
  type FloorElementCandidate,
} from '../../../lib/networkTopologyLinkage'
import type { TopologyNode } from '../../../types/networkTopology'

/**
 * M6.6 — picker modal for "Link to floor element."
 *
 * The modal lists every IT-device floor element that's compatible with
 * the topology node's type AND not already claimed by some other
 * topology node. Users see one row per candidate with the type icon, a
 * label (the element's `label` or model), the serial number when set,
 * and the owning floor's name.
 *
 * # Why a Modal (not an inline dropdown)
 *
 * The picker can list elements across multiple floors and includes
 * secondary chrome (auto-link button, serial-match hint). A dropdown
 * scoped to a single Properties panel column would feel cramped for
 * that volume of data. Modal also matches the InviteMemberModal idiom
 * the project established in PR #133.
 *
 * # Auto-link button
 *
 * When the topology node has a non-empty `serialNumber`, the modal
 * scans every floor for a serial-matching IT element and surfaces a
 * one-click "Auto-link" affordance. The button counts the number of
 * matches; with exactly one match the click links it; with multiple
 * matches we still link the FIRST candidate but leave the rest
 * un-claimed (the operator can resolve duplicates manually). With
 * zero matches the button is hidden — there's nothing to do.
 */

interface Props {
  open: boolean
  node: TopologyNode
  onClose: () => void
  /** Optional callback fired after a successful link, with the linked
   *  element's id. Useful for the caller to surface a toast or close a
   *  parent panel. */
  onLinked?: (elementId: string) => void
}

export function LinkFloorElementModal({ open, node, onClose, onLinked }: Props) {
  const floors = useFloorStore((s) => s.floors)
  const topology = useNetworkTopologyStore((s) => s.topology)
  const linkNodeToElement = useNetworkTopologyStore((s) => s.linkNodeToElement)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Recompute candidates on every render — cheap (O(elements) over a
  // reasonably sized office) and keeps the picker in lock-step with
  // any background mutations to the topology / floors stores.
  const candidates = useMemo(
    () => findUnlinkedFloorElements(floors, topology, node.type),
    [floors, topology, node.type],
  )
  const serialMatches = useMemo(
    () =>
      findElementsBySerial(floors, node.serialNumber).filter((c) =>
        // `findElementsBySerial` returns ALL serial matches. Restrict to
        // those that are also in the candidate set — i.e. compatible
        // type AND not already claimed by some other topology node.
        // Without this filter the auto-link button would happily try to
        // link to a serial-matching element of the wrong type or one
        // that's already taken, both of which the store would reject.
        candidates.some((x) => x.element.id === c.element.id),
      ),
    [floors, node.serialNumber, candidates],
  )

  // Group by floor for a cleaner picker presentation. Map iteration in
  // JS preserves insertion order, so the resulting groups follow the
  // floor order we received from the store.
  const groups = useMemo(() => {
    const m = new Map<string, { floorName: string; rows: FloorElementCandidate[] }>()
    for (const c of candidates) {
      const existing = m.get(c.floorId)
      if (existing) existing.rows.push(c)
      else m.set(c.floorId, { floorName: c.floorName, rows: [c] })
    }
    return m
  }, [candidates])

  const handleLink = (elementId: string) => {
    const ok = linkNodeToElement(node.id, elementId)
    if (!ok) {
      // Race against a stale picker — surface the error without
      // closing so the user can pick a different element.
      setError(
        'That element is already linked to another topology node. Pick a different one.',
      )
      return
    }
    onLinked?.(elementId)
    onClose()
  }

  const handleAutoLink = () => {
    if (serialMatches.length === 0) return
    handleLink(serialMatches[0].element.id)
  }

  const handleConfirm = () => {
    if (!selectedId) return
    handleLink(selectedId)
  }

  return (
    <Modal open={open} onClose={onClose} title="Link to floor element" size="md">
      <ModalBody className="space-y-3">
        {/* Auto-link affordance — only when the node has a serial that
            matches at least one floor element. The pill formatting
            mirrors the M6.1 status-pill vocabulary so the affordance
            doesn't read like a generic alert. */}
        {serialMatches.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs">
            <div className="text-emerald-800 dark:text-emerald-200">
              <span className="font-semibold">
                {serialMatches.length} candidate{serialMatches.length === 1 ? '' : 's'} by serial number
              </span>
              <span className="ml-1 text-emerald-700/80 dark:text-emerald-300/80">
                Match for <span className="font-mono">{node.serialNumber}</span>
              </span>
            </div>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Wand2 size={12} aria-hidden="true" />}
              onClick={handleAutoLink}
            >
              Auto-link
            </Button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
          >
            {error}
          </div>
        )}

        {candidates.length === 0 ? (
          <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 px-3 py-6 text-center text-sm text-gray-600 dark:text-gray-300">
            No compatible, unlinked floor elements found.
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Drop a matching device on the floor plan first, or unlink an existing topology node.
            </div>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
            {Array.from(groups.entries()).map(([floorId, group]) => (
              <div key={floorId}>
                <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900/60 text-[10px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">
                  {group.floorName}
                </div>
                {group.rows.map((row) => {
                  const el = row.element as typeof row.element & { serialNumber?: string | null }
                  const checked = selectedId === el.id
                  return (
                    <label
                      key={el.id}
                      className={[
                        'flex items-center gap-3 px-3 py-2 cursor-pointer text-sm transition-colors',
                        checked
                          ? 'bg-blue-50 dark:bg-blue-950/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/40',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="link-target"
                        value={el.id}
                        checked={checked}
                        onChange={() => {
                          setSelectedId(el.id)
                          setError(null)
                        }}
                        className="rounded-full"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-gray-900 dark:text-gray-100 truncate">
                          {el.label || el.id}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate tabular-nums">
                          {el.serialNumber ? (
                            <>
                              SN: <span className="font-mono">{el.serialNumber}</span>
                            </>
                          ) : (
                            <span className="italic">No serial number</span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        {el.type}
                      </span>
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirm}
          disabled={!selectedId}
          leftIcon={<Link2 size={12} aria-hidden="true" />}
        >
          Link
        </Button>
      </ModalFooter>
    </Modal>
  )
}
