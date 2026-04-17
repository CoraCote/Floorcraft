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

export interface Employee {
  id: string
  name: string
  email: string
  department: string | null
  team: string | null
  title: string | null
  managerId: string | null
  employmentType: 'full-time' | 'contractor' | 'part-time' | 'intern'
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
