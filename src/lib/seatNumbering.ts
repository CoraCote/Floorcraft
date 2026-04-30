import type { CanvasElement } from '../types/elements'
import { isAssignableElement } from '../types/elements'

/**
 * Seat labels are stored on each assignable element's `deskId`. The
 * historical default was `D-${nanoid(6)}` (e.g. `D-a3kQ92`) — cryptic,
 * and it surfaced verbatim in the roster's Seat column. This helper
 * hands out clean "1", "2", "3"… labels scoped to a single floor, which
 * the Roster then renders as "Floor 1 / 3".
 *
 * Strategy: scan the given element map, pull out assignable elements
 * (`desk` | `hot-desk` | `workstation` | `private-office`), parse
 * numeric `deskId`s, and return `max + 1`. We intentionally consider
 * ONLY purely-numeric labels — a legacy "D-123" or a user-renamed
 * "Reception" doesn't poison the counter, so the next seat after
 * ["D-101", "D-102"] is still "1", and the next after ["1", "2", "D-foo"]
 * is "3".
 *
 * Numbers are never reused after a delete. If the floor has seats
 * 1, 2, 3 and seat 2 gets removed, the next seat is 4 — reassigning
 * "2" to a different physical desk would quietly invalidate every
 * saved reference to "Floor 1 / 2".
 */
export function nextSeatNumber(existing: Record<string, CanvasElement>): string {
  let max = 0
  for (const el of Object.values(existing)) {
    if (!isAssignableElement(el)) continue
    const raw = el.deskId.trim()
    // `parseInt("3abc")` returns 3, which we don't want. Only treat the
    // value as a number if it's purely digits (with an optional leading
    // sign, though in practice we never emit negative seat numbers).
    if (!/^\d+$/.test(raw)) continue
    const n = Number(raw)
    if (n > max) max = n
  }
  return String(max + 1)
}

/**
 * Return the human-readable label for an employee's assigned seat.
 *
 * Resolution order:
 *   1. `el.label` if non-empty — the free-form nickname operators set in
 *      the Properties → Identity panel ("Sara's old corner desk").
 *   2. `el.deskId` — the auto-derived stable identifier ("D-101", "12").
 *   3. A truncated raw id — fallback when the element is missing
 *      (stale reference, mid-delete race).
 *
 * `label` overrides `deskId` because that's the rename surface. The
 * deskId stays the canonical stable identifier for CSV columns, audit
 * logs, and URL params; the rename is purely a display concern.
 */
export function getSeatLabel(
  seatId: string,
  elements: Record<string, CanvasElement>,
): string {
  const el = elements[seatId]
  if (el && isAssignableElement(el)) {
    const label = el.label?.trim()
    if (label) return label
    if (el.deskId.trim().length > 0) return el.deskId
  }
  // Unknown/stale seat — show a truncated id rather than the full nanoid
  // so it's still copy-pasteable but doesn't eat the whole column.
  return seatId.slice(0, 4)
}
