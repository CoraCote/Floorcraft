import { Link, useParams } from 'react-router-dom'
import { MonitorSmartphone, ArrowLeft, Users } from 'lucide-react'

/**
 * Desktop-only gate for the editor canvas surface.
 *
 * The Floorcraft editor is unapologetically a desktop tool: a 260-px
 * left sidebar + 320-px right sidebar + the canvas itself need at least
 * a 1024-px viewport to be remotely usable. Below that, sidebars crowd
 * the canvas, the floor-tab strip wraps, and pinch-zoom on the Konva
 * stage fights the browser's own scroll gesture. Rather than letting a
 * phone visitor land on a broken canvas, we replace the whole MapView
 * surface with this card and route them to the parts of the app that
 * DO work on small screens — roster, reports, help.
 *
 * Why a full-page replacement (not a banner above the canvas): the
 * existing `NarrowScreenBanner` was easy to dismiss and left the
 * broken layout underneath. Users who tapped through anyway hit a
 * canvas they couldn't actually edit. A hard gate makes the choice
 * obvious — open the editor on a desktop, or pop into the roster /
 * reports view here.
 *
 * Visual idiom: matches the auth-shell + 404 / error-boundary cards
 * (centered on a soft gradient with a small icon chip up top) so
 * mobile-only users don't feel like they hit a different app.
 */
export function EditorDesktopGate() {
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()

  return (
    <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900 px-4 py-10 overflow-y-auto">
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900/80"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 mx-auto mb-4">
          <MonitorSmartphone size={22} aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 text-center">
          Open this on a larger screen
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 text-center">
          The Floorcraft editor is built for displays at least 1024 pixels
          wide. Sidebars and the canvas need the room to breathe — open
          this office on a desktop or wider tablet for the full experience.
        </p>

        <div className="mt-5 grid gap-2">
          {teamSlug && officeSlug && (
            <Link
              to={`/t/${teamSlug}/o/${officeSlug}/roster`}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              <Users size={14} aria-hidden="true" />
              Open the roster instead
            </Link>
          )}
          {teamSlug && (
            <Link
              to={`/t/${teamSlug}`}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Back to team home
            </Link>
          )}
        </div>

        <p className="mt-5 text-[11px] text-gray-400 dark:text-gray-500 text-center">
          Roster, reports, and the help center all work great on this
          screen.
        </p>
      </div>
    </div>
  )
}
