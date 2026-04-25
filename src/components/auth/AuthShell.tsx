import { Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Wave 17A shared chrome for every auth screen. The five auth pages
 * (login / signup / forgot / reset / verify) now share a centered
 * card on a soft gradient with the Floorcraft wordmark up top — the
 * same visual idiom the landing page and team home use.
 *
 * The primitives live in a single file (instead of inline helpers per
 * page) so that tiny adjustments — card padding, gradient stops, the
 * error banner — only need to land in one place to stay consistent.
 * They are intentionally narrow: heading / field label / error
 * banner / link row. Anything richer (spinners, icons) is assembled
 * per page using the UI-kit `Button` and `Input` primitives.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
      <header className="px-6 pt-6 sm:pt-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-semibold tracking-tight text-gray-900 dark:text-gray-100"
        >
          {/* Tiny diamond mark — same "F" chip idiom used in LandingNav. */}
          <span
            aria-hidden="true"
            className="inline-block h-5 w-5 rotate-45 rounded-sm bg-gradient-to-br from-blue-500 to-indigo-600"
          />
          <span>Floorcraft</span>
        </Link>
      </header>
      <main className="flex-1 flex items-start justify-center px-6 pt-10 pb-12 sm:pt-16">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900/80">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}

export function AuthHeading({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="mb-6 space-y-1.5">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        {title}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
    </div>
  )
}

export function AuthFieldLabel({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
      </label>
      {children}
    </div>
  )
}

export function AuthErrorBanner({ id, message }: { id: string; message: string }) {
  return (
    <div
      id={id}
      role="alert"
      className="mb-4 flex items-start gap-2.5 rounded-md border border-red-200 border-l-4 border-l-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/60 dark:border-l-red-500 dark:bg-red-950/40 dark:text-red-200"
    >
      <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

export function AuthLinks({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex items-center justify-between text-xs">{children}</div>
}
