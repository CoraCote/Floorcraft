import { Link } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useCan } from '../../hooks/useCan'
import { FloorCompareTable } from '../editor/reports/FloorCompareTable'

/**
 * Page shell for `/t/:teamSlug/o/:officeSlug/reports/floor-compare`. The
 * `viewReports` permission is already enforced upstream by the parent
 * `/reports` route, but we re-check here because this page can be linked
 * to directly — belt-and-suspenders, identical to what `ReportsPage` does.
 */
export function FloorComparePage() {
  const canView = useCan('viewReports')
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()

  if (!canView) {
    return <div className="p-6 text-gray-600 dark:text-gray-300">Not authorized to view reports.</div>
  }

  const reportsHref =
    teamSlug && officeSlug ? `/t/${teamSlug}/o/${officeSlug}/reports` : '#'

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <Link
          to={reportsHref}
          className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <ArrowLeft size={14} />
          Back to reports
        </Link>
      </div>
      <header>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Floor compare</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Side-by-side utilization metrics for every floor, plus a 14-day
          seat-activity sparkline. Click a row to jump to that floor on the map.
        </p>
      </header>
      <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded p-4">
        <FloorCompareTable />
      </section>
    </div>
  )
}
