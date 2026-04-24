import { useElementsStore } from '../../stores/elementsStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useProjectStore } from '../../stores/projectStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useFloorStore } from '../../stores/floorStore'
import {
  isEmployeeStatus,
  isAccommodationType,
  LEAVE_TYPES,
  type Accommodation,
  type LeaveType,
  type PendingStatusChange,
} from '../../types/employee'
import { WALL_TYPES, type WallType } from '../../types/elements'
import type { Annotation, AnnotationAnchor } from '../../types/annotations'
import { ANNOTATION_BODY_MAX } from '../../types/annotations'
import {
  isSeatSwapStatus,
  type SeatSwapRequest,
} from '../../types/seatSwaps'

/**
 * Legacy-payload migration helpers.
 *
 * Before Phase 4 introduced Supabase-backed offices, Floocraft autosaved
 * the user's current project to `localStorage` under a single key
 * (`floocraft-autosave`). The autosave loop itself was removed in
 * Phase 6 — it's a dead-end once every office has a server-side row —
 * but the *migration* logic (adapting legacy payloads to current store
 * shapes) lives on because:
 *
 *   1. Supabase-stored office payloads use the same shape as the old
 *      autosave envelope. Any back-fill the old loader had to do also
 *      applies to old offices that were synced to the server before the
 *      field was introduced (e.g. `employees[*].status`).
 *   2. The existing unit tests (`autoSaveSafety`, `wallAutoSave`,
 *      `employeeMigration`) exercise subtle corner-cases — corrupt
 *      JSON, arrays-where-objects-expected, back-filled wall bulges —
 *      that we don't want to lose coverage on.
 *
 * So this module keeps `loadAutoSave` as a pure helper over
 * `localStorage`, exporting it so those tests keep working; `ProjectShell`
 * no longer calls it but may in the future if we decide to offer a
 * "recover from last local autosave" escape hatch for users who lost
 * their account.
 */

const SAVE_KEY = 'floocraft-autosave'

type AutoSavePayload = {
  project: ReturnType<typeof useProjectStore.getState>['currentProject']
  elements: ReturnType<typeof useElementsStore.getState>['elements']
  employees: ReturnType<typeof useEmployeeStore.getState>['employees']
  departmentColors: ReturnType<typeof useEmployeeStore.getState>['departmentColors']
  floors: ReturnType<typeof useFloorStore.getState>['floors']
  activeFloorId: ReturnType<typeof useFloorStore.getState>['activeFloorId']
  settings: ReturnType<typeof useCanvasStore.getState>['settings']
}

/**
 * Migrate a deserialized elements map. Older payloads predate the curved-walls
 * feature and don't have `bulges` or `connectedWallIds` on wall elements.
 * Back-fill these fields so consumers can safely `.some(b => b !== 0)` and
 * `.length === points.length/2 - 1` without first checking for undefined.
 * Unknown properties are preserved — this is a forward-compatible migration.
 */
function migrateElements(
  elements: Record<string, unknown>,
): ReturnType<typeof useElementsStore.getState>['elements'] {
  const out: Record<string, unknown> = {}
  for (const [id, raw] of Object.entries(elements ?? {})) {
    if (!raw || typeof raw !== 'object') continue
    const el = raw as Record<string, unknown>
    if (el.type === 'wall' && Array.isArray(el.points)) {
      const expectedBulges = Math.max(0, el.points.length / 2 - 1)
      const currentBulges = Array.isArray(el.bulges) ? el.bulges : []
      // Pad/trim to exactly the segment count; replace non-finite entries
      // with 0 so arc rendering never hits NaN.
      const bulges: number[] = []
      for (let i = 0; i < expectedBulges; i++) {
        const b = currentBulges[i]
        bulges.push(typeof b === 'number' && Number.isFinite(b) ? b : 0)
      }
      // `wallType` (semantic classification) was introduced after the
      // original wall shape; any legacy payload missing it defaults to
      // 'solid' (drywall) — same pattern as the `bulges` back-fill above.
      // Unknown string values coerce to 'solid' rather than silently
      // propagating, so the renderer's switch is exhaustive.
      const wallType: WallType =
        typeof el.wallType === 'string' &&
        (WALL_TYPES as readonly string[]).includes(el.wallType)
          ? (el.wallType as WallType)
          : 'solid'
      out[id] = {
        ...el,
        bulges,
        connectedWallIds: Array.isArray(el.connectedWallIds)
          ? el.connectedWallIds
          : [],
        wallType,
      }
    } else {
      out[id] = el
    }
  }
  return out as ReturnType<typeof useElementsStore.getState>['elements']
}

