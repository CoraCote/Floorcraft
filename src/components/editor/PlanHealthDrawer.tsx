import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react'
import { useFloorStore } from '../../stores/floorStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { focusElements } from '../../lib/focusElements'
import type { PlanHealth, PlanIssue, IssueSeverity } from '../../lib/planHealth'

interface Props {
  health: PlanHealth
  onClose: () => void
}

/**
 * Right-edge slide-in drawer that lists every plan-health issue and lets the
 * user "Jump" to the affected element. Visual shell mirrors
 * `SeatHistoryDrawer` so the two side panels feel like siblings.
 *
 * Jump behaviour:
 *  - element targets → `focusElements` (handles cross-floor switch + select).
 *  - employee-only targets (broken seat reference) → roster route with the
 *    employee id pinned to `?focus=<id>` so RosterPage opens the detail
 *    drawer for that person.
 */
export function PlanHealthDrawer({ health, onClose }: Props) {
  const drawerRef = useRef<HTMLElement>(null)
  const navigate = useNavigate()
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  const floors = useFloorStore((s) => s.floors)
  const employees = useEmployeeStore((s) => s.employees)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Esc to close — captured at the document level so Escape closes the
  // drawer even when focus has wandered into the page beneath. Mirrors the
  // pattern used by SeatHistoryDrawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const floorName = (floorId: string | null): string => {
    if (!floorId) return 'No floor'
    return floors.find((f) => f.id === floorId)?.name ?? 'Unknown floor'
  }

  const handleJump = (issue: PlanIssue) => {
    // Decide whether the targets are elements or an employee. The analyzer
    // emits employee-only targets exclusively for the `emp-ref-broken:*`
    // issue (id prefix is stable enough to key on).
    if (issue.id.startsWith('emp-ref-broken:')) {
      const empId = issue.targetIds[0]
      // Defensive: we still need a real employee to jump to. Falling back
      // to a no-op silently is a worse UX than swallowing the click — the
      // analyzer will simply re-flag this on the next render.
      if (empId && employees[empId] && teamSlug && officeSlug) {
        navigate(`/t/${teamSlug}/o/${officeSlug}/roster?focus=${empId}`)
      }
      onClose()
      return
    }

    if (issue.targetIds.length === 0) {
      onClose()
      return
    }
    focusElements(issue.targetIds)
    onClose()
  }

  const total = health.errorCount + health.warningCount + health.infoCount

  return (
    <div
      className="fixed inset-0 z-40 flex"
      data-testid="plan-health-drawer"
    >
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        className="relative ml-auto w-[400px] max-w-full h-full bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Plan health"
      >
        <header className="flex items-start justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Plan health
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {total === 0
                ? 'No issues detected'
                : `${health.errorCount} error${health.errorCount === 1 ? '' : 's'} · ${health.warningCount} warning${health.warningCount === 1 ? '' : 's'} · ${health.infoCount} info`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 px-2 py-2">
          {health.issues.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {health.issues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  floorName={floorName(issue.floorId)}
                  onJump={() => handleJump(issue)}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      className="text-sm text-gray-500 dark:text-gray-400 text-center py-12"
      data-testid="plan-health-empty"
    >
      <CheckCircle2
        className="mx-auto mb-3 text-green-500 dark:text-green-400"
        size={32}
        aria-hidden="true"
      />
      <div className="mb-1 font-medium text-gray-700 dark:text-gray-200">
        Everything looks good
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 max-w-[260px] mx-auto">
        We’ll keep checking as you edit. References, capacity, attachments,
        and overlaps all clear right now.
      </p>
    </div>
  )
}

function IssueRow({
  issue,
  floorName,
  onJump,
}: {
  issue: PlanIssue
  floorName: string
  onJump: () => void
}) {
  return (
    <li className="px-3 py-3 flex items-start gap-3" data-testid="plan-health-row">
      <SeverityIcon severity={issue.severity} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-gray-100">
          {issue.message}
        </div>
        {issue.detail && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {issue.detail}
          </div>
        )}
        <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1">
          {floorName} · {issue.category}
        </div>
      </div>
      <button
        onClick={onJump}
        className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex-shrink-0"
        data-testid="plan-health-jump"
      >
        Jump
      </button>
    </li>
  )
}

function SeverityIcon({ severity }: { severity: IssueSeverity }) {
  if (severity === 'error') {
    return (
      <AlertCircle
        size={16}
        className="text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5"
        aria-hidden="true"
      />
    )
  }
  if (severity === 'warning') {
    return (
      <AlertTriangle
        size={16}
        className="text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5"
        aria-hidden="true"
      />
    )
  }
  return (
    <Info
      size={16}
      className="text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5"
      aria-hidden="true"
    />
  )
}
