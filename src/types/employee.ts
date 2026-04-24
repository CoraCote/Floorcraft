import {
  Accessibility,
  Volume2,
  DoorOpen,
  Armchair,
  Monitor,
  Sun,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

/**
 * Workplace-accommodation catalogue. These are ADA / dignity-of-work
 * factors that constrain which seats are eligible for which employees
 * (e.g. a wheelchair user can't be routed past a 24"-wide aisle, and a
 * quiet-zone accommodation rules out seats in the bullpen). Kept as a
 * closed union so the UI picker, the analyzer, and the badge-renderer
 * all agree on the vocabulary.
 */
export type AccommodationType =
  | 'wheelchair-access'
  | 'quiet-zone'
  | 'proximity-to-exit'
  | 'ergonomic-chair'
  | 'standing-desk'
  | 'natural-light'
  | 'other'

export const ACCOMMODATION_TYPES: readonly AccommodationType[] = [
  'wheelchair-access',
  'quiet-zone',
  'proximity-to-exit',
  'ergonomic-chair',
  'standing-desk',
  'natural-light',
  'other',
] as const

export function isAccommodationType(v: unknown): v is AccommodationType {
  return (
    typeof v === 'string' &&
    (ACCOMMODATION_TYPES as readonly string[]).includes(v)
  )
}

/**
 * Human-readable labels for each accommodation type. Exported so the
 * roster drawer chip and the analyzer narrative share the same wording.
 */
export const ACCOMMODATION_LABELS: Record<AccommodationType, string> = {
  'wheelchair-access': 'Wheelchair access',
  'quiet-zone': 'Quiet zone',
  'proximity-to-exit': 'Near exit',
  'ergonomic-chair': 'Ergonomic chair',
  'standing-desk': 'Standing desk',
  'natural-light': 'Natural light',
  other: 'Other',
}

/**
 * Lucide icon mapping — used by both the drawer chip and (Unicode-free
 * fallback aside) any HTML-surface that wants to render an accommodation.
 * The Konva seat badge intentionally uses a simpler Text glyph instead
 * because wiring lucide SVGs into the canvas layer is painful.
 */
export const ACCOMMODATION_ICONS: Record<AccommodationType, LucideIcon> = {
  'wheelchair-access': Accessibility,
  'quiet-zone': Volume2,
  'proximity-to-exit': DoorOpen,
  'ergonomic-chair': Armchair,
  'standing-desk': Monitor,
  'natural-light': Sun,
  other: Sparkles,
}

export interface Accommodation {
  id: string // uuid / nanoid
  type: AccommodationType
  notes: string | null // free-form detail, kept short
  createdAt: string // ISO
}

/**
 * Orthogonal to seat assignment — a contractor can be `'active'` without a
 * seat, and someone `'on-leave'` may still own one. Persisted payloads
 * predating this field are migrated to `'active'` in `loadAutoSave`. Any
 * value outside `EMPLOYEE_STATUSES` is coerced to `'active'` so consumers
 * can trust the union unconditionally.
 */
export type EmployeeStatus =
  | 'active'
  | 'on-leave'
  | 'departed'
  | 'parental-leave'
  | 'sabbatical'
  | 'contractor'
  | 'intern'

export const EMPLOYEE_STATUSES: readonly EmployeeStatus[] = [
  'active',
  'on-leave',
  'parental-leave',
  'sabbatical',
  'contractor',
  'intern',
  'departed',
] as const

export function isEmployeeStatus(v: unknown): v is EmployeeStatus {
  return typeof v === 'string' && (EMPLOYEE_STATUSES as readonly string[]).includes(v)
}

/**
 * Tailwind pill classes for each status — shared by the roster table, card
 * view, and the detail drawer so the same status always reads the same
 * colour. Tuned to stay legible on both white (drawer) and the faintly
 * tinted `bg-gray-50/60` roster rows.
 */
export const EMPLOYEE_STATUS_PILL_CLASSES: Record<EmployeeStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  'on-leave': 'bg-amber-100 text-amber-700',
  departed: 'bg-gray-100 text-gray-500',
  'parental-leave': 'bg-amber-50 text-amber-800',
  sabbatical: 'bg-indigo-100 text-indigo-700',
  contractor: 'bg-teal-100 text-teal-700',
  intern: 'bg-slate-100 text-slate-700',
}

