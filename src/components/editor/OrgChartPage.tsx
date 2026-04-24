import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Users } from 'lucide-react'
import { useVisibleEmployees } from '../../hooks/useVisibleEmployees'
import { useCan } from '../../hooks/useCan'
import { useFloorStore } from '../../stores/floorStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { buildOrgTree, type OrgTreeNode } from '../../lib/orgChart'

/**
 * Org-chart / manager-tree visualization.
 *
 * HR power users need to see the reporting chain at a glance — who reports
 * up to the CTO, which ICs are orphaned, where the management span is thin.
 * The roster already surfaces `managerId` per-row, so this page is a pure
 * presentation layer: it reads the same employee store (through the PII-
 * gated `useVisibleEmployees` hook) and lays it out top-down.
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

  const onOpenInRoster = (employeeName: string) => {
    if (!teamSlug || !officeSlug) return
    navigate(
      `/t/${teamSlug}/o/${officeSlug}/roster?q=${encodeURIComponent(employeeName)}`,
    )
  }

  if (!canViewReports) {
    return (
      <div className="p-6 text-gray-600 dark:text-gray-300">Not authorized to view the org chart.</div>
    )
  }

  // Cycle short-circuit: show the banner, skip the tree entirely.
  if (tree.cycle) {
    const firstCycleId = tree.cycle[0]
    const cycleNames = tree.cycle
      .map((id) => employees[id]?.name ?? id)
      .join(' \u2192 ')
    const fixTarget = employees[firstCycleId]
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <div
          data-testid="org-chart-cycle-banner"
          className="flex items-start gap-3 border border-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-md p-4 text-sm text-amber-900"
        >
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <div className="font-semibold">Reporting cycle detected</div>
            <div>
              {/* Listing the members verbatim gives HR the info they need
                  to pick a link to break — no need to go hunting in the
                  roster first. */}
              The following employees form a reporting loop:{' '}
              <span className="font-mono text-xs">{cycleNames}</span>.
              The chart cannot be rendered until the loop is broken.
            </div>
            {fixTarget && (
              <button
                type="button"
                onClick={() => onOpenInRoster(fixTarget.name)}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 text-amber-900 border border-amber-300"
              >
                Fix in roster
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Empty-state. Separate from "no cycle" so the copy can speak to the
  // actual cause (managerId is unset everywhere) instead of a generic
  // "no data" line.
  if (tree.roots.length === 0) {
    return (
      <div className="p-6 max-w-3xl">
        <EmptyState />
      </div>
    )
  }

  return (
    <div className="p-6 overflow-auto" role="tree" aria-label="Organization chart">
      <div className="flex items-start gap-8">
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
      className="text-left bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md shadow-sm hover:shadow-md hover:border-blue-300 transition-shadow px-3 py-2 min-w-[180px] max-w-[220px]"
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

function EmptyState() {
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-md bg-white dark:bg-gray-900 p-8 text-center text-gray-500 dark:text-gray-400">
      <Users size={32} className="mx-auto text-gray-400 dark:text-gray-500 mb-3" />
      <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
        No reporting data.
      </div>
      <div className="text-xs mt-1">
        Set <code className="font-mono">managerId</code> on employees to build this chart.
      </div>
    </div>
  )
}
