import { useEffect, useRef } from 'react'
import { History, X } from 'lucide-react'
import { useSeatHistoryStore } from '../../stores/seatHistoryStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useFloorStore } from '../../stores/floorStore'
import { useUIStore } from '../../stores/uiStore'
import { useCan } from '../../hooks/useCan'
import type { SeatHistoryEntry } from '../../types/seatHistory'

/**
 * Either a seat-centric or an employee-centric view of the history log.
 * Exactly one of `seatId` / `employeeId` must be set; the component keys
 * on which is present to decide the formatting of each row.
 */
export type SeatHistoryDrawerTarget =
  | { kind: 'seat'; seatId: string }
  | { kind: 'employee'; employeeId: string }

interface Props {
  target: SeatHistoryDrawerTarget
  onClose: () => void
}

/**
 * Right-edge slide-in drawer showing the append-only seat-history
 * timeline for either a specific seat or a specific employee.
 *
 * Rendering decisions:
 *   - The drawer shell (width, shadow, backdrop, focus-trap) mirrors
 *     `RosterDetailDrawer` so keyboard UX is consistent across the two
 *     side-panels.
 *   - Permission is checked early — without `viewSeatHistory`, the
 *     component returns `null` and never mounts the drawer. This also
 *     means a stale `open=true` after a role downgrade silently becomes
 *     a no-op rather than flashing data.
 *   - Each row shows a human-oriented line (names, deskId) rather than
 *     raw ids. Missing references (deleted employees / elements) fall
 *     back to a short "Unknown" rather than an empty string so the row
 *     is still scannable.
 */
export function SeatHistoryDrawer({ target, onClose }: Props) {
  const canView = useCan('viewSeatHistory')
  const entriesForSeat = useSeatHistoryStore((s) => s.entriesForSeat)
  const entriesForEmployee = useSeatHistoryStore((s) => s.entriesForEmployee)
  // Subscribe to the underlying map so re-renders fire when new entries
  // land — `entriesForSeat` / `entriesForEmployee` are stable functions
  // that read from the current store, so we need *some* reactive
  // subscription to trigger the re-read.
  const allEntries = useSeatHistoryStore((s) => s.entries)

  const employees = useEmployeeStore((s) => s.employees)
  const elements = useElementsStore((s) => s.elements)
  const floors = useFloorStore((s) => s.floors)
  const registerModalOpen = useUIStore((s) => s.registerModalOpen)
  const registerModalClose = useUIStore((s) => s.registerModalClose)

  const drawerRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    registerModalOpen()
    return () => registerModalClose()
  }, [registerModalOpen, registerModalClose])

  if (!canView) return null
  // `allEntries` is intentionally referenced so the linter doesn't strip
  // the subscription above — the actual lookup goes through the
  // helpers which re-read `get().entries` internally.
  void allEntries

  const rows =
    target.kind === 'seat'
      ? entriesForSeat(target.seatId)
      : entriesForEmployee(target.employeeId)

  // Resolve a human label for the target so the header reads naturally.
  const titleSuffix =
    target.kind === 'seat'
      ? resolveSeatLabel(target.seatId, elements, floors) ?? shortId(target.seatId)
      : employees[target.employeeId]?.name ?? 'Unknown employee'

  const onRootKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      e.preventDefault()
      onCloseRef.current()
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex" onKeyDown={onRootKeyDown}>
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        className="relative ml-auto w-[420px] max-w-full h-full bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`Seat history for ${titleSuffix}`}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <History size={12} aria-hidden="true" /> Seat history
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate" title={titleSuffix}>
              {titleSuffix}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 px-5 py-4">
          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            <ol className="space-y-3" aria-label="Timeline entries">
              {rows.map((entry) => (
                <li
                  key={entry.id}
                  className="border-l-2 border-blue-200 pl-3 text-sm text-gray-700 dark:text-gray-200"
                  data-testid="seat-history-row"
                >
                  <EntryRow
                    entry={entry}
                    kind={target.kind}
                    employees={employees}
                    elements={elements}
                    floors={floors}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      className="text-sm text-gray-500 dark:text-gray-400 text-center py-8"
      data-testid="seat-history-empty"
    >
      <div className="mb-1 font-medium text-gray-600 dark:text-gray-300">No history recorded yet</div>
      <p className="text-xs text-gray-400 dark:text-gray-500 max-w-[260px] mx-auto">
        Assigning, unassigning, and re-seating an employee each add a row
        here. Entries are never deleted or edited.
      </p>
    </div>
  )
}

function EntryRow({
  entry,
  kind,
  employees,
  elements,
  floors,
}: {
  entry: SeatHistoryEntry
  kind: 'seat' | 'employee'
  employees: Record<string, { id: string; name: string }>
  elements: Record<string, unknown>
  floors: Array<{ id: string; elements: Record<string, unknown> }>
}) {
  const nextName = entry.employeeId
    ? employees[entry.employeeId]?.name ?? 'Unknown'
    : '—'
  const prevName = entry.previousEmployeeId
    ? employees[entry.previousEmployeeId]?.name ?? 'Unknown'
    : '—'
  const seatLabel = resolveSeatLabel(entry.elementId, elements, floors) ??
    shortId(entry.elementId)

  // Seat-centric row: show "prev → next" for the people involved.
  // Employee-centric row: show "prev-seat → new-seat" if we can find
  // both; fall back to the seat label + action.
  const mainLine =
    kind === 'seat'
      ? `${prevName} → ${nextName}`
      : entry.action === 'unassign'
        ? `Left ${seatLabel}`
        : entry.action === 'reassign'
          ? `Moved to ${seatLabel}`
          : `Assigned to ${seatLabel}`

  const actorName = entry.actorUserId
    ? shortId(entry.actorUserId)
    : 'system'

  return (
    <>
      <div className="font-medium text-gray-800 dark:text-gray-100">{mainLine}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        {formatTimestamp(entry.timestamp)} · via {actorName}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-0.5">
        {entry.action}
      </div>
    </>
  )
}

function resolveSeatLabel(
  elementId: string,
  elements: Record<string, unknown>,
  floors: Array<{ id: string; elements: Record<string, unknown> }>,
): string | null {
  // Try active floor first (elementsStore), then fall back to any floor's
  // stored elements map. Reads `deskId` if present, else the element's
  // `label` field — both are meaningful human-readable identifiers.
  const candidates: unknown[] = [elements[elementId]]
  for (const f of floors) {
    if (f.elements && typeof f.elements === 'object') {
      candidates.push(f.elements[elementId])
    }
  }
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue
    const r = c as Record<string, unknown>
    if (typeof r.deskId === 'string' && r.deskId) return r.deskId
    if (typeof r.label === 'string' && r.label) return r.label
  }
  return null
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 6)}…` : id
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}
