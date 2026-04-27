import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Compass } from 'lucide-react'

/**
 * Wave 18A: a real 404 surface.
 *
 * Pre-18A the catch-all route was `<Navigate to="/" replace />` which
 * silently bounced any unknown URL to the landing page. That looked
 * like a bug to anyone who clicked a stale link — they'd expect to
 * land on the page named in their address bar, not on marketing copy.
 * A typo in `/dashbord` ended up on the hero with no way to figure
 * out what happened.
 *
 * This page is intentionally narrow — wordmark + tinted-icon block +
 * two actions, on the same gradient + centered-card chrome the auth
 * screens use. The `Compass` icon reads as "we'll help you find your
 * way" without being whiny ("oops! page not found!" is exactly the
 * tone we don't want — see ux-copy guidelines).
 *
 * `role="alert"` on the container so a screen reader announces the
 * 404 immediately on mount instead of silently re-rendering the URL.
 *
 * We log the missing path through `console.warn` rather than the
 * `audit.emit` plumbing — audit events are a team-scoped writeable
 * table and an unauth'd visitor (the most common 404 case) wouldn't
 * have a team to attach the event to. Until there's a dedicated
 * client-side error sink, console is the simplest place engineers
 * looking at a Sentry or LogRocket replay can reliably find the
 * dropped path.
 */
export function NotFoundPage() {
  const location = useLocation()

  useEffect(() => {
    // Logged once per missing path so a parent re-render doesn't spam
    // the console. Future telemetry plugs in here.
    console.warn('[404] no route matched', location.pathname)
  }, [location.pathname])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
      <header className="px-6 pt-6 sm:pt-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-semibold tracking-tight text-gray-900 dark:text-gray-100"
        >
          {/* Diamond mark — same idiom used by AuthShell + LandingNav so
              the brand reads consistently no matter which surface a
              broken link drops the user onto. */}
          <span
            aria-hidden="true"
            className="inline-block h-5 w-5 rotate-45 rounded-sm bg-gradient-to-br from-blue-500 to-indigo-600"
          />
          <span>Floorcraft</span>
        </Link>
      </header>
      <main className="flex-1 flex items-start justify-center px-6 pt-10 pb-12 sm:pt-16">
        <div
          role="alert"
          className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm text-center dark:border-gray-800 dark:bg-gray-900/80"
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
          >
            <Compass size={28} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            We can&apos;t find that page
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            The link may be broken, or the page may have moved. Let&apos;s
            get you somewhere useful.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            {/* Render the primary action as a styled `<Link>` instead of
                wrapping a `<Button>` — a `<button>` inside an `<a>` is
                invalid HTML and most screen readers announce only the
                outer link role anyway. We mirror Button's primary
                variant tokens by hand here so visual parity is preserved
                without inventing a `LinkButton` primitive for one site. */}
            <Link
              to="/"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
            >
              Back to home
            </Link>
            <Link
              to="/help"
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Help center
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
