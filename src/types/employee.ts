/**
 * Orthogonal to seat assignment — a contractor can be `'active'` without a
 * seat, and someone `'on-leave'` may still own one. Persisted payloads
 * predating this field are migrated to `'active'` in `loadAutoSave`.
 */
export type EmployeeStatus = 'active' | 'on-leave' | 'departed'

export const EMPLOYEE_STATUSES: readonly EmployeeStatus[] = [
  'active',
  'on-leave',
  'departed',
] as const

export function isEmployeeStatus(v: unknown): v is EmployeeStatus {
  return typeof v === 'string' && (EMPLOYEE_STATUSES as readonly string[]).includes(v)
}

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