export type LeaveType = 'parental' | 'medical' | 'sabbatical' | 'other'

export const LEAVE_TYPES: readonly LeaveType[] = [
  'parental',
  'medical',
  'sabbatical',
  'other',
] as const

/**
 * Employment categories. Kept in a single exported const so UI that renders
 * a picker (e.g. `RosterDetailDrawer`) iterates the same source of truth as
 * the `Employee['employmentType']` type — adding a new value here is caught
 * by the compiler everywhere the union is referenced.
 */
export const EMPLOYMENT_TYPES = [
  'full-time',
  'contractor',
  'part-time',
  'intern',
] as const
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]

/**
 * A forward-dated status change queued on an employee. The auto-commit
 * routine (`src/lib/commitDueStatusChanges.ts`) applies entries whose
 * `effectiveDate` has arrived and drops them from the queue; the list is
 * kept sorted ascending by `effectiveDate` so consumers can peek at the
 * next-due entry without re-sorting.
 */
export interface PendingStatusChange {
  id: string
  status: EmployeeStatus
  /** ISO date, `yyyy-mm-dd` — day precision is enough. */
  effectiveDate: string
  /** Optional reason, e.g. "parental leave". */
  note: string | null
  /** ISO timestamp of when this plan was made. */
  createdAt: string
}

export interface Employee {
  id: string
  name: string
  email: string
  department: string | null
  team: string | null
  title: string | null
  managerId: string | null
  employmentType: EmploymentType
  status: EmployeeStatus
  officeDays: string[]
  startDate: string | null
  endDate: string | null
  // Leave metadata (populated when status = 'on-leave'; always optional).
  leaveType: LeaveType | null
  expectedReturnDate: string | null
  coverageEmployeeId: string | null
  leaveNotes: string | null
  // Scheduled departure — independent of status.
  departureDate: string | null
  equipmentNeeds: string[]
  equipmentStatus: 'pending' | 'provisioned' | 'not-needed'
  photoUrl: string | null
  tags: string[]
  /**
   * Workplace accommodations (ADA + dignity-of-work). Always an array —
   * legacy payloads missing the field are back-filled to `[]` by
   * `migrateEmployees`, so consumers can `.some(...)` / `.length` without
   * first nulling-out.
   */
  accommodations: Accommodation[]
  /**
   * Free-text sensitivity tags used by the adjacency conflict analyzer —
   * e.g. `"audit"`, `"legal"`, `"compensation"`, `"insider-risk"`,
   * `"founder"`. Any pair of adjacent employees sharing a tag trips a
   * `category: 'sensitivity'` warning in the Insights Panel.
   *
   * Invariant: always an array (default `[]`). Legacy payloads missing
   * the field are back-filled by `migrateEmployees`. We deliberately do
   * NOT enumerate the vocabulary — the signal is user-supplied, and any
   * closed enum would rot as policies evolve.
   */
  sensitivityTags: string[]
  seatId: string | null
  floorId: string | null
  /**
   * Forward-dated status transitions that will auto-commit once their
   * `effectiveDate` arrives. NEVER undefined (default `[]`); always
   * sorted ascending by `effectiveDate`.
   */
  pendingStatusChanges: PendingStatusChange[]
  createdAt: string
}

export interface EmployeeImportRow {
  name: string
  email?: string
  department?: string
  team?: string
  title?: string
  manager?: string
  type?: string
  status?: string
  office_days?: string
  start_date?: string
  end_date?: string
  equipment_needs?: string
  equipment_status?: string
  photo_url?: string
  tags?: string
  [key: string]: string | undefined
}
