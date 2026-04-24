import { X as XIcon } from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'

/**
 * Thin amber strip anchored to the top of the viewport while an owner is
 * impersonating a lower-privileged role. Three jobs:
 *   1. Make it *impossible* to forget you're in "View as…" mode — the
 *      strip is always on-screen, never scrolls away.
 *   2. Name the current effective role so the owner knows which gate they
 *      are currently experiencing.
 *   3. Provide a one-click exit (plus Escape globally) so getting out is
 *      at least as easy as getting in.
 *
 * Renders null unless the real role is `owner` AND `impersonatedRole` is
 * set. The base-role guard is defense-in-depth: the store already refuses
 * non-owner writes to `impersonatedRole`, but if a non-owner's state
 * somehow carries a stale value we still refuse to render.
 */
export function ImpersonationBanner() {
  const currentOfficeRole = useProjectStore((s) => s.currentOfficeRole)
  const impersonatedRole = useProjectStore((s) => s.impersonatedRole)
  const setImpersonatedRole = useProjectStore((s) => s.setImpersonatedRole)

  if (currentOfficeRole !== 'owner' || impersonatedRole === null) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-500 text-white text-xs font-medium flex items-center justify-center gap-3 px-3 py-1.5 border-b border-amber-600"
    >
      <span>
        Viewing as <strong className="font-semibold">{impersonatedRole}</strong>
        <span className="opacity-90"> — UI only, your real permissions are unchanged</span>
      </span>
      <button
        onClick={() => setImpersonatedRole(null)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white"
        aria-label="Exit view-as mode"
        title="Exit view-as mode (Esc)"
      >
        <XIcon size={12} />
        Exit
      </button>
    </div>
  )
}
