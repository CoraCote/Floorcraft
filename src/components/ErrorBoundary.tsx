import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Top-of-tree crash barrier. Renders a recovery UI instead of a blank
 * white screen when any descendant throws during render, lifecycle, or
 * constructor. Without this a single null-deref inside, say, a Konva
 * renderer would take the whole SPA down — the user would see a blank
 * page and have no obvious recovery path except to close the tab.
 *
 * This is intentionally minimal: we don't ship to Sentry here (the app
 * has no Sentry wiring yet), but `componentDidCatch` is the only hook
 * that gives us the error + info together, so we log through the console
 * transport and leave a clear place to plug telemetry in.
 *
 * Placed at the router root in `main.tsx` so even AuthProvider or the
 * `Suspense` fallback can't nuke the whole tab.
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

  private handleReset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen w-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 max-w-md w-full space-y-3 text-sm">
            <h1 className="text-base font-semibold text-gray-900">
              Something went wrong
            </h1>
            <p className="text-gray-600">
              Floorcraft ran into an unexpected error and couldn't finish
              rendering this page. Your work is autosaved — reloading
              should get you back to where you were.
            </p>
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer hover:text-gray-700">
                Technical details
              </summary>
              <pre className="mt-2 p-2 bg-gray-50 rounded overflow-auto max-h-40">
                {this.state.error.message}
              </pre>
            </details>
            <div className="flex gap-2 pt-2">
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Reload page
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 text-gray-600 text-sm hover:bg-gray-100 rounded-lg"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