function isLeaveType(v: unknown): v is LeaveType {
  return typeof v === 'string' && (LEAVE_TYPES as readonly string[]).includes(v)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

/**
 * Validate a `yyyy-mm-dd` date string. We accept only that format (not
 * full ISO timestamps) because the pending-status queue stores day
 * precision, and Date.parse tolerates too many legacy formats to be a
 * safe gate on user-visible scheduling.
 */
function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = Date.parse(v)
  return !Number.isNaN(t)
}

/**
 * Back-fill and scrub the `pendingStatusChanges` queue on a legacy
 * employee payload. Invalid entries (missing id, bad date, unknown
 * status) are dropped with a `console.warn` — the user gets a clean
 * queue rather than a crash on the next render. Survivors are sorted
 * ascending by `effectiveDate` to match the invariant documented on
 * `Employee`.
 */
function migratePendingStatusChanges(
  raw: unknown,
  employeeId: string,
): PendingStatusChange[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    console.warn(
      `[migrateEmployees] pendingStatusChanges on ${employeeId} is not an array; dropping`,
    )
    return []
  }
  const out: PendingStatusChange[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      console.warn(
        `[migrateEmployees] invalid pendingStatusChange entry on ${employeeId}; dropping`,
      )
      continue
    }
    const e = entry as Record<string, unknown>
    if (!isNonEmptyString(e.id)) {
      console.warn(
        `[migrateEmployees] pendingStatusChange missing id on ${employeeId}; dropping`,
      )
      continue
    }
    if (!isIsoDate(e.effectiveDate)) {
      console.warn(
        `[migrateEmployees] pendingStatusChange on ${employeeId} has invalid effectiveDate ${String(e.effectiveDate)}; dropping`,
      )
      continue
    }
    if (!isEmployeeStatus(e.status)) {
      console.warn(
        `[migrateEmployees] pendingStatusChange on ${employeeId} has unknown status ${String(e.status)}; dropping`,
      )
      continue
    }
    out.push({
      id: e.id,
      status: e.status,
      effectiveDate: e.effectiveDate,
      note: isNonEmptyString(e.note) ? e.note : null,
      createdAt: isNonEmptyString(e.createdAt) ? e.createdAt : new Date(0).toISOString(),
    })
  }
  out.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
  return out
}

/**
 * Migrate a deserialized employees map. Older payloads predate the
 * `status` field; back-fill to `'active'` (and coerce any invalid value
 * to `'active'` too) so consumers can trust the enum unconditionally.
 *
 * Phase 4 added five lifecycle fields (`leaveType`, `expectedReturnDate`,
 * `coverageEmployeeId`, `leaveNotes`, `departureDate`) — back-fill each
 * to `null` when absent or invalid so downstream UI can rely on the
 * shape. `leaveType` is validated against the `LEAVE_TYPES` enum; the
 * date/id/notes fields accept any non-empty string.
 */
/**
 * Coerce a single unknown value to an `Accommodation` or drop it. An entry
 * must have a non-empty string `id`, a known `type`, and (optionally) a
 * string `notes`. Anything else is discarded with a console.warn so an
 * inbound corrupted payload surfaces during devtools-triage rather than
 * silently stripping data.
 */
function coerceAccommodation(raw: unknown): Accommodation | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  if (!isNonEmptyString(a.id)) {
    console.warn('[accommodation migration] dropping entry with missing id', a)
    return null
  }
  if (!isAccommodationType(a.type)) {
    console.warn(
      `[accommodation migration] dropping entry with unknown type "${String(a.type)}"`,
      a,
    )
    return null
  }
  return {
    id: a.id,
    type: a.type,
    notes: isNonEmptyString(a.notes) ? a.notes : null,
    createdAt: isNonEmptyString(a.createdAt) ? a.createdAt : new Date(0).toISOString(),
  }
}

function migrateAccommodations(raw: unknown): Accommodation[] {
  if (!Array.isArray(raw)) return []
  const out: Accommodation[] = []
  for (const entry of raw) {
    const coerced = coerceAccommodation(entry)
    if (coerced) out.push(coerced)
  }
  return out
}

