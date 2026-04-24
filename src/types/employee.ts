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
  seatId: string | null
  floorId: string | null
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
