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
} from '../../types/employee'
import { WALL_TYPES, type WallType } from '../../types/elements'

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

function migrateEmployees(
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
    }
  }
  return out as ReturnType<typeof useEmployeeStore.getState>['employees']
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
