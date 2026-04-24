import { useEffect, useRef } from 'react'
import { useElementsStore } from '../../stores/elementsStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useProjectStore } from '../../stores/projectStore'
import { useSeatHistoryStore } from '../../stores/seatHistoryStore'
import { useNeighborhoodStore } from '../../stores/neighborhoodStore'
import { useReservationsStore } from '../../stores/reservationsStore'
import { useRoomBookingsStore } from '../../stores/roomBookingsStore'
import { useAnnotationsStore } from '../../stores/annotationsStore'
import { useSeatSwapsStore } from '../../stores/seatSwapsStore'
import { useShareLinksStore } from '../../stores/shareLinksStore'
import { saveOffice, saveOfficeForce } from './officeRepository'

/**
 * Office sync hook — replaces the local-storage `useAutoSave`. It:
 *
 *  1. Debounces save attempts 2s after the last change.
 *  2. Sends an optimistic-lock save (`saveOffice`) keyed on the
 *     `loadedVersion` so concurrent edits surface as conflicts, not
 *     silent overwrites.
 *  3. On conflict, flips `saveState` to `'error'` and parks the attempted
 *     payload in `projectStore.conflict` so the UI can show the
 *     `ConflictModal`.
 *  4. On transient error, retries with exponential-ish backoff up to 30s.
 *
 * Mount-time snapshot suppression mirrors the old hook: the first effect
 * run stashes the current store identities and returns without saving,
 * so rehydrated payloads don't immediately bounce back to Supabase as a
 * fake user edit.
 */

const DEBOUNCE_MS = 2000
const RETRY_DELAYS = [2000, 5000, 15000, 30000]

/**
 * Snapshot every piece of the editor state we serialize into the office
 * payload. Reading from `.getState()` at call time (rather than closing
 * over the hook's selector values) keeps retries and the force-overwrite
 * path fresh: if the user keeps typing during a 15s retry backoff, the
 * retry ships their *current* edits, not the edits that existed when the
 * first attempt was queued.
 */
function buildCurrentPayload(): Record<string, unknown> {
  const elements = useElementsStore.getState().elements
  const { employees, departmentColors } = useEmployeeStore.getState()
  const { floors, activeFloorId } = useFloorStore.getState()
  const settings = useCanvasStore.getState().settings
  // `seatHistory` is append-only and lives under a dedicated top-level
  // key rather than hanging off the elements/employees maps — it's a
  // cross-cutting log, and keeping it separate means legacy payloads
  // without history still round-trip cleanly. Stored as the raw
  // Record<id, entry> so the load path doesn't have to reverse an array.
  const seatHistory = useSeatHistoryStore.getState().entries
  const neighborhoods = useNeighborhoodStore.getState().neighborhoods
  const reservations = useReservationsStore.getState().reservations
  // Room bookings ride alongside reservations — same top-level-array
  // shape for the same reason (per-day log, cross-cuts the element
  // map). Legacy payloads (pre-feature) lack the key; the hydrator
  // normalises missing → [].
  const roomBookings = useRoomBookingsStore.getState().bookings
  // Annotations are kept at the top level (same reasoning as
  // `neighborhoods`) — they carry either a floorId (position-anchored) or
  // only an elementId (element-anchored), and the flat Record shape
  // round-trips cleanly through `migrateAnnotations` on load.
  const annotations = useAnnotationsStore.getState().annotations
  // Seat-swap requests sit alongside reservations / annotations — a
  // top-level `seatSwaps` key whose absence on legacy payloads falls
  // through the hydration path as an empty map.
  const seatSwaps = useSeatSwapsStore.getState().requests
  // D6 view-only share links. Persisted as a top-level Record so they
  // survive reloads and co-editors see each other's tokens + revocations.
  const shareLinks = useShareLinksStore.getState().links
  return {
    version: 2,
    elements,
    employees,
    departmentColors,
    floors,
    activeFloorId,
    settings,
    seatHistory,
    // Top-level `neighborhoods` key (rather than nesting inside floors) —
    // neighborhoods already carry `floorId` and the flat shape round-trips
    // through migration more simply, matching how the element map sits at
    // the top level beside `floors`.
    neighborhoods,
    // Reservations ride alongside neighborhoods as a top-level array. The
    // load path (`ProjectShell`) treats a missing key as `[]`, so this
    // round-trips through older payloads without breaking them.
    reservations,
    roomBookings,
    annotations,
    seatSwaps,
    shareLinks,
  }
}

