import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSeatDetailStore } from '../../../stores/seatDragStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useCan } from '../../../hooks/useCan'
import { redactEmployee } from '../../../lib/redactEmployee'
import { unassignEmployee } from '../../../lib/seatAssignment'
import {
  EMPLOYEE_STATUS_PILL_CLASSES,
  type Employee,
  type EmployeeStatus,
} from '../../../types/employee'

/**
 * DOM overlay (NOT Konva) that floats a compact employee info card next
 * to a desk when the user clicks an assigned desk on the canvas. Styled
 * and positioned the same way as `AnnotationPopover` — re-using the
 * same `containerRef.getBoundingClientRect()` + render-time anchor math
 * so the popover sits against the desk's on-screen position.
 *
 * Opens from `useSeatDetailStore` (set by CanvasStage's click handler).
 * Closes on ESC, background click, selection change, or clicking the
 * "Close" affordance. PII fields redact under `viewPII=false`.
 */
interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>
}

const STATUS_LABEL: Record<EmployeeStatus, string> = {
  active: 'Active',
  'on-leave': 'On leave',
  departed: 'Departed',
  'parental-leave': 'Parental leave',
  sabbatical: 'Sabbatical',
  contractor: 'Contractor',
  intern: 'Intern',
}

export function SeatDetailPopover({ containerRef }: Props) {
  const activeElementId = useSeatDetailStore((s) => s.activeElementId)
  const screenX = useSeatDetailStore((s) => s.screenX)
  const screenY = useSeatDetailStore((s) => s.screenY)
  const close = useSeatDetailStore((s) => s.close)

  const elements = useElementsStore((s) => s.elements)
  const employees = useEmployeeStore((s) => s.employees)
  const getDepartmentColor = useEmployeeStore((s) => s.getDepartmentColor)
  // Read both permissions unconditionally so the hook call order stays
  // stable — `useCan('a') || useCan('b')` would short-circuit the second
  // call and violate rules-of-hooks.
  const canViewPII = useCan('viewPII')
  const canEditRoster = useCan('editRoster')

  const navigate = useNavigate()
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()

  const element = activeElementId ? elements[activeElementId] : null
  const employeeId =
    element && 'assignedEmployeeId' in element
      ? (element.assignedEmployeeId as string | null)
      : null
  const rawEmployee: Employee | null = employeeId ? employees[employeeId] ?? null : null
  const employee: Employee | null = rawEmployee
    ? canViewPII
      ? rawEmployee
      : redactEmployee(rawEmployee)
    : null

  // ESC dismissal — the AnnotationPopover pattern gates escape on a
  // dialog boundary, but our popover is a thin floating card and a raw
  // Escape always means "close me". Registered unconditionally so the
  // cleanup fires on every remount.
  useEffect(() => {
    if (!activeElementId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeElementId, close])

  // Screen-space anchor math — same shape as AnnotationPopover. Reading
  // the container rect in render (vs. a useEffect) sidesteps the
  // `react-hooks/set-state-in-effect` rule; the canvas container is
  // mounted before any popover can open so the ref is populated.
  // eslint-disable-next-line react-hooks/refs
  const rect = containerRef.current?.getBoundingClientRect()

  if (!activeElementId || !element || !employee) return null

  const pos = rect
    ? { left: rect.left + screenX + 12, top: rect.top + screenY + 12 }
    : { left: 0, top: 0 }

  const deptColor = employee.department ? getDepartmentColor(employee.department) : '#9CA3AF'
  const manager =
    employee.managerId && employees[employee.managerId]
      ? employees[employee.managerId]
      : null
  const managerName = manager
    ? canViewPII
      ? manager.name
      : redactEmployee(manager).name
    : null

  // Redaction: when `viewPII=false`, redactEmployee() already nulled out
  // email/manager/photo/etc, so the rows below render blanks for redacted
  // fields. The `canViewPII` flag also gates whether we show "—" vs the
  // raw string, so a redacted view stays honestly blank.

  const initials = employee.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const handleUnassign = () => {
    unassignEmployee(employee.id)
    close()
  }

  const handleViewProfile = () => {
    if (teamSlug && officeSlug) {
      navigate(`/t/${teamSlug}/o/${officeSlug}/roster?focus=${employee.id}`)
    }
    close()
  }

  return (
    <div
      role="dialog"
      aria-label="Seat details"
      data-testid="seat-detail-popover"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: 280,
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 8,
        boxShadow: '0 8px 20px rgba(0,0,0,0.14)',
        padding: 12,
        zIndex: 30,
        fontSize: 12,
      }}
    >
      {/* Header: avatar + name + title */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        {employee.photoUrl ? (
          <img
            src={employee.photoUrl}
            alt=""
            width={44}
            height={44}
            style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: deptColor,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initials || '?'}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#111827',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {employee.name || '—'}
          </div>
          {employee.title && (
            <div
              style={{
                fontSize: 11,
                color: '#6B7280',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {employee.title}
            </div>
          )}
        </div>
      </div>

      {/* Chips: department + status */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {employee.department && (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 500,
              background: deptColor,
              color: '#fff',
            }}
          >
            {employee.department}
          </span>
        )}
        <span
          data-testid="status-chip"
          className={EMPLOYEE_STATUS_PILL_CLASSES[employee.status]}
          style={{
            padding: '2px 8px',
            borderRadius: 9999,
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          {STATUS_LABEL[employee.status]}
        </span>
      </div>

      {/* Info rows */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '72px 1fr',
          rowGap: 4,
          columnGap: 8,
          marginBottom: 10,
          color: '#374151',
        }}
      >
        <InfoRow label="Team" value={employee.team || '—'} />
        <InfoRow
          label="Manager"
          value={canViewPII ? managerName || '—' : '— (redacted)'}
        />
        <InfoRow
          label="Email"
          value={canViewPII ? employee.email || '—' : '— (redacted)'}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {canEditRoster && (
          <button
            type="button"
            onClick={handleUnassign}
            data-testid="seat-detail-unassign"
            style={buttonStyle('secondary')}
          >
            Unassign
          </button>
        )}
        <button
          type="button"
          onClick={handleViewProfile}
          data-testid="seat-detail-view-profile"
          style={buttonStyle('secondary')}
        >
          View profile
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          data-testid="seat-detail-message"
          style={{ ...buttonStyle('primary'), opacity: 0.5, cursor: 'not-allowed' }}
        >
          Send message
        </button>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div style={{ color: '#9CA3AF', fontSize: 11 }}>{label}</div>
      <div
        style={{
          fontSize: 12,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={value}
      >
        {value}
      </div>
    </>
  )
}

function buttonStyle(kind: 'primary' | 'secondary'): React.CSSProperties {
  if (kind === 'primary') {
    return {
      padding: '4px 10px',
      background: '#2563EB',
      color: '#fff',
      border: 0,
      borderRadius: 4,
      fontSize: 12,
      cursor: 'pointer',
    }
  }
  return {
    padding: '4px 10px',
    background: '#fff',
    color: '#374151',
    border: '1px solid #D1D5DB',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
  }
}
