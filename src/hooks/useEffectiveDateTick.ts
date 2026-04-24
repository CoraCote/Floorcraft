import { useEffect } from 'react'
import { useEmployeeStore } from '../stores/employeeStore'
import { commitDueStatusChanges } from '../lib/commitDueStatusChanges'
import { todayIsoDate } from '../lib/time'

/**
 * Apply any effective-dated status changes that come due while the
 * session is open.
 *
 * Strategy: compute ms-until-local-midnight, `setTimeout` one check, and
 * re-schedule after it runs. Cheap (one timer, no polling), survives
 * sleep/wake because `Date.now()` reads the wall clock each time, and
 * guarantees we never fire more than ~24 hours out of sync with the
 * user's calendar. We also run once on mount so a project that was
 * loaded just before midnight and left open catches the rollover.
 *
 * Deliberately minimal — no Web Worker, no service-worker alarm.
 * Transitions land via `updateEmployee` per changed employee so the
 * existing autosave debounce picks them up just like any other edit,
 * and the audit stream emits the usual `employee.update` event.
 */
export function useEffectiveDateTick(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    function runAndReschedule() {
      const state = useEmployeeStore.getState()
      const { transitions, nextEmployees } = commitDueStatusChanges(
        state.employees,
        todayIsoDate(),
      )
      if (transitions.length > 0) {
        // `updateEmployee` emits audit events and respects the autosave
        // pipeline. Iterating per-employee is fine — the commit routine
        // has already collapsed multi-change queues to a single final
        // status per person, so we pay one update per person.
        for (const [id, emp] of Object.entries(nextEmployees)) {
          const prev = state.employees[id]
          if (!prev) continue
          if (
            prev.status !== emp.status ||
            prev.pendingStatusChanges !== emp.pendingStatusChanges
          ) {
            state.updateEmployee(id, {
              status: emp.status,
              pendingStatusChanges: emp.pendingStatusChanges,
            })
          }
        }
      } else {
        // Even with no status transitions, the routine may have trimmed
        // no-op pending entries (effectiveDate reached, same status).
        // Flush those quietly so they don't keep re-triggering.
        for (const [id, emp] of Object.entries(nextEmployees)) {
          const prev = state.employees[id]
          if (prev && prev.pendingStatusChanges !== emp.pendingStatusChanges) {
            state.updateEmployee(id, {
              pendingStatusChanges: emp.pendingStatusChanges,
            })
          }
        }
      }
      scheduleNext()
    }

    function scheduleNext() {
      const now = new Date()
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        5, // 5-second buffer past midnight so the date string has definitely flipped
      )
      const delay = Math.max(1000, nextMidnight.getTime() - now.getTime())
      timer = setTimeout(runAndReschedule, delay)
    }

    runAndReschedule()
    return () => {
      if (timer !== null) clearTimeout(timer)
    }
  }, [])
}
