export interface Employee {
  id: string
  name: string
  email: string
  department: string | null
  team: string | null
  title: string | null
  managerId: string | null
  employmentType: 'full-time' | 'contractor' | 'part-time' | 'intern'
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
  office_days?: string
  start_date?: string
  tags?: string
  [key: string]: string | undefined
}
