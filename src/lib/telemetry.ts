/**
 * Tiny telemetry indirection.
 *
 * Goal: give the codebase one place where future error-reporting (Sentry,
 * Datadog, PostHog) gets wired in, without committing to a vendor today.
 *
 * Today: `captureException` mirrors `console.error` so dev tools still see
 * the failure. When telemetry lands, `registerTelemetrySink(sink)` is
 * called once at app boot and every subsequent `captureException` reaches
 * the sink as well.
 *
 * Why a sink object, not direct `Sentry.captureException`: keeps the
 * choice of vendor out of every caller's import graph, and makes tests
 * easy — register a vi.fn(), assert calls, no module mocking needed.
 *
 * Why no info/warn helpers: scattering structured logs across the app
 * pre-vendor produces noise no one looks at. When we know what the
 * backend wants (breadcrumbs? structured events?), the right surface
 * lives here. Until then, `console.*` at call sites is honest about
 * "this is a dev log."
 */

export interface TelemetryContext {
  /** Free-form string identifier — usually the source area, e.g. `'office-sync'`. */
  scope?: string
  /** Extra structured data attached to the event (small, JSON-serializable). */
  extra?: Record<string, unknown>
}

export interface TelemetrySink {
  captureException(error: unknown, context?: TelemetryContext): void
}

let activeSink: TelemetrySink | null = null

/**
 * Register a sink at app boot. Calling twice replaces the previous sink —
 * useful for tests, or if a future setup wants to swap implementations
 * after a feature flag resolves.
 */
export function registerTelemetrySink(sink: TelemetrySink | null): void {
  activeSink = sink
}

/**
 * Read the current sink. Exposed mainly so tests can verify wiring; app
 * code should call `captureException` directly rather than poking the
 * sink, so we keep the option to add cross-cutting behaviour (rate
 * limiting, sampling) at the wrapper layer later.
 */
export function getTelemetrySink(): TelemetrySink | null {
  return activeSink
}

/**
 * Report an unhandled error. Always logs to the console (so local dev
 * isn't silent), then forwards to the active sink if one is registered.
 *
 * The sink call is wrapped in try/catch — a broken telemetry vendor must
 * never escalate into a second crash inside the error boundary.
 */
export function captureException(error: unknown, context?: TelemetryContext): void {
  if (context?.scope || context?.extra) {
    console.error('[telemetry]', context.scope ?? '(no scope)', error, context.extra ?? {})
  } else {
    console.error('[telemetry]', error)
  }
  const sink = activeSink
  if (!sink) return
  try {
    sink.captureException(error, context)
  } catch (sinkError) {
    // Don't recurse through `captureException` here — that's an obvious
    // way to trigger a stack overflow if the sink throws on the report.
    console.error('[telemetry] sink threw while reporting; original error above', sinkError)
  }
}
