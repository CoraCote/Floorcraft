import type { WorkstationElement } from '../types/elements'

/**
 * Convert a canvas-space `cursorX` into the index of the workstation
 * slot underneath it.
 *
 * A workstation is rendered with its origin at the centre (Konva
 * convention used everywhere on this canvas), divided into
 * `element.positions` equal-width columns. The leftmost slot is
 * index 0, increasing rightward.
 *
 * Returns `-1` when the cursor is horizontally outside the
 * workstation's bounds — the drop handler interprets that as "no
 * specific slot under the cursor; fall back to first empty slot".
 *
 * Rotation is intentionally ignored: workstations on this canvas
 * are axis-aligned in practice (rotation === 0). If non-zero
 * rotation support arrives later, the cursor would need to be
 * transformed into the workstation's local frame first.
 */
export function computeWorkstationSlotIndex(
  cursorX: number,
  workstation: Pick<WorkstationElement, 'x' | 'width' | 'positions'>,
): number {
  const positions = Math.max(0, Math.floor(workstation.positions))
  if (positions <= 0) return -1
  const left = workstation.x - workstation.width / 2
  const right = left + workstation.width
  if (cursorX < left || cursorX >= right) return -1
  const slotWidth = workstation.width / positions
  if (slotWidth <= 0) return -1
  const idx = Math.floor((cursorX - left) / slotWidth)
  // Clamp defensively — float drift on the right edge could otherwise
  // produce `positions` (an out-of-bounds index).
  if (idx < 0) return 0
  if (idx >= positions) return positions - 1
  return idx
}
