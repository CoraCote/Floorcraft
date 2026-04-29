import { useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { useBuildVersion } from '../hooks/useBuildVersion'
import { useProjectStore } from '../stores/projectStore'

/**
 * "A new version is available" banner.
 *
 * Mounts globally inside `<BrowserRouter>` so every page (landing,
 * editor, share view) gets the same notice. Polls `/version.json`
 * via `useBuildVersion`; when the server build id diverges from the
 * one baked into this bundle, shows a slim banner above the page
 * with a Refresh CTA.
 *
 * # Editor safety
 *
 * The Refresh button is disabled while `useProjectStore.saveState`
 * is `'saving'` so a refresh can't trigger mid-autosave and lose the
 * pending write. The banner copy and disabled state both surface
 * this so the user knows why the button is greyed.
 *
 * # Per-session dismiss
 *
 * Dismiss collapses the banner for the lifetime of this tab. The
 * underlying state is unchanged — if a third deploy lands the banner
 * STAYS dismissed (the signal is "you're behind", not "a new version
 * appeared since you last looked"; no value in pestering once the
 * user has acknowledged).
 */
export function NewVersionBanner() {
  const version = useBuildVersion()
  const saveState = useProjectStore((s) => s.saveState)
  const [dismissed, setDismissed] = useState(false)

  if (version.status !== 'new-version') return null
  if (dismissed) return null

  const isSaving = saveState === 'saving'

  function handleRefresh() {
    if (typeof window === 'undefined') return
    window.location.reload()
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="new-version-banner"
      className="fixed top-0 inset-x-0 z-[60] flex items-center gap-2 px-3 py-2 sm:px-4 bg-blue-600 text-white text-sm shadow-md"
    >
      <RefreshCw size={14} aria-hidden="true" className="shrink-0" />
      <p className="flex-1 truncate">
        A new version of Floorcraft is available.{' '}
        {isSaving ? (
          <span className="opacity-80">
            Finishing autosave before refresh…
          </span>
        ) : (
          <span className="opacity-80">Refresh to load it.</span>
        )}
      </p>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isSaving}
        className="inline-flex items-center gap-1 rounded bg-white/15 hover:bg-white/25 disabled:opacity-50 disabled:cursor-not-allowed px-2 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        data-testid="new-version-banner-refresh"
      >
        <RefreshCw size={12} aria-hidden="true" />
        Refresh
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss new version notice"
        className="inline-flex items-center justify-center rounded p-1 text-white/80 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        data-testid="new-version-banner-dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}
