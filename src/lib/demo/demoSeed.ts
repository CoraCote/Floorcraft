/**
 * Seed data for the "demo office" quick-start. Deliberately chosen to
 * exercise the features HR/office-ops care about — not just populate
 * rows:
 *
 *   - 4 departments × 1 manager each, plus 3-5 reports per manager, so
 *     the Manager dropdown has real options and the cascade on delete
 *     has something to cascade.
 *   - Statuses mixed: mostly `active`, two `on-leave`, one `departed`
 *     who STILL HOLDS A SEAT so flipping anyone's status to `departed`
 *     isn't the only way to surface the unassign prompt.
 *   - One deliberate duplicate `name+department` pair (Alice Kim, Eng)
 *     to exercise the "rehire?" badge.
 *   - Two people with `endDate` ~20-25 days out so the "Ending soon"
 *     stats chip has a non-zero count.
 *   - Two with `equipmentStatus: 'pending'` so the Pending-equipment
 *     chip renders.
 *   - Office-days patterns cover Weekdays / MWF / TTh / Hybrid / Remote
 *     so the preset buttons in the drawer match real rows.
 *
 * Shape: inputs to `addEmployees` — no `id` / `createdAt` yet. The
 * builder assigns those. `managerKey` is a seed-local name we resolve
 * to a real `managerId` after ids exist; `seatIndex` tells the builder
 * which desk position (by creation order) to assign.
 */

export interface DemoEmployeeSeed {
  /** Local key used to resolve `managerKey` cross-references. */
  key: string
  name: string
  email: string
  department: string
  title: string | null
  /** Points at another seed's `key`. `null` for the manager row itself. */
  managerKey: string | null
  employmentType: 'full-time' | 'contractor' | 'part-time' | 'intern'
  status: 'active' | 'on-leave' | 'departed'
  officeDays: string[]
  /** ISO date for Hired / End-of-contract, or null. */
  startDate: string | null
  endDate: string | null
  equipmentNeeds: string[]
  equipmentStatus: 'pending' | 'provisioned' | 'not-needed'
  /**
   * Desk slot to park this person in. `null` = leave unassigned.
   * The builder walks desks in template order and looks up the N-th.
   * A departed person with a seat is intentional (cascade demo).
   */
  seatIndex: number | null
}

/**
 * Build ISO dates relative to "now" so the "Ending soon" chip surfaces
 * regardless of when the demo is spun up. Uses midnight UTC so tests
 * that assert on string prefixes don't flake across time zones.
 */
function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const OFFICE_DAYS = {
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  mwf: ['Mon', 'Wed', 'Fri'],
  tth: ['Tue', 'Thu'],
  hybrid: ['Tue', 'Wed', 'Thu'],
  remote: [],
} as const

export const DEMO_DEPARTMENT_COLORS: Record<string, string> = {
  Engineering: '#3B82F6', // blue
  Sales: '#EF4444',       // red
  Design: '#8B5CF6',      // violet
  Operations: '#10B981',  // emerald
}

