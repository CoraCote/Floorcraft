import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertOctagon } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Wave 18A: brand the top-of-tree crash barrier so a runtime error
 * doesn't drop the user on a generic-looking gray fallback that could
 * just as easily belong to any other React app.
 *
 * What's unchanged:
 *  - `getDerivedStateFromError` + `componentDidCatch` still log through
 *    `console.error`, leaving the Sentry / PostHog hook point in place
 *    for whenever telemetry lands.
 *  - "Reload" still does `window.location.reload()`. That's the safest
 *    reset because the error could have come from a corrupted zustand
 *    store or a stale cached module chunk.
 *  - The `Dismiss` action is intentionally dropped — it almost never
 *    helped (the broken subtree usually re-throws on the next render)
 *    and a "Back to home" link is a genuinely useful escape hatch.
 *
 * What changed visually: gradient bg + centered card on the same chrome
 * as AuthShell + NotFoundPage, the Floorcraft wordmark up top, an
 * `AlertOctagon` icon in a red-tinted circle, and the same primary +
 * secondary action pair pattern. The technical-details `<details>`
 * stays — engineers triaging a user report still want the message —
 * but it's collapsed by default so it doesn't loom over the recovery
 * copy.
 *
 * The component cannot use react-router's `<Link>` because the boundary
 * may be triggered by an error inside the `<BrowserRouter>` itself
 * (e.g. a misconfigured route during Suspense). A plain `<a href="/">`
 * forces a full reload, which is exactly what we want — the SPA state
 * is already untrustworthy at this point.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console is fine as a baseline transport; a future Sentry (or
    // PostHog, or Datadog) hook plugs in here without changing the UI.
    console.error('Unhandled React error:', error, info.componentStack)
  }

  private handleReload = (): void => {
    // Hard reload is the safest reset because the error could have come
    // from a corrupted zustand store or a stale cached module chunk.
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
          <header className="px-6 pt-6 sm:pt-8">
            {/* Plain `<a>` rather than react-router `<Link>` — the
                router itself may be the thing that threw. */}
            <a
              href="/"
              className="inline-flex items-center gap-2 font-semibold tracking-tight text-gray-900 dark:text-gray-100"
            >
              <span
                aria-hidden="true"
                className="inline-block h-5 w-5 rotate-45 rounded-sm bg-gradient-to-br from-blue-500 to-indigo-600"
              />
              <span>Floorcraft</span>
            </a>
          </header>
          <main className="flex-1 flex items-start justify-center px-6 pt-10 pb-12 sm:pt-16">
            <div
              role="alert"
              className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm text-center dark:border-gray-800 dark:bg-gray-900/80"
            >
              <div
                aria-hidden="true"
                className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
              >
                <AlertOctagon size={28} />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                Something went wrong
              </h1>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                We&apos;ve been notified — sorry for the disruption. Your
                work is autosaved, so reloading should pick up where you
                left off.
              </p>
              <div className="mt-6 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
                >
                  Reload page
                </button>
                <a
                  href="/"
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Back to home
                </a>
              </div>
              <details className="mt-6 text-left text-xs text-gray-500 dark:text-gray-400">
                <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                  Technical details
                </summary>
                <pre className="mt-2 overflow-auto max-h-40 rounded bg-gray-50 p-2 text-[11px] text-gray-700 dark:bg-gray-950 dark:text-gray-300">
                  {this.state.error.message}
                </pre>
              </details>
            </div>
          </main>
        </div>
      )
    }
    return this.props.children
  }
}
