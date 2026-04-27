import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Lock } from 'lucide-react'
import { useCan } from '../../hooks/useCan'
import { FloorCompareTable } from '../editor/reports/FloorCompareTable'

/**
 * Wave 18A: bring the floor-compare report shell up to the gradient +
 * max-w idiom the rest of the reports surface uses (Wave 13C polished
 * `ReportsPage` and the editor's full-width pages). Pre-18A this page
 * sat on flat `p-6 max-w-5xl` chrome with a "Not authorized" string in
 * gray sans-serif — visually a half-step out from its parent route.
 *
 * The body — `<FloorCompareTable />` — is intentionally untouched.
 * That table has its own per-row instrumentation and tests; the polish
 * is contained to the page chrome (header, back chip, card border, and
 * the not-authorized fallback).
 *
 * The `viewReports` permission is enforced upstream by the parent
 * `/reports` route, but we re-check here because a deep-link can land
 * anywhere — belt-and-suspenders, identical to what `ReportsPage` does.
 * The denied branch now matches the empty-state visual idiom (tinted
 * `Lock` icon in a circle, title, body, CTA) instead of an unstyled
 * fallback line.
 */
export function FloorComparePage() {
  const canView = useCan('viewReports')
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()

  const reportsHref =
    teamSlug && officeSlug ? `/t/${teamSlug}/o/${officeSlug}/reports` : '#'
  const officeHref =
    teamSlug && officeSlug ? `/t/${teamSlug}/o/${officeSlug}/map` : '/dashboard'

  if (!canView) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div
            role="alert"
            className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            >
              <Lock size={22} />
            </div>
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Not authorized
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              You don&apos;t have permission to view reports for this
              office. Ask a team admin to grant you the editor or owner
              role.
            </p>
            <Link
              to={officeHref}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Back to office
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-5">
        {/* "Back to reports" rendered as a chip-style link — matches
            the back-link idiom used elsewhere in the editor. */}
        <Link
          to={reportsHref}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/50"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to reports
        </Link>

        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Floor compare
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Side-by-side utilization metrics for every floor, plus a
            14-day seat-activity sparkline. Click a row to jump to that
            floor on the map.
          </p>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <FloorCompareTable />
        </section>
      </div>
    </div>
  )
}
