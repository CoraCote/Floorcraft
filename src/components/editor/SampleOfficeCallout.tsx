import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'
import { isSampleOffice } from '../../lib/demo/sampleOffice'

const dismissedKey = (officeId: string) => `floorcraft.sampleCalloutDismissed.${officeId}`

function readPersistedDismissed(officeId: string): boolean {
  try {
    return localStorage.getItem(dismissedKey(officeId)) === '1'
  } catch {
    return false
  }
}

/**
 * Drafting Studio onboarding banner that appears the first time a
 * freshly-signed-up operator opens the seeded sample office. The
 * marker is the office name (`SAMPLE_OFFICE_NAME` in
 * `lib/demo/sampleOffice.ts`); a rename naturally suppresses the
 * callout, which is fine — a renamed office means engagement.
 *
 * Dismissal persists per-office in localStorage so a teammate who
 * later opens the same sample office won't get a fresh banner. Wrapped
 * in try/catch so private-mode browsers (where setItem throws) just
 * skip the persistence step rather than wedging the editor.
 *
 * State model: localStorage is read at render time (cheap, only when
 * the banner would otherwise show), and a session-scoped set tracks
 * dismissals from *this* tab so the banner disappears immediately on
 * click without round-tripping through state derived from storage.
 * Avoids the `react-hooks/set-state-in-effect` rule.
 */
export function SampleOfficeCallout() {
  const officeId = useProjectStore((s) => s.officeId)
  const officeName = useProjectStore((s) => s.currentProject?.name ?? null)
  const [sessionDismissed, setSessionDismissed] = useState<Set<string>>(new Set())

  if (!officeId || !isSampleOffice(officeName)) return null
  if (sessionDismissed.has(officeId)) return null
  if (readPersistedDismissed(officeId)) return null

  function onDismiss() {
    if (!officeId) return
    try {
      localStorage.setItem(dismissedKey(officeId), '1')
    } catch {
      // private mode — the in-memory dismissal below still hides the
      // banner for the rest of this session.
    }
    setSessionDismissed((prev) => {
      const next = new Set(prev)
      next.add(officeId)
      return next
    })
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute top-4 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[calc(100%-2rem)] rounded-md border border-[color:var(--color-blueprint)]/40 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 shadow-lg flex items-start gap-3 px-4 py-3"
    >
      <Sparkles
        size={18}
        className="mt-0.5 flex-shrink-0 text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0 text-sm">
        <p className="font-medium text-gray-900 dark:text-gray-100">
          This is a sample office.
        </p>
        <p className="mt-0.5 text-gray-600 dark:text-gray-300">
          Edit it to learn the tools, or rename it and start over. Delete it
          from the team home when you&rsquo;re ready for a fresh canvas.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss sample-office banner"
        className="flex-shrink-0 -mr-1 -mt-1 p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-[color:var(--color-paper-sunken)] dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
