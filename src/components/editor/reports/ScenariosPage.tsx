import { useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as Tabs from '@radix-ui/react-tabs'
import { ArrowLeft, Layers, Lock, Plus } from 'lucide-react'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useFloorStore } from '../../../stores/floorStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useCan } from '../../../hooks/useCan'
import { computeUtilizationMetrics } from '../../../lib/utilizationMetrics'
import type { CanvasElement } from '../../../types/elements'
import type { Employee } from '../../../types/employee'
import {
  UNASSIGNED_DEPARTMENT,
  type ScenarioBaseSnapshot,
} from '../../../lib/scenarios'
import { useScenariosStore } from '../../../stores/scenariosStore'
import { ScenarioDetailPane } from './ScenarioDetailPane'
import { ScenarioCompareView } from './ScenarioCompareView'
import { Button } from '../../ui/Button'

/**
 * Top-level "Capacity scenarios" page. A space planner opens this page,
 * spawns a new scenario (snapshot of current office counts), then models
 * adjustments in the detail pane. The page deliberately never reads
 * employee *names* — the scenario model deals in counts only, so there's
 * no PII surface area regardless of the viewer's role.
 *
 * Layout: gradient page shell with a centred max-w-7xl column. Inside
 * the column lives the working area — a sidebar listing scenarios on
 * the left, a tabbed detail (Edit | Compare) on the right. View-only
 * roles see the sidebar + detail pane but every input is disabled.
 *
 * Wave 18B polish notes:
 *
 *   - The page now sits on the same gradient shell as TeamHomePage /
 *     RosterPage / ReportsPage and gets a real identity-row header
 *     with a "Back to reports" link.
 *   - The sidebar + detail layout are preserved (the data flow and
 *     existing tests depend on the same DOM nodes), but the surrounding
 *     card lifts to the post-Wave-13C border-radius / dark-mode pair so
 *     the whole surface feels like part of the same product.
 *   - Both empty branches (no scenarios + view-only, no scenarios +
 *     editable) get a real card + tinted-icon empty state instead of
 *     centred raw text. The unauthorized branch picks up a matching
 *     lock card.
 */
