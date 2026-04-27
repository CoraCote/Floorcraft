import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ExternalLink, Lock, Users } from 'lucide-react'
import { useVisibleEmployees } from '../../hooks/useVisibleEmployees'
import { useCan } from '../../hooks/useCan'
import { useFloorStore } from '../../stores/floorStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { buildOrgTree, type OrgTree, type OrgTreeNode } from '../../lib/orgChart'
import { Button } from '../ui/Button'

/**
 * Org-chart / manager-tree visualization.
 *
 * HR power users need to see the reporting chain at a glance — who reports
 * up to the CTO, which ICs are orphaned, where the management span is thin.
 * The roster already surfaces `managerId` per-row, so this page is a pure
 * presentation layer: it reads the same employee store (through the PII-
 * gated `useVisibleEmployees` hook) and lays it out top-down.
 *
 * Wave 18B polish notes:
 *
 *   - The page now sits on the same gradient shell as TeamHomePage /
 *     RosterPage / ReportsPage — gradient bg + max-w-7xl content column,
 *     a real identity-row header, and a stat strip summarising the tree
 *     at a glance.
 *   - The cycle banner and empty state both lift to the post-Wave-13C
 *     card idiom: tinted-circle icon, friendly copy, primary CTA built
 *     from the `<Button>` primitive instead of bespoke ad-hoc classes.
 *   - The recursive renderer is intentionally untouched in shape — it
 *     was working — but the wrapper card scrolls horizontally inside the
 *     page column so wide trees don't blow out the page max-width on
 *     narrow viewports.
 *
 * Gotchas handled:
 *   - Cycles in the reporting data (pathological CSV imports) would hang a
 *     naive recursive render. `buildOrgTree` detects them up front; we show
 *     a banner and refuse to draw rather than hanging the tab.
 *   - Privacy: for roles without `viewPII` (space-planner, viewer-with-
 *     viewReports-granted) the employee map is pre-redacted. A consequence
 *     is that `managerId` is also redacted to null — so the "tree" for such
 *     a user is just a flat list of initials. That is the correct outcome:
 *     we can't show reporting relationships to someone who can't see
 *     identities.
 *   - Orphans (managerId points at a now-deleted employee id) surface as
 *     true roots, not missing nodes.
 */
