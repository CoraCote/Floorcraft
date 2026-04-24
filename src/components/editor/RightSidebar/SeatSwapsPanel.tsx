import { useMemo } from 'react'
import { ArrowLeftRight, Check, X } from 'lucide-react'
import { useSeatSwapsStore } from '../../../stores/seatSwapsStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useProjectStore } from '../../../stores/projectStore'
import { useCan } from '../../../hooks/useCan'
import type { SeatSwapRequest, SeatSwapStatus } from '../../../types/seatSwaps'

/**
 * Panel section mounted inside `InsightsPanel`. Lists seat-swap requests
 * grouped by status with the pending group pinned to the top; each row
 * shows both employees + their seats. Approve / Deny buttons render for
 * users with `editRoster`; the requester always sees a Cancel affordance
 * on their own pending request.
 */
export function SeatSwapsPanel() {
  const requests = useSeatSwapsStore((s) => s.requests)
  const employees = useEmployeeStore((s) => s.employees)
  const approve = useSeatSwapsStore((s) => s.approve)
  const deny = useSeatSwapsStore((s) => s.deny)
  const cancel = useSeatSwapsStore((s) => s.cancel)
  const currentUserId = useProjectStore((s) => s.currentUserId)
  const canEditRoster = useCan('editRoster')

  const grouped = useMemo(() => {
    const pending: SeatSwapRequest[] = []
    const approved: SeatSwapRequest[] = []
    const denied: SeatSwapRequest[] = []
    const canceled: SeatSwapRequest[] = []
    for (const r of Object.values(requests)) {
      if (r.status === 'pending') pending.push(r)
      else if (r.status === 'approved') approved.push(r)
      else if (r.status === 'denied') denied.push(r)
      else if (r.status === 'canceled') canceled.push(r)
    }
    // Newest first within each group.
    const byCreatedDesc = (a: SeatSwapRequest, b: SeatSwapRequest) =>
      b.createdAt.localeCompare(a.createdAt)
    pending.sort(byCreatedDesc)
    approved.sort(byCreatedDesc)
    denied.sort(byCreatedDesc)
    canceled.sort(byCreatedDesc)
    return { pending, approved, denied, canceled }
  }, [requests])

  const total = Object.keys(requests).length
  if (total === 0) {
    return (
      <div className="mb-3">
        <Header count={0} />
        <div className="text-xs text-gray-400 dark:text-gray-500 py-2">
          No swap requests yet.
        </div>
      </div>
    )
  }

  return (
    <div className="mb-3">
      <Header count={grouped.pending.length} />
      <div className="flex flex-col gap-2">
        {grouped.pending.length > 0 && (
          <Group label="Pending" status="pending">
            {grouped.pending.map((r) => (
              <SwapRow
                key={r.id}
                request={r}
                employees={employees}
                canApprove={canEditRoster}
                isRequester={currentUserId !== null && r.requesterId === currentUserId}
                onApprove={() => approve(r.id, currentUserId ?? 'unknown')}
                onDeny={() => deny(r.id, currentUserId ?? 'unknown')}
                onCancel={() => cancel(r.id)}
              />
            ))}
          </Group>
        )}
        {grouped.approved.length > 0 && (
          <Group label="Approved" status="approved">
            {grouped.approved.map((r) => (
              <SwapRow key={r.id} request={r} employees={employees} />
            ))}
          </Group>
        )}
        {grouped.denied.length > 0 && (
          <Group label="Denied" status="denied">
            {grouped.denied.map((r) => (
              <SwapRow key={r.id} request={r} employees={employees} />
            ))}
          </Group>
        )}
        {grouped.canceled.length > 0 && (
          <Group label="Canceled" status="canceled">
            {grouped.canceled.map((r) => (
              <SwapRow key={r.id} request={r} employees={employees} />
            ))}
          </Group>
        )}
      </div>
    </div>
  )
}

function Header({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <ArrowLeftRight size={12} className="text-gray-400 dark:text-gray-500" />
      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Seat swaps
      </div>
      <div className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">{count} pending</div>
    </div>
  )
}

function Group({
  label,
  status,
  children,
}: {
  label: string
  status: SeatSwapStatus
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5" data-swap-group={status}>
      <div className="text-[10px] font-medium uppercase text-gray-400 dark:text-gray-500 tracking-wider">
        {label}
      </div>
      {children}
    </div>
  )
}

interface RowProps {
  request: SeatSwapRequest
  employees: Record<string, { id: string; name: string }>
  canApprove?: boolean
  isRequester?: boolean
  onApprove?: () => void
  onDeny?: () => void
  onCancel?: () => void
}

function SwapRow({
  request,
  employees,
  canApprove,
  isRequester,
  onApprove,
  onDeny,
  onCancel,
}: RowProps) {
  const requester = employees[request.requesterId]
  const target = employees[request.targetEmployeeId]
  const requesterName = requester?.name ?? 'Unknown'
  const targetName = target?.name ?? 'Unknown'
  const isPending = request.status === 'pending'
  return (
    <div
      className="flex flex-col gap-1 p-2 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
      data-swap-request-id={request.id}
    >
      <div className="flex items-center gap-1 text-xs text-gray-800 dark:text-gray-100">
        <span className="font-medium truncate" title={requesterName}>
          {requesterName}
        </span>
        <span className="text-gray-400 dark:text-gray-500">({request.requesterSeatId})</span>
        <ArrowLeftRight size={10} className="text-gray-400 dark:text-gray-500 mx-1 flex-shrink-0" />
        <span className="font-medium truncate" title={targetName}>
          {targetName}
        </span>
        <span className="text-gray-400 dark:text-gray-500">({request.targetSeatId})</span>
      </div>
      {request.reason && (
        <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug whitespace-pre-wrap">
          {request.reason}
        </div>
      )}
      {isPending && (canApprove || isRequester) && (
        <div className="flex items-center gap-2 pt-1">
          {canApprove && onApprove && (
            <button
              type="button"
              onClick={onApprove}
              className="flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
              aria-label={`Approve swap between ${requesterName} and ${targetName}`}
            >
              <Check size={11} /> Approve
            </button>
          )}
          {canApprove && onDeny && (
            <button
              type="button"
              onClick={onDeny}
              className="flex items-center gap-1 text-[11px] text-red-700 dark:text-red-300 hover:text-red-800 px-2 py-0.5 rounded border border-red-200 bg-red-50 dark:bg-red-950/40 hover:bg-red-100"
              aria-label={`Deny swap between ${requesterName} and ${targetName}`}
            >
              <X size={11} /> Deny
            </button>
          )}
          {!canApprove && isRequester && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              Cancel request
            </button>
          )}
        </div>
      )}
    </div>
  )
}