export function ScenariosPage() {
  const canView = useCan('viewReports')
  const canEdit = useCan('editRoster')
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()

  const scenarios = useScenariosStore((s) => s.scenarios)
  const activeId = useScenariosStore((s) => s.activeScenarioId)
  const compareId = useScenariosStore((s) => s.compareScenarioId)
  const createScenario = useScenariosStore((s) => s.createScenario)
  const cloneScenario = useScenariosStore((s) => s.cloneScenario)
  const removeScenario = useScenariosStore((s) => s.removeScenario)
  const setActiveScenario = useScenariosStore((s) => s.setActiveScenario)

  // Compute a base snapshot from the live stores. Cheap to do on every
  // render — `computeUtilizationMetrics` is pure and the only aggregation
  // runs across elements+employees, both of which are already
  // memoisation-friendly via their stores.
  const allFloorsElements = useFloorStore((s) => s.floors)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const activeElements = useElementsStore((s) => s.elements)
  const employees = useEmployeeStore((s) => s.employees)

  const liveElements = useMemo(() => {
    const merged: Record<string, CanvasElement> = {}
    for (const floor of allFloorsElements) {
      const src = floor.id === activeFloorId ? activeElements : floor.elements
      Object.assign(merged, src)
    }
    return merged
  }, [allFloorsElements, activeFloorId, activeElements])

  const currentSnapshot = useMemo<ScenarioBaseSnapshot>(() => {
    const metrics = computeUtilizationMetrics(liveElements, employees)
    const byDept = countByDepartment(employees)
    return {
      activeEmployees: metrics.activeEmployees,
      employeesByDepartment: byDept,
      totalSeats: metrics.totalSeats,
      assignedSeats: metrics.assignedSeats,
    }
  }, [liveElements, employees])

  const [tab, setTab] = useState<'edit' | 'compare'>('edit')

  const active = useMemo(
    () => scenarios.find((s) => s.id === activeId) ?? null,
    [scenarios, activeId],
  )
  const other = useMemo(
    () => scenarios.find((s) => s.id === compareId) ?? null,
    [scenarios, compareId],
  )

  const handleCreate = useCallback(() => {
    createScenario(currentSnapshot)
  }, [createScenario, currentSnapshot])

  const handleClone = useCallback(() => {
    if (active) cloneScenario(active.id)
  }, [active, cloneScenario])

  const handleRemove = useCallback(() => {
    if (active) removeScenario(active.id)
  }, [active, removeScenario])

  const reportsHref =
    teamSlug && officeSlug ? `/t/${teamSlug}/o/${officeSlug}/reports` : null

  if (!canView) {
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
      <PageHeader reportsHref={reportsHref} />

      <section
        // Working surface — a single bordered card containing the
        // sidebar + detail pane. Tall enough that the detail pane
        // doesn't feel cramped on a typical laptop screen, but capped
        // so it doesn't push the page footer below the viewport on
        // shorter monitors.
        className="mt-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden"
      >
        <div className="flex min-h-[600px]">
          {/* Sidebar — list of scenarios. */}
          <aside className="w-64 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Scenarios
              </h2>
              {canEdit && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleCreate}
                  aria-label="New scenario"
                  leftIcon={<Plus size={12} aria-hidden="true" />}
                >
                  New
                </Button>
              )}
            </div>
            {scenarios.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No scenarios yet. {canEdit ? 'Create one to start planning.' : ''}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {scenarios.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setActiveScenario(s.id)}
                      className={`w-full text-left text-sm px-2 py-1.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        s.id === activeId
                          ? 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 font-medium'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="truncate">{s.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                        {s.adjustments.length} adjustment
                        {s.adjustments.length === 1 ? '' : 's'}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Snapshot footer — reassures the planner about what "today"
                means in the projection. */}
            <div className="mt-auto text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800 pt-3">
              <div className="font-semibold text-gray-600 dark:text-gray-300">Today</div>
              <div className="tabular-nums">
                {currentSnapshot.activeEmployees} active · {currentSnapshot.totalSeats} seats
              </div>
            </div>
          </aside>

          {/* Main area — tabs for edit vs. compare. */}
          <div className="flex-1 flex flex-col min-w-0">
            {active ? (
              <Tabs.Root
                value={tab}
                onValueChange={(v) => setTab(v as 'edit' | 'compare')}
                className="flex-1 flex flex-col"
              >
                {/* Tab strip — matches the ReportsPage blue-underline
                    treatment so the two reports surfaces share one
                    mental model. */}
                <Tabs.List
                  aria-label="Scenario sections"
                  className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-800 px-6 pt-4 bg-white dark:bg-gray-900"
                >
                  <Tabs.Trigger
                    value="edit"
                    className="px-3 py-2 text-sm font-medium transition-colors text-gray-600 dark:text-gray-300 border-b-2 border-transparent hover:text-gray-800 dark:hover:text-gray-100 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:border-blue-600 -mb-px"
                  >
                    Edit
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="compare"
                    className="px-3 py-2 text-sm font-medium transition-colors text-gray-600 dark:text-gray-300 border-b-2 border-transparent hover:text-gray-800 dark:hover:text-gray-100 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:border-blue-600 -mb-px"
                  >
                    Compare
                  </Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="edit" className="flex-1 flex flex-col">
                  <ScenarioDetailPane
                    scenario={active}
                    editable={canEdit}
                    onClone={handleClone}
                    onRemove={handleRemove}
                  />
                </Tabs.Content>
                <Tabs.Content value="compare" className="flex-1 flex flex-col">
                  <ScenarioCompareView
                    primary={active}
                    other={other}
                    allScenarios={scenarios}
                  />
                </Tabs.Content>
              </Tabs.Root>
            ) : (
              <NoActiveScenarioState canEdit={canEdit} onCreate={handleCreate} />
            )}
          </div>
        </div>
      </section>
    </PageShell>
  )
}

/**
 * Outer chrome — gradient bg + content column. Mirrors TeamHomePage so
 * the editor sub-pages feel like part of the same surface.
 */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-6 py-10">{children}</div>
    </div>
  )
}

function PageHeader({ reportsHref }: { reportsHref: string | null }) {
  return (
    <header className="space-y-3">
      {reportsHref && (
        <div>
          <Link
            to={reportsHref}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <ArrowLeft size={12} aria-hidden="true" />
            Back to reports
          </Link>
        </div>
      )}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Scenarios
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Model headcount and seat changes against today&rsquo;s office snapshot without committing edits.
        </p>
      </div>
    </header>
  )
}

/**
 * Empty-state card shown in the main pane when no scenario is active.
 * Two phrasings — for editors and for read-only viewers — driven by
 * `canEdit`. The exact "Create a scenario to start modelling." copy is
 * preserved so existing tests still match.
 */
function NoActiveScenarioState({
  canEdit,
  onCreate,
}: {
  canEdit: boolean
  onCreate: () => void
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-10">
      <div className="text-center max-w-sm">
        <div
          aria-hidden="true"
          className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 mb-4"
        >
          <Layers size={22} />
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {canEdit ? 'No scenario selected' : 'No scenarios to view'}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {canEdit
            ? 'Create a scenario to start modelling.'
            : 'Ask a planner to create a scenario before reviewing here.'}
        </p>
        {canEdit && (
          <div className="mt-4 flex justify-center">
            {/* Different verb on the page-level CTA than the sidebar
                "New" button — a screen reader hitting both should hear
                two distinct affordances rather than the same accessible
                name twice in a row. */}
            <Button variant="primary" onClick={onCreate} leftIcon={<Plus size={14} />}>
              Create scenario
            </Button>
          </div>
        )}
      </div>
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
        Not authorized to view scenarios
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
        Ask your team admin to grant the Reports permission to view capacity scenarios.
      </p>
    </div>
  )
}

/**
 * Count active employees (status !== 'departed') bucketed by department.
 * Null / empty department values land in the `UNASSIGNED_DEPARTMENT`
 * bucket so the UI can show an entry for them without conditional logic.
 * Employees' names are never inspected — this is pure aggregate math,
 * which is why the scenario feature doesn't need a redaction-aware hook.
 */
function countByDepartment(employees: Record<string, Employee>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of Object.values(employees)) {
    if (e.status === 'departed') continue
    const key = e.department && e.department.length > 0 ? e.department : UNASSIGNED_DEPARTMENT
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}
