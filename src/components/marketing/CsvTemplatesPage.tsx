import { Link } from 'react-router-dom'
import { Download, FileText } from 'lucide-react'
import { PublicPageShell } from './PublicPageShell'

/**
 * `/csv-templates` — public reference for the CSV import/export format
 * Floorcraft's roster supports. Includes downloadable starter templates
 * (constructed at click-time as data URIs so we don't need to ship
 * a static asset). Walks through the column dictionary so a planner
 * preparing data in Excel / Google Sheets has the exact column names
 * and formats up front.
 */
const COLUMNS = [
  { name: 'name', required: true, description: 'Full display name. Used for seat labels and the roster table.' },
  { name: 'email', required: true, description: 'Unique per employee; the primary key Floorcraft uses to match rows on re-import.' },
  { name: 'department', required: false, description: 'Free-form string. Drives the per-department color coding on the canvas.' },
  { name: 'team', required: false, description: 'Sub-grouping inside a department.' },
  { name: 'title', required: false, description: 'Job title — surfaced in the roster row tooltip.' },
  { name: 'manager', required: false, description: 'Manager\'s NAME (we resolve to manager email on import). Used for the Org Chart Overlay.' },
  { name: 'employmentType', required: false, description: 'One of: full-time, part-time, contractor, intern.' },
  { name: 'status', required: false, description: 'One of: active, on-leave, ending. Defaults to active when blank.' },
  { name: 'officeDays', required: false, description: 'Comma- or pipe-separated list: Mon|Tue|Wed|Thu|Fri.' },
  { name: 'startDate', required: false, description: 'ISO 8601 (YYYY-MM-DD).' },
  { name: 'endDate', required: false, description: 'ISO 8601 (YYYY-MM-DD). Triggers an "ending" status on the import.' },
  { name: 'equipmentNeeds', required: false, description: 'Free-form: "monitor, dock, headset". Surfaces in the equipment insights analyzer.' },
  { name: 'photoUrl', required: false, description: 'Public HTTPS URL. We render the photo in the roster + element hover card.' },
  { name: 'tags', required: false, description: 'Pipe-separated free-form labels.' },
] as const

const TEMPLATE_HEADER = COLUMNS.map((c) => c.name).join(',')
const TEMPLATE_EXAMPLE = [
  'Avery Chen',
  'avery.chen@example.com',
  'Engineering',
  'Platform',
  'Senior Engineer',
  'Marta Ribeiro',
  'full-time',
  'active',
  'Mon|Tue|Wed|Thu|Fri',
  '2024-09-02',
  '',
  'monitor,dock',
  '',
  'mentor|hiring-panel',
].join(',')

const TEMPLATE_CSV = `${TEMPLATE_HEADER}\n${TEMPLATE_EXAMPLE}\n`

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'floorcraft-roster-template.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function CsvTemplatesPage() {
  return (
    <PublicPageShell
      eyebrow="§02 · CSV templates"
      documentTitle="CSV templates — Floorcraft"
      title="Bring your roster in from a spreadsheet."
      subtitle="Floorcraft's roster import accepts a single CSV. Download the template, fill it in, drop it back into the editor."
    >
      {/* Download CTA */}
      <div className="rounded-xl border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 items-center justify-center rounded-md border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper)] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] flex-shrink-0">
            <FileText size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
              floorcraft-roster-template.csv
            </div>
            <div className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
              {COLUMNS.length} columns · 1 example row
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[color:var(--color-blueprint)] hover:bg-[color:var(--color-blueprint-strong)] text-white transition-colors flex-shrink-0"
        >
          <Download size={14} aria-hidden="true" />
          Download CSV
        </button>
      </div>

      <h2 className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] mt-12 mb-4">
        Column dictionary
      </h2>
      <div className="rounded-xl border border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-paper-sunken)] dark:bg-gray-800/50 font-mono text-[10px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            <tr>
              <th className="text-left px-4 py-2.5">Column</th>
              <th className="text-left px-4 py-2.5">Required</th>
              <th className="text-left px-4 py-2.5">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900">
            {COLUMNS.map((c) => (
              <tr key={c.name}>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-900 dark:text-gray-100">
                  {c.name}
                </td>
                <td className="px-4 py-2.5">
                  {c.required ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]">
                      Required
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                      Optional
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 leading-relaxed">
                  {c.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] mt-12 mb-4">
        Notes
      </h2>
      <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        <li>· UTF-8 encoded. Comma-separated. The header row is required.</li>
        <li>· The <code className="font-mono text-xs">manager</code> column matches by NAME on import; we do a two-pass resolve so order in the file doesn't matter.</li>
        <li>· Re-importing the same file is idempotent — rows are matched on email and updated in place.</li>
        <li>· An import never deletes — to remove people, use the roster's bulk-edit tools inside the editor.</li>
      </ul>

      <p className="mt-12 text-sm text-gray-600 dark:text-gray-400">
        Step-by-step walkthrough with screenshots:{' '}
        <Link
          to="/help#csv-import"
          className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
        >
          Import preview in the user guide
        </Link>
        .
      </p>
    </PublicPageShell>
  )
}