/**
 * Back-fill `sensitivityTags` for legacy payloads. The field was
 * introduced alongside the adjacency-conflict analyzer. We accept any
 * array of non-empty strings and drop everything else (including raw
 * strings and malformed entries). `null` / `undefined` / non-arrays
 * default to `[]` so `.includes(...)` / `.some(...)` is always safe.
 */
function migrateSensitivityTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const entry of raw) {
    if (isNonEmptyString(entry)) out.push(entry)
  }
  return out
}

export function migrateEmployees(
  employees: Record<string, unknown>,
): ReturnType<typeof useEmployeeStore.getState>['employees'] {
  const out: Record<string, unknown> = {}
  for (const [id, raw] of Object.entries(employees ?? {})) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    out[id] = {
      ...e,
      status: isEmployeeStatus(e.status) ? e.status : 'active',
      leaveType: isLeaveType(e.leaveType) ? e.leaveType : null,
      expectedReturnDate: isNonEmptyString(e.expectedReturnDate)
        ? e.expectedReturnDate
        : null,
      coverageEmployeeId: isNonEmptyString(e.coverageEmployeeId)
        ? e.coverageEmployeeId
        : null,
      leaveNotes: isNonEmptyString(e.leaveNotes) ? e.leaveNotes : null,
      departureDate: isNonEmptyString(e.departureDate) ? e.departureDate : null,
      accommodations: migrateAccommodations(e.accommodations),
      sensitivityTags: migrateSensitivityTags(e.sensitivityTags),
      pendingStatusChanges: migratePendingStatusChanges(
        e.pendingStatusChanges,
        id,
      ),
    }
  }
  return out as ReturnType<typeof useEmployeeStore.getState>['employees']
}

/**
 * Migrate a deserialized annotations map. Legacy payloads predate the
 * annotations feature and simply omit the `annotations` key; callers fall
 * back to `{}` before invoking this helper. Entries that don't match the
 * expected shape (missing id, bad anchor discriminant, non-string body)
 * are dropped with a `console.warn` rather than crashing the editor.
 *
 * The migration is defensive by design: a partially-saved or hand-crafted
 * payload should load as a clean (possibly empty) annotations map, never
 * as a crashed app.
 */
export function migrateAnnotations(
  raw: unknown,
): Record<string, Annotation> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, Annotation> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const a = value as Record<string, unknown>
    if (!isNonEmptyString(a.id)) {
      console.warn('[annotation migration] dropping entry with missing id', a)
      continue
    }
    if (typeof a.body !== 'string') {
      console.warn(`[annotation migration] dropping ${a.id}: non-string body`)
      continue
    }
    const rawAnchor = a.anchor as Record<string, unknown> | null | undefined
    if (!rawAnchor || typeof rawAnchor !== 'object') {
      console.warn(`[annotation migration] dropping ${a.id}: missing anchor`)
      continue
    }
    let anchor: AnnotationAnchor | null = null
    if (rawAnchor.type === 'element' && isNonEmptyString(rawAnchor.elementId)) {
      anchor = { type: 'element', elementId: rawAnchor.elementId }
    } else if (
      rawAnchor.type === 'floor-position' &&
      isNonEmptyString(rawAnchor.floorId) &&
      typeof rawAnchor.x === 'number' &&
      typeof rawAnchor.y === 'number' &&
      Number.isFinite(rawAnchor.x) &&
      Number.isFinite(rawAnchor.y)
    ) {
      anchor = {
        type: 'floor-position',
        floorId: rawAnchor.floorId,
        x: rawAnchor.x,
        y: rawAnchor.y,
      }
    }
    if (!anchor) {
      console.warn(`[annotation migration] dropping ${a.id}: invalid anchor`)
      continue
    }
    const body = a.body.slice(0, ANNOTATION_BODY_MAX)
    out[id] = {
      id: a.id,
      body,
      authorName: isNonEmptyString(a.authorName) ? a.authorName : 'Unknown',
      createdAt: isNonEmptyString(a.createdAt)
        ? a.createdAt
        : new Date(0).toISOString(),
      resolvedAt: isNonEmptyString(a.resolvedAt) ? a.resolvedAt : null,
      anchor,
    }
  }
  return out
}