export const DEMO_EMPLOYEES: DemoEmployeeSeed[] = [
  // === Engineering (1 manager + 5 reports, one duplicate name+dept) ===
  {
    key: 'mia',
    name: 'Mia Chen',
    email: 'mia.chen@demo.com',
    department: 'Engineering',
    title: 'Engineering Manager',
    managerKey: null,
    employmentType: 'full-time',
    status: 'active',
    officeDays: [...OFFICE_DAYS.weekdays],
    startDate: '2021-06-14',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 0,
  },
  {
    key: 'alice',
    name: 'Alice Kim',
    email: 'alice.kim@demo.com',
    department: 'Engineering',
    title: 'Senior Engineer',
    managerKey: 'mia',
    employmentType: 'full-time',
    status: 'active',
    officeDays: [...OFFICE_DAYS.mwf],
    startDate: '2022-03-01',
    endDate: null,
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: 1,
  },
  {
    key: 'bob',
    name: 'Bob Patel',
    email: 'bob.patel@demo.com',
    department: 'Engineering',
    title: 'Software Engineer',
    managerKey: 'mia',
    employmentType: 'full-time',
    status: 'active',
    officeDays: [...OFFICE_DAYS.weekdays],
    startDate: '2023-09-11',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor', 'dock'],
    // Pending — exercises the "Pending equipment" chip.
    equipmentStatus: 'pending',
    seatIndex: 2,
  },
  {
    key: 'charlie',
    name: 'Charlie Rivera',
    email: 'charlie.rivera@demo.com',
    department: 'Engineering',
    title: 'Staff Engineer',
    managerKey: 'mia',
    employmentType: 'full-time',
    // On leave — stats chip 'On leave' lights up.
    status: 'on-leave',
    officeDays: [...OFFICE_DAYS.hybrid],
    startDate: '2020-11-02',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 3,
  },
  {
    key: 'dana',
    name: 'Dana Lee',
    email: 'dana.lee@demo.com',
    department: 'Engineering',
    title: 'Contract Engineer',
    managerKey: 'mia',
    employmentType: 'contractor',
    status: 'active',
    officeDays: [...OFFICE_DAYS.remote],
    startDate: '2024-11-15',
    // Contract ends in ~20 days — exercises "Ending soon" chip.
    endDate: isoDaysFromNow(20),
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: null, // remote — no desk
  },
  {
    key: 'alice2',
    // Intentional duplicate — same display name + department as 'alice'.
    // Exercises the amber "rehire?" badge on the row.
    name: 'Alice Kim',
    email: 'alice.kim2@demo.com',
    department: 'Engineering',
    title: 'Junior Engineer',
    managerKey: 'mia',
    employmentType: 'full-time',
    status: 'active',
    officeDays: [...OFFICE_DAYS.tth],
    startDate: '2025-02-03',
    endDate: null,
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'pending',
    seatIndex: 4,
  },

  // === Sales (1 manager + 4 reports; one departed but still seated) ===
  {
    key: 'sam',
    name: 'Sam Torres',
    email: 'sam.torres@demo.com',
    department: 'Sales',
    title: 'Sales Manager',
    managerKey: null,
    employmentType: 'full-time',
    status: 'active',
    officeDays: [...OFFICE_DAYS.weekdays],
    startDate: '2019-04-22',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 5,
  },
  {
    key: 'elena',
    name: 'Elena Diaz',
    email: 'elena.diaz@demo.com',
    department: 'Sales',
    title: 'Account Executive',
    managerKey: 'sam',
    employmentType: 'full-time',
    status: 'active',
    officeDays: [...OFFICE_DAYS.weekdays],
    startDate: '2022-08-10',
    endDate: null,
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: 6,
  },
  {
    key: 'felix',
    name: 'Felix Ng',
    email: 'felix.ng@demo.com',
    department: 'Sales',
    title: 'Sales Development Rep',
    managerKey: 'sam',
    employmentType: 'full-time',
    status: 'active',
    officeDays: [...OFFICE_DAYS.mwf],
    startDate: '2024-07-19',
    endDate: null,
    equipmentNeeds: ['laptop', 'headset'],
    equipmentStatus: 'pending',
    seatIndex: 7,
  },
  {
    key: 'grace',
    name: 'Grace Park',
    email: 'grace.park@demo.com',
    department: 'Sales',
    title: 'Account Executive',
    managerKey: 'sam',
    employmentType: 'full-time',
    // Departed — but still seated. The whole point of the status-cascade
    // fix. Toggling her status back to anything else or re-running the
    // cascade unassigns the seat.
    status: 'departed',
    officeDays: [...OFFICE_DAYS.weekdays],
    startDate: '2021-02-01',
    endDate: isoDaysFromNow(-14),
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'not-needed',
    seatIndex: 8,
  },
  {
    key: 'harry',
    name: 'Harry Singh',
    email: 'harry.singh@demo.com',
    department: 'Sales',
    title: 'Account Executive',
    managerKey: 'sam',
    employmentType: 'full-time',
    status: 'on-leave',
    officeDays: [...OFFICE_DAYS.weekdays],
    startDate: '2020-07-07',
    endDate: null,
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: 9,
  },

  // === Design (1 lead + 3 reports; one intern ending soon) ===
  {
    key: 'kenji',
    name: 'Kenji Tanaka',
    email: 'kenji.tanaka@demo.com',
    department: 'Design',
    title: 'Design Lead',
    managerKey: null,
    employmentType: 'full-time',
    status: 'active',
    officeDays: [...OFFICE_DAYS.weekdays],
    startDate: '2020-01-13',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor', 'tablet'],
    equipmentStatus: 'provisioned',
    seatIndex: 10,
  },
  {
    key: 'ivy',
    name: 'Ivy Ross',
    email: 'ivy.ross@demo.com',
    department: 'Design',
    title: 'Product Designer',
    managerKey: 'kenji',
    employmentType: 'full-time',
    status: 'active',
    officeDays: [...OFFICE_DAYS.hybrid],
    startDate: '2023-01-09',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 11,
  },
  {
    key: 'jamie',
    name: 'Jamie Walker',
    email: 'jamie.walker@demo.com',
    department: 'Design',
    title: 'Visual Designer',
    managerKey: 'kenji',
    employmentType: 'full-time',
    status: 'active',
    officeDays: [...OFFICE_DAYS.mwf],
    startDate: '2023-10-04',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 12,
  },
  {
    key: 'luna',
    name: 'Luna Vasquez',
    email: 'luna.vasquez@demo.com',
    department: 'Design',
    title: 'Design Intern',
    managerKey: 'kenji',
    employmentType: 'intern',
    status: 'active',
    officeDays: [...OFFICE_DAYS.tth],
    startDate: '2026-01-27',
    // Internship ends in ~25 days — second "Ending soon" entry.
    endDate: isoDaysFromNow(25),
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: 13,
  },

  // === Operations (1 manager + 3 reports; mixed employment types) ===
  {
    key: 'priya',
    name: 'Priya Shah',
    email: 'priya.shah@demo.com',
    department: 'Operations',
    title: 'Operations Manager',
    managerKey: null,
    employmentType: 'full-time',
    status: 'active',
    officeDays: [...OFFICE_DAYS.weekdays],
    startDate: '2019-09-30',
    endDate: null,
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: 14,
  },
  {
    key: 'nate',
    name: 'Nate Rivera',
    email: 'nate.rivera@demo.com',
    department: 'Operations',
    title: 'Facilities Contractor',
    managerKey: 'priya',
    employmentType: 'contractor',
    status: 'active',
    officeDays: [...OFFICE_DAYS.weekdays],
    startDate: '2025-03-11',
    endDate: null,
    equipmentNeeds: [],
    equipmentStatus: 'not-needed',
    seatIndex: 15,
  },
  {
    key: 'olivia',
    name: 'Olivia Brooks',
    email: 'olivia.brooks@demo.com',
    department: 'Operations',
    title: 'Office Coordinator',
    managerKey: 'priya',
    employmentType: 'full-time',
    status: 'active',
    officeDays: [...OFFICE_DAYS.weekdays],
    startDate: '2022-05-23',
    endDate: null,
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: 16,
  },
  {
    key: 'quinn',
    name: 'Quinn Holt',
    email: 'quinn.holt@demo.com',
    department: 'Operations',
    title: 'Part-Time Ops Analyst',
    managerKey: 'priya',
    employmentType: 'part-time',
    status: 'on-leave',
    officeDays: [...OFFICE_DAYS.tth],
    startDate: '2023-03-14',
    endDate: null,
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: 17,
  },
]
