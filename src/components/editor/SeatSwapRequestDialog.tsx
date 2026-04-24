import { useEffect, useMemo, useRef, useState } from 'react'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useSeatSwapsStore } from '../../stores/seatSwapsStore'
import { useToastStore } from '../../stores/toastStore'
import { useUIStore } from '../../stores/uiStore'
import { Button, Modal, ModalBody, ModalFooter } from '../ui'

/**
 * Modal for an employee to open a swap request. The caller seeds
 * `requesterId` (typically the logged-in user, but flexible so the roster
 * row "Request swap" action can open it on behalf of the selected row
 * when an admin is preparing a swap). The target is chosen via an
 * autocomplete scoped to assigned employees only — you can't swap with
 * someone who isn't sitting anywhere.
 *
 * On submit: delegates to `useSeatSwapsStore.create`, which is also the
 * place where "requester not seated" / "same employee" guards live. A
 * failed create surfaces as a toast so the user sees why.
 */
export function SeatSwapRequestDialog({
  requesterId,
  onClose,
}: {
  requesterId: string
  onClose: () => void
}) {
  const employees = useEmployeeStore((s) => s.employees)
  const create = useSeatSwapsStore((s) => s.create)
  const pushToast = useToastStore((s) => s.push)
  const registerModalOpen = useUIStore((s) => s.registerModalOpen)
  const registerModalClose = useUIStore((s) => s.registerModalClose)

  const [query, setQuery] = useState('')
  const [targetId, setTargetId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    registerModalOpen()
    return () => registerModalClose()
  }, [registerModalOpen, registerModalClose])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Assigned employees only, excluding the requester. This is the
  // autocomplete source-of-truth — the create() call in the store
  // double-checks, but a picker that silently offered unseated people
  // would be confusing.
  const assignedEmployees = useMemo(() => {
    return Object.values(employees).filter(
      (e) => Boolean(e.seatId) && e.id !== requesterId,
    )
  }, [employees, requesterId])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length === 0) return assignedEmployees.slice(0, 8)
    return assignedEmployees
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.email && e.email.toLowerCase().includes(q)),
      )
      .slice(0, 8)
  }, [assignedEmployees, query])

  const selected = targetId ? employees[targetId] ?? null : null
  const requester = employees[requesterId] ?? null

  const handleSubmit = () => {
    if (!targetId) {
      pushToast({ tone: 'error', title: 'Pick someone to swap with.' })
      return
    }
    const result = create(requesterId, targetId, reason.trim())
    if (!result.ok) {
      const msg = mapError(result.error)
      pushToast({ tone: 'error', title: msg })
      return
    }
    pushToast({ tone: 'success', title: 'Swap request submitted.' })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Request seat swap">
      <ModalBody className="space-y-3 text-sm">
        <p className="text-xs text-gray-500">
          {requester
            ? `You're requesting on behalf of ${requester.name}. A manager will review the request.`
            : 'A manager will review the request.'}
        </p>

        <label className="block">
          <span className="text-xs font-medium text-gray-700">
            Swap with
          </span>
          <input
            ref={inputRef}
            type="text"
            value={selected ? selected.name : query}
            onChange={(e) => {
              setQuery(e.target.value)
              setTargetId(null)
            }}
            placeholder="Type a name or email…"
            className="mt-1 w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Target employee"
          />
          {!selected && query.length > 0 && suggestions.length === 0 && (
            <div className="mt-1 text-[11px] text-gray-500">
              No assigned employees match.
            </div>
          )}
          {!selected && suggestions.length > 0 && (
            <ul
              className="mt-1 border border-gray-200 rounded bg-white divide-y divide-gray-100 max-h-40 overflow-y-auto"
              role="listbox"
            >
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetId(s.id)
                      setQuery('')
                    }}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50"
                    role="option"
                    aria-selected="false"
                  >
                    <span className="font-medium text-gray-800">{s.name}</span>
                    {s.seatId && (
                      <span className="ml-2 text-gray-400">({s.seatId})</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-700">
            Reason (optional)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why do you want to swap?"
            className="mt-1 w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={handleSubmit}
          disabled={!targetId}
        >
          Submit request
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function mapError(code: string): string {
  switch (code) {
    case 'requester-unseated':
      return 'You need a seat before you can request a swap.'
    case 'target-unseated':
      return 'That person isn\u2019t assigned to a seat.'
    case 'target-not-found':
      return 'That person was not found.'
    case 'same-employee':
      return 'You can\u2019t swap with yourself.'
    default:
      return 'Could not submit swap request.'
  }
}