/**
 * Coerce the top-level `seatSwaps` payload slot into a `Record<id,
 * SeatSwapRequest>`. Legacy payloads predate the feature and will have
 * `undefined` (or legacy array/null shapes) — fall back to `{}` in any
 * case that isn't a well-formed object. Entries missing required
 * fields are dropped with a `console.warn`.
 */
export function migrateSeatSwaps(
  raw: unknown,
): Record<string, SeatSwapRequest> {
  if (!raw || typeof raw !== 'object') return {}
  // Legacy snapshot from an earlier task shape might have stored an array
  // rather than a Record. Normalise both paths through the same loop.
  const entries: unknown[] = Array.isArray(raw)
    ? raw
    : Object.values(raw as Record<string, unknown>)
  const out: Record<string, SeatSwapRequest> = {}
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (!isNonEmptyString(e.id)) {
      console.warn('[seatSwap migration] dropping entry with missing id', e)
      continue
    }
    if (!isNonEmptyString(e.requesterId) || !isNonEmptyString(e.targetEmployeeId)) {
      console.warn(`[seatSwap migration] dropping ${e.id}: missing party ids`)
      continue
    }
    if (!isNonEmptyString(e.requesterSeatId) || !isNonEmptyString(e.targetSeatId)) {
      console.warn(`[seatSwap migration] dropping ${e.id}: missing seat ids`)
      continue
    }
    if (!isSeatSwapStatus(e.status)) {
      console.warn(`[seatSwap migration] dropping ${e.id}: invalid status`)
      continue
    }
    out[e.id] = {
      id: e.id,
      requesterId: e.requesterId,
      requesterSeatId: e.requesterSeatId,
      targetEmployeeId: e.targetEmployeeId,
      targetSeatId: e.targetSeatId,
      status: e.status,
      reason: typeof e.reason === 'string' ? e.reason : '',
      createdAt: isNonEmptyString(e.createdAt) ? e.createdAt : new Date(0).toISOString(),
      resolvedAt: isNonEmptyString(e.resolvedAt) ? e.resolvedAt : null,
      resolvedBy: isNonEmptyString(e.resolvedBy) ? e.resolvedBy : null,
    }
  }
  return out
}

/**
 * Shape-validate a deserialized autosave payload. We don't run a full schema
 * (overkill for a local-storage autosave), but we reject payloads where
 * required top-level fields are the wrong type — better to start a new
 * project than to load a half-broken one and crash the renderer.
 */
function isValidPayload(value: unknown): value is Partial<AutoSavePayload> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  // `elements` and `employees` are Records keyed by id. Arrays and
  // non-objects get coerced to `{}` in the loader below — we DON'T reject
  // the whole payload over a malformed sub-field, because discarding the
  // user's entire save to punish a legacy/empty `employees: []` would be
  // far worse than silently normalising it. Only reject if the type is
  // genuinely unusable (e.g. `elements: "oops"`).
  if (v.elements && typeof v.elements !== 'object') return false
  if (v.employees && typeof v.employees !== 'object') return false
  if (v.floors && !Array.isArray(v.floors)) return false
  return true
}

/** Normalise a field that must be a Record. Arrays/non-objects → `{}`. */
function ensureRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function loadAutoSave(): AutoSavePayload | null {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isValidPayload(parsed)) return null
  // Apply element migrations before returning, so callers never have to
  // think about legacy payload shapes. `ensureRecord` coerces arrays into
  // `{}` so downstream `Object.entries` never sees numeric array keys
  // (which would otherwise produce phantom element ids like `"0"`, `"1"`).
  //
  // Important: only populate each field when it was *present* in the raw
  // payload. Synthesising `employees: {}` for a payload that legitimately
  // omitted the field (very early autosaves, or hand-crafted fixtures)
  // would stomp on whatever the consumer has already seeded — leaving
  // `undefined` to mean "leave the store alone".
  const payload = parsed as AutoSavePayload
  const rawObj = parsed as Record<string, unknown>
  if (rawObj.elements !== undefined) {
    payload.elements = migrateElements(ensureRecord(rawObj.elements))
  }
  if (rawObj.employees !== undefined) {
    payload.employees = migrateEmployees(ensureRecord(rawObj.employees))
  }
  return payload
}