export function OrgChartPage() {
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  const navigate = useNavigate()
  const canViewReports = useCan('viewReports')
  // Use the PII-gated projection — never the raw store. Leaking names
  // through this page is a bug, not a performance win.
  const employees = useVisibleEmployees()
  const floors = useFloorStore((s) => s.floors)
  const departmentColors = useEmployeeStore((s) => s.departmentColors)

  // seatId (canvas element id) → human deskId, built across every floor
  // so the card doesn't have to thread floor context through its tree
  // position. Same pattern as RosterPage.
  const seatLabelMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const f of floors) {
      for (const el of Object.values(f.elements)) {
        const deskId = (el as { deskId?: string }).deskId
        if (typeof deskId === 'string' && deskId.trim().length > 0) {
          m[el.id] = deskId
        }
      }
    }
    return m
  }, [floors])

  const tree = useMemo(() => buildOrgTree(employees), [employees])

  // Stat strip values. All four numbers come from the already-built
  // tree (or the unfiltered employee map). Computing them here keeps the
  // strip a pure derivation of state already on screen — adding/removing
  // an employee in the roster updates the strip in the same render pass
  // that re-shapes the tree.
  const stats = useMemo(() => computeOrgStats(employees, tree), [employees, tree])

  const rosterHref =
    teamSlug && officeSlug ? `/t/${teamSlug}/o/${officeSlug}/roster` : null

  const onOpenInRoster = (employeeName: string) => {
    if (!teamSlug || !officeSlug) return
    navigate(
      `/t/${teamSlug}/o/${officeSlug}/roster?q=${encodeURIComponent(employeeName)}`,
    )
  }

  if (!canViewReports) {
    // Match the polished "not authorized" treatment from the rest of the
    // app — a centred lock card rather than raw text in the corner.
    return (
      <PageShell>
        <UnauthorizedState />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader rosterHref={rosterHref} />

      <StatStrip stats={stats} />

      {/* Cycle short-circuit: show the banner, skip the tree entirely. */}
      {tree.cycle ? (
        <CycleBanner
          cycle={tree.cycle}
          employees={employees}
          onOpenInRoster={onOpenInRoster}
        />
      ) : tree.roots.length === 0 ? (
        <EmptyState rosterHref={rosterHref} />
      ) : (
        <section
          className="mt-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4"
          aria-label="Reporting tree"
        >
          {/* The chart can be wider than the page column on a deep org —
              keep the outer card max-width and let the inner tree scroll
              horizontally. Vertical overflow stays natural so a long
              chain just lengthens the page rather than cropping. */}
          <div className="overflow-x-auto" role="tree" aria-label="Organization chart">
            <div className="flex items-start gap-8 min-w-max">
              {tree.roots.map((root) => (
                <TreeBranch
                  key={root.id}
                  node={root}
                  seatLabelMap={seatLabelMap}
                  departmentColors={departmentColors}
                  onNodeClick={onOpenInRoster}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </PageShell>
  )
}

/**
 * Outer chrome — gradient bg + content column. Mirrors TeamHomePage so
 * the editor sub-pages feel like part of the same surface. We don't
 * cap the width tighter than `max-w-7xl` because the org chart itself
 * benefits from the extra horizontal room (the inner card already
 * scrolls horizontally if it needs to).
 */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-6 py-10">{children}</div>
    </div>
  )
}

function PageHeader({ rosterHref }: { rosterHref: string | null }) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Org chart
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Reporting structure, by manager. Click any card to jump to the roster.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {rosterHref && (
          <Link
            to={rosterHref}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <ExternalLink size={14} aria-hidden="true" />
            Open in roster
          </Link>
        )}
      </div>
    </header>
  )
}

interface OrgStats {
  reporters: number
  roots: number
  orphans: number
  maxDepth: number
}

/**
 * Derive the stat-strip values from the pre-built tree. We deliberately
 * read both the tree and the redacted-employee map: `tree.roots` already
 * has the orphan/root distinction, but distinguishing "true root" (no
 * managerId set) from "orphan" (managerId points at a missing employee)
 * needs the original `managerId` field, which lives on the employee map.
 */
function computeOrgStats(
  employees: Record<string, { id: string; managerId: string | null }>,
  tree: OrgTree,
): OrgStats {
  if (tree.cycle) {
    // Numbers don't really mean anything in the cycle case — every
    // node is on a loop. Render zeroes; the banner is the real story.
    return { reporters: 0, roots: 0, orphans: 0, maxDepth: 0 }
  }
  let reporters = 0
  let trueRoots = 0
  let orphans = 0
  for (const e of Object.values(employees)) {
    if (e.managerId === null) {
      trueRoots += 1
    } else if (employees[e.managerId] === undefined) {
      // managerId set but points at a deleted/missing employee.
      orphans += 1
    } else {
      reporters += 1
    }
  }
  // Max depth = deepest path from a root. Includes both true roots and
  // orphans (they're both at depth 0 in the rendered tree).
  let maxDepth = 0
  const walk = (n: OrgTreeNode, d: number) => {
    if (d > maxDepth) maxDepth = d
    for (const c of n.children) walk(c, d + 1)
  }
  for (const r of tree.roots) walk(r, 0)
  return { reporters, roots: trueRoots, orphans, maxDepth }
}

function StatStrip({ stats }: { stats: OrgStats }) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6"
      aria-label="Org chart summary"
    >
      <StatCard label="Reporters" value={stats.reporters} />
      <StatCard label="Roots" value={stats.roots} />
      <StatCard label="Orphans" value={stats.orphans} />
      <StatCard label="Max depth" value={stats.maxDepth} />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
        {value}
      </div>
    </div>
  )
}

