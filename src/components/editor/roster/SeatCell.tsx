import { MapPin, Plus } from 'lucide-react'

/**
 * Two-line seat cell with a leading pin icon. Floor name is the primary
 * line (text-sm) and the desk label is the secondary line (text-xs).
 *
 * Editable mode (`onAssign` provided): the whole cell is the assign
 * affordance — clicking opens the in-roster `SeatPickerDialog` so the
 * user can pick a seat without leaving the table. A secondary
 * pin button still jumps to the map for users who want to *see* the
 * seat in context.
 *
 * Viewer mode (`onAssign` null, `onJump` provided): the cell behaves as
 * the legacy "jump to map" affordance — single button, full row click
 * area, identical to the pre-Track-A behavior.
 *
 * Unassigned + editable: the dashed ghost becomes a "+ Assign" call to
 * action so the row has an obvious next-step rather than reading as
 * "nothing to do here."
 */
export function SeatCell({
  floorName,
  seatLabel,
  onJump,
  onAssign,
}: {
  floorName: string | null
  seatLabel: string | null
  onJump: (() => void) | null
  /** Editable mode: open the seat-picker dialog for this row. */
  onAssign?: (() => void) | null
}) {
  const assigned = floorName && seatLabel
  const editable = Boolean(onAssign)

  if (!assigned) {
    if (editable && onAssign) {
      return (
        <button
          type="button"
          onClick={onAssign}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 dark:border-gray-700 px-2.5 py-0.5 text-xs text-gray-500 dark:text-gray-400 hover:border-[color:var(--color-blueprint)] hover:text-[color:var(--color-blueprint-strong)] dark:hover:text-[color:var(--color-blueprint)] transition-colors"
          title="Assign a seat"
          aria-label="Assign a seat"
        >
          <Plus size={11} aria-hidden="true" />
          Assign
        </button>
      )
    }
    return (
      <span className="inline-flex items-center rounded-full border border-dashed border-gray-300 dark:border-gray-700 px-2.5 py-0.5 text-xs text-gray-400 dark:text-gray-500">
        Unassigned
      </span>
    )
  }

  // Assigned. Editable: cell click opens picker, pin icon button jumps
  // to map. Viewer: cell click jumps to map (legacy).
  if (editable && onAssign) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={onAssign}
          className="inline-flex items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800"
          title="Reassign seat"
          aria-label={`Seat ${floorName} ${seatLabel} — reassign`}
        >
          <span className="flex flex-col min-w-0 leading-tight">
            <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{floorName}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{seatLabel}</span>
          </span>
        </button>
        {onJump && (
          <button
            type="button"
            onClick={onJump}
            className="rounded p-1 text-gray-400 dark:text-gray-500 hover:text-[color:var(--color-blueprint-strong)] dark:hover:text-[color:var(--color-blueprint)] hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800"
            title="Show seat on map"
            aria-label={`Show seat ${seatLabel} on map`}
          >
            <MapPin size={14} aria-hidden="true" />
          </button>
        )}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onJump ?? undefined}
      disabled={!onJump}
      className="inline-flex items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800 disabled:hover:bg-transparent"
      title="Show seat on map"
      aria-label={`Seat ${floorName} ${seatLabel} — show on map`}
    >
      <MapPin
        size={14}
        aria-hidden="true"
        className="text-gray-400 dark:text-gray-500 flex-shrink-0"
      />
      <span className="flex flex-col min-w-0 leading-tight">
        <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{floorName}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{seatLabel}</span>
      </span>
    </button>
  )
}