export function useOfficeSync() {
  const elements = useElementsStore((s) => s.elements)
  const employees = useEmployeeStore((s) => s.employees)
  const departmentColors = useEmployeeStore((s) => s.departmentColors)
  const floors = useFloorStore((s) => s.floors)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const settings = useCanvasStore((s) => s.settings)
  const neighborhoods = useNeighborhoodStore((s) => s.neighborhoods)
  const reservations = useReservationsStore((s) => s.reservations)
  const roomBookings = useRoomBookingsStore((s) => s.bookings)
  const annotations = useAnnotationsStore((s) => s.annotations)
  const seatSwaps = useSeatSwapsStore((s) => s.requests)
  const shareLinks = useShareLinksStore((s) => s.links)

  const seatHistory = useSeatHistoryStore((s) => s.entries)

  const officeId = useProjectStore((s) => s.officeId)
  const loadedVersion = useProjectStore((s) => s.loadedVersion)
  const setLoadedVersion = useProjectStore((s) => s.setLoadedVersion)
  const setSaveState = useProjectStore((s) => s.setSaveState)
  const setLastSavedAt = useProjectStore((s) => s.setLastSavedAt)

  // Snapshot on first run so StrictMode's mount→unmount→remount pass
  // doesn't trigger a spurious save of identity-equal store values.
  const initialSnapshotRef = useRef<unknown>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryIndex = useRef(0)

  useEffect(() => {
    if (!officeId || !loadedVersion) return
    const snapshot = { elements, employees, departmentColors, floors, activeFloorId, settings, seatHistory, neighborhoods, reservations, annotations, seatSwaps, roomBookings, shareLinks }

    if (initialSnapshotRef.current === null) {
      initialSnapshotRef.current = snapshot
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)

    const doSave = async (): Promise<void> => {
      // Re-read `loadedVersion` at save time so a post-save bump (we set
      // it after the previous success) doesn't stale-close the save
      // closure and re-send the already-committed version.
      const currentVersion = useProjectStore.getState().loadedVersion
      const currentOfficeId = useProjectStore.getState().officeId
      if (!currentOfficeId || !currentVersion) return

      setSaveState('saving')
      // Read the latest store contents on every invocation so a retry
      // fired 15s later ships the edits the user made during the wait,
      // not a stale closure from the initial attempt.
      const payload = buildCurrentPayload()
      const res = await saveOffice(currentOfficeId, payload, currentVersion)
      if (res.ok) {
        retryIndex.current = 0
        setLoadedVersion(res.updated_at)
        setLastSavedAt(res.updated_at)
        setSaveState('saved')
        return
      }
      if (res.reason === 'conflict') {
        setSaveState('error')
        useProjectStore.setState({ conflict: { payload } })
        return
      }
      setSaveState('error')
      const delay = RETRY_DELAYS[Math.min(retryIndex.current, RETRY_DELAYS.length - 1)]
      retryIndex.current += 1
      retryTimerRef.current = setTimeout(() => {
        void doSave()
      }, delay)
    }

    debounceRef.current = setTimeout(() => {
      void doSave()
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [
    officeId,
    loadedVersion,
    elements,
    employees,
    departmentColors,
    floors,
    activeFloorId,
    settings,
    seatHistory,
    neighborhoods,
    reservations,
    roomBookings,
    annotations,
    seatSwaps,
    shareLinks,
    setSaveState,
    setLastSavedAt,
    setLoadedVersion,
  ])

  // Cancel any pending retry when the hook unmounts so we don't fire a
  // save against a stale officeId after a route change.
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [])

  /**
   * Force-overwrite the row regardless of `updated_at`. Invoked by the
   * conflict modal's "Overwrite" button, which has already told the user
   * their save will clobber the teammate's version.
   */
  async function overwrite() {
    const state = useProjectStore.getState()
    if (!state.officeId) return
    setSaveState('saving')
    // Same freshness rationale as doSave: if the user kept typing
    // while the conflict modal was open, their latest edits must go in.
    const payload = buildCurrentPayload()
    const res = await saveOfficeForce(state.officeId, payload)
    if (res.ok) {
      setLoadedVersion(res.updated_at)
      setLastSavedAt(res.updated_at)
      setSaveState('saved')
      useProjectStore.setState({ conflict: null })
    } else {
      setSaveState('error')
    }
  }

  return { overwrite }
}