function CycleBanner({
  cycle,
  employees,
  onOpenInRoster,
}: {
  cycle: string[]
  employees: Record<string, { id: string; name: string }>
  onOpenInRoster: (name: string) => void
}) {
  const firstCycleId = cycle[0]
  const cycleNames = cycle.map((id) => employees[id]?.name ?? id).join(' → ')
  const fixTarget = employees[firstCycleId]
  return (
    <div
      data-testid="org-chart-cycle-banner"
      role="alert"
      className="mt-6 flex items-start gap-3 border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 rounded-lg p-4 text-sm text-amber-900 dark:text-amber-100"
    >
      <div
        aria-hidden="true"
        className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0"
      >
        <AlertTriangle size={18} className="text-amber-600 dark:text-amber-300" />
      </div>
      <div className="space-y-2 min-w-0 flex-1">
        <div className="font-semibold">Reporting cycle detected</div>
        <div>
          {/* Listing the members verbatim gives HR the info they need
              to pick a link to break — no need to go hunting in the
              roster first. */}
          The following employees form a reporting loop:{' '}
          <span className="font-mono text-xs break-words">{cycleNames}</span>.
          The chart cannot be rendered until the loop is broken.
        </div>
        {fixTarget && (
          <div className="pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onOpenInRoster(fixTarget.name)}
            >
              Fix in roster
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Recursive renderer. We deliberately lay the tree out with CSS flex +
 * vertical stacks instead of pulling in a graph library — max practical
 * depth is <10 and the dataset is O(hundreds), so a plain DOM tree is
 * readable, accessible, and zero-dependency.
 *
 * Connector lines between a parent and its children are intentionally
 * absent: adding them adds no real information (the indentation already
 * encodes the hierarchy), and the absolute-positioning math to keep them
 * aligned through sibling reflow is the kind of complexity that haunts
 * future edits. If a visual pedigree turns out to matter we can layer it
 * on later.
 */
function TreeBranch({
  node,
  seatLabelMap,
  departmentColors,
  onNodeClick,
}: {
  node: OrgTreeNode
  seatLabelMap: Record<string, string>
  departmentColors: Record<string, string>
  onNodeClick: (name: string) => void
}) {
  return (
    <div className="flex flex-col items-center">
      <NodeCard
        node={node}
        seatLabelMap={seatLabelMap}
        departmentColors={departmentColors}
        onClick={() => onNodeClick(node.employee.name)}
      />
      {node.children.length > 0 && (
        <div
          className="flex items-start gap-6 mt-4 pl-2 border-l border-gray-200 dark:border-gray-800"
          role="group"
          aria-label={`Direct reports of ${node.employee.name}`}
        >
          {node.children.map((c) => (
            <TreeBranch
              key={c.id}
              node={c}
              seatLabelMap={seatLabelMap}
              departmentColors={departmentColors}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NodeCard({
  node,
  seatLabelMap,
  departmentColors,
  onClick,
}: {
  node: OrgTreeNode
  seatLabelMap: Record<string, string>
  departmentColors: Record<string, string>
  onClick: () => void
}) {
  const e = node.employee
  const seatLabel = e.seatId ? seatLabelMap[e.seatId] ?? e.seatId : null
  const deptColor = e.department ? departmentColors[e.department] ?? '#d1d5db' : '#d1d5db'
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`org-node-${node.id}`}
      role="treeitem"
      aria-label={`${e.name}${e.title ? `, ${e.title}` : ''}`}
      className="text-left bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 hover:bg-gray-50/40 dark:hover:bg-gray-800/40 transition-all px-3 py-2 min-w-[180px] max-w-[220px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: deptColor }}
          aria-hidden="true"
        />
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{e.name}</div>
      </div>
      {e.title && (
        <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 truncate">{e.title}</div>
      )}
      <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
        {seatLabel ?? 'Unassigned'}
      </div>
    </button>
  )
}

/**
 * Full-page empty state. Mirrors the PanelEmptyState idiom — tinted icon
 * circle + title + body + primary action — but scaled up for a page-
 * level surface. Keeping the wording specific to the manager field gives
 * the user a clearer next step than a generic "no data".
 */
function EmptyState({ rosterHref }: { rosterHref: string | null }) {
  return (
    <div className="mt-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-10 text-center">
      <div
        aria-hidden="true"
        className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 mb-4"
      >
        <Users size={22} />
      </div>
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
        No reporting data
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
        Set <code className="font-mono">managerId</code> on at least one employee in the roster to start building the org tree.
      </p>
      {rosterHref && (
        <div className="mt-4 flex justify-center">
          <Link to={rosterHref}>
            <Button variant="primary">Open roster</Button>
          </Link>
        </div>
      )}
    </div>
  )
}

function UnauthorizedState() {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-10 text-center">
      <div
        aria-hidden="true"
        className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 mb-4"
      >
        <Lock size={22} />
      </div>
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
        Not authorized to view the org chart
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
        Ask your team admin to grant the Reports permission to see reporting structure.
      </p>
    </div>
  )
}
