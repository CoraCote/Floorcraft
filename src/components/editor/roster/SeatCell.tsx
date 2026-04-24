import { MapPin } from 'lucide-react'

/**
 * Two-line seat cell with a leading pin icon. Floor name is the primary
 * line (text-sm) and the desk label is the secondary line (text-xs). The
 * whole cell is rendered as a <button> so keyboard users can Tab into it
 * and Enter to navigate to the map. When unassigned, the cell renders a
 * dashed-border ghost pill so the row still has visual weight but the
 * "nothing here yet" signal reads as deliberate.
 */
export function SeatCell({
  floorName,
  seatLabel,
  onJump,
}: {
  floorName: string | null
  seatLabel: string | null
  onJump: (() => void) | null
}) {
  if (!floorName || !seatLabel || !onJump) {
    return (
      <span className="inline-flex items-center rounded-full border border-dashed border-gray-300 dark:border-gray-700 px-2.5 py-0.5 text-xs text-gray-400 dark:text-gray-500">
        Unassigned
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onJump}
      className="inline-flex items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
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
