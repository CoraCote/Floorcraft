# Phase 6 — Utilization Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a point-in-time `/reports` page with three cards (per-floor utilization, per-department headcount, unassigned roster) + CSV export per card.

**Architecture:** Pure calculator functions in `src/lib/reports/calculations.ts` keep logic unit-testable. The page composes them with the existing `useEmployeeStore` + `useFloorStore`. No data-model changes, no time-series storage. Permissions gate through the existing `useCan('viewReports')` (which is true for Owner, Editor, HR Editor, Space Planner — not Viewer, matching spec's "Viewer cannot").

Wait — Phase 5's matrix makes `viewReports` `true` for all roles including Viewer. Re-read the spec: "Owner, HR Editor, Space Planner can view. Viewer cannot." The matrix is wrong for this action. Fix: change `viewReports` to false for `viewer` in the matrix (Task 1).

**Tech Stack:** Vite/React 19 + TypeScript + Zustand, Vitest + @testing-library/react, PapaParse (already a dep for CSV import — reuse for export).

---

## File structure

**New:**
- `src/lib/reports/calculations.ts` — pure functions: `floorUtilization`, `departmentHeadcount`, `unassignedEmployees`.
- `src/lib/reports/csvExport.ts` — per-card serializers.
- `src/components/reports/ReportsPage.tsx`
- `src/components/reports/UtilizationBar.tsx` — the colored progress bar component.
- `src/__tests__/reportsCalculations.test.ts`
- `src/__tests__/reportsPage.test.tsx`
- `src/__tests__/reportsPermissions.test.tsx`

**Modified:**
- `src/lib/permissions.ts` — remove `viewReports` from `viewer` role list (so chip appears non-green when it should).
- `src/App.tsx` — register `/t/:teamSlug/o/:officeSlug/reports` lazy route.
- `src/components/editor/TopBar.tsx` — add "Reports" nav pill gated on `useCan('viewReports')`.

---

## Task 1 — Fix viewReports permission

**Files:**
- Modify: `src/lib/permissions.ts`
- Modify: `src/__tests__/permissions.test.ts`

- [ ] **Step 1: Update matrix**

In `MATRIX`, change:
```ts
viewer: ['viewReports'],
```
to:
```ts
viewer: [],
```

- [ ] **Step 2: Update the permissions test**

In `src/__tests__/permissions.test.ts`, the test "viewer can only view reports" needs rewriting:
```ts
it('viewer has no permissions (read-only through routes only)', () => {
  const allActions: Action[] = [
    'editRoster', 'editMap', 'manageTeam',
    'viewAuditLog', 'viewReports', 'manageBilling', 'generateShareLink',
  ]
  for (const a of allActions) expect(can('viewer', a)).toBe(false)
})
```

Also update the "null role" test — change the `viewReports` expectation:
```ts
it('null role is closed on everything (transient load)', () => {
  expect(can(null, 'viewReports')).toBe(false)
  expect(can(null, 'editRoster')).toBe(false)
  expect(can(null, 'editMap')).toBe(false)
  expect(can(null, 'manageTeam')).toBe(false)
})
```

And in `src/lib/permissions.ts` the `null` branch simplifies to `return false`.

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/__tests__/permissions.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/permissions.ts src/__tests__/permissions.test.ts
git commit -m "fix(auth): viewReports excludes viewer; null role fully closed"
```

---

## Task 2 — Calculator module + tests

**Files:**
- Create: `src/lib/reports/calculations.ts`
- Create: `src/__tests__/reportsCalculations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import {
  floorUtilization,
  departmentHeadcount,
  unassignedEmployees,
} from '../lib/reports/calculations'
import type { CanvasElement } from '../types/elements'
import type { Employee } from '../types/employee'
import type { Floor } from '../types/floor'

function emp(id: string, over: Partial<Employee> = {}): Employee {
  return {
    id, name: id, email: '', department: null, team: null, title: null,
    managerId: null, employmentType: 'full-time', status: 'active',
    officeDays: [], startDate: null, endDate: null,
    equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null,
    tags: [], seatId: null, floorId: null,
    createdAt: new Date().toISOString(),
    leaveType: null, expectedReturnDate: null, coverageEmployeeId: null,
    leaveNotes: null, departureDate: null,
    ...over,
  } as Employee
}

function desk(id: string, assigned: string | null): CanvasElement {
  return {
    id, type: 'desk', x: 0, y: 0, width: 60, height: 60, rotation: 0,
    locked: false, groupId: null, zIndex: 0, visible: true, label: '',
    deskId: id, assignedEmployeeId: assigned, capacity: 1,
  } as unknown as CanvasElement
}

function workstation(id: string, assigned: string[], positions: number): CanvasElement {
  return {
    id, type: 'workstation', x: 0, y: 0, width: 120, height: 60, rotation: 0,
    locked: false, groupId: null, zIndex: 0, visible: true, label: '',
    deskId: id, positions, assignedEmployeeIds: assigned,
  } as unknown as CanvasElement
}

describe('floorUtilization', () => {
  it('computes assigned/capacity per floor across desks and workstations', () => {
    const floors: Floor[] = [
      {
        id: 'f1', name: 'Floor 1', order: 0,
        elements: {
          d1: desk('d1', 'e1'),
          d2: desk('d2', null),
          w1: workstation('w1', ['e2', 'e3'], 4),
        },
      } as never,
      {
        id: 'f2', name: 'Floor 2', order: 1,
        elements: { d3: desk('d3', null) },
      } as never,
    ]
    const rows = floorUtilization(floors)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      floorId: 'f1', floorName: 'Floor 1',
      assigned: 3, // 1 desk + 2 workstation seats
      capacity: 6, // 2 desks (1 each) + workstation (4)
    })
    expect(rows[0].percent).toBeCloseTo(50, 0)
    expect(rows[1]).toMatchObject({
      floorId: 'f2', assigned: 0, capacity: 1, percent: 0,
    })
  })

  it('returns percent=0 for a floor with no assignable elements (no divide-by-zero)', () => {
    const floors: Floor[] = [
      { id: 'f1', name: 'Floor 1', order: 0, elements: {} } as never,
    ]
    const rows = floorUtilization(floors)
    expect(rows[0]).toMatchObject({ assigned: 0, capacity: 0, percent: 0 })
  })
})

describe('departmentHeadcount', () => {
  it('counts employees per dept with seat-assignment rate', () => {
    const employees = {
      e1: emp('e1', { department: 'Eng', seatId: 's1' }),
      e2: emp('e2', { department: 'Eng', seatId: null }),
      e3: emp('e3', { department: 'Eng', seatId: 's3' }),
      e4: emp('e4', { department: 'Sales', seatId: 's4' }),
      e5: emp('e5', { department: null, seatId: null }),
    }
    const rows = departmentHeadcount(employees)
    const eng = rows.find((r) => r.department === 'Eng')!
    expect(eng).toMatchObject({ count: 3, assigned: 2 })
    expect(eng.assignmentRate).toBeCloseTo(66.67, 1)
    const sales = rows.find((r) => r.department === 'Sales')!
    expect(sales).toMatchObject({ count: 1, assigned: 1, assignmentRate: 100 })
    const none = rows.find((r) => r.department === '(None)')!
    expect(none.count).toBe(1)
  })

  it('sorts descending by count then alphabetically', () => {
    const employees = {
      a: emp('a', { department: 'Beta' }),
      b: emp('b', { department: 'Alpha' }),
      c: emp('c', { department: 'Alpha' }),
    }
    const rows = departmentHeadcount(employees)
    expect(rows.map((r) => r.department)).toEqual(['Alpha', 'Beta'])
  })
})

describe('unassignedEmployees', () => {
  it('returns active employees without a seat, sorted by name', () => {
    const employees = {
      a: emp('a', { name: 'Carol', status: 'active', seatId: null }),
      b: emp('b', { name: 'Alice', status: 'active', seatId: null }),
      c: emp('c', { name: 'Bob', status: 'active', seatId: 's1' }),
      d: emp('d', { name: 'Dave', status: 'departed', seatId: null }),
    }
    const rows = unassignedEmployees(employees)
    expect(rows.map((r) => r.name)).toEqual(['Alice', 'Carol'])
  })
})
```

- [ ] **Step 2: Run — FAIL (module missing)**

```bash
npx vitest run src/__tests__/reportsCalculations.test.ts
```

- [ ] **Step 3: Implement `src/lib/reports/calculations.ts`**

```ts
import type { CanvasElement } from '../../types/elements'
import type { Employee } from '../../types/employee'
import type { Floor } from '../../types/floor'
import { isAssignableElement } from '../../types/elements'

export interface FloorUtilRow {
  floorId: string
  floorName: string
  assigned: number
  capacity: number
  percent: number
}

export function floorUtilization(floors: Floor[]): FloorUtilRow[] {
  return floors.map((floor) => {
    let assigned = 0
    let capacity = 0
    for (const el of Object.values(floor.elements) as CanvasElement[]) {
      if (!isAssignableElement(el)) continue
      if (el.type === 'desk' || el.type === 'hot-desk') {
        capacity += 1
        if (el.assignedEmployeeId) assigned += 1
      } else if (el.type === 'workstation') {
        capacity += el.positions
        assigned += el.assignedEmployeeIds.length
      } else if (el.type === 'private-office') {
        capacity += el.capacity
        assigned += el.assignedEmployeeIds.length
      }
    }
    const percent = capacity === 0 ? 0 : (assigned / capacity) * 100
    return {
      floorId: floor.id,
      floorName: floor.name,
      assigned,
      capacity,
      percent,
    }
  })
}

export interface DeptRow {
  department: string
  count: number
  assigned: number
  assignmentRate: number
}

export function departmentHeadcount(employees: Record<string, Employee>): DeptRow[] {
  const buckets = new Map<string, { count: number; assigned: number }>()
  for (const e of Object.values(employees)) {
    const key = e.department?.trim() || '(None)'
    const row = buckets.get(key) ?? { count: 0, assigned: 0 }
    row.count += 1
    if (e.seatId) row.assigned += 1
    buckets.set(key, row)
  }
  const rows: DeptRow[] = Array.from(buckets.entries()).map(([department, { count, assigned }]) => ({
    department,
    count,
    assigned,
    assignmentRate: count === 0 ? 0 : (assigned / count) * 100,
  }))
  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.department.localeCompare(b.department)
  })
  return rows
}

export interface UnassignedRow {
  id: string
  name: string
  department: string | null
  email: string
}

export function unassignedEmployees(employees: Record<string, Employee>): UnassignedRow[] {
  const rows = Object.values(employees)
    .filter((e) => e.status === 'active' && !e.seatId)
    .map((e) => ({
      id: e.id,
      name: e.name,
      department: e.department,
      email: e.email,
    }))
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return rows
}
```

- [ ] **Step 4: Run — PASS**

```bash
npx vitest run src/__tests__/reportsCalculations.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/calculations.ts src/__tests__/reportsCalculations.test.ts
git commit -m "feat(reports): utilization + headcount + unassigned calculators"
```

---

## Task 3 — CSV export helpers

**Files:**
- Create: `src/lib/reports/csvExport.ts`

- [ ] **Step 1: Implement serializers**

Use the same PapaParse unparse call pattern as `src/lib/employeeCsv.ts` for consistency. If PapaParse unparse isn't accessible, build CSV lines manually — it's a small output set.

```ts
import Papa from 'papaparse'
import type { FloorUtilRow, DeptRow, UnassignedRow } from './calculations'

export function utilizationCsv(rows: FloorUtilRow[]): string {
  return Papa.unparse(
    rows.map((r) => ({
      floor: r.floorName,
      assigned: r.assigned,
      capacity: r.capacity,
      percent: r.percent.toFixed(1),
    })),
    { columns: ['floor', 'assigned', 'capacity', 'percent'] },
  )
}

export function headcountCsv(rows: DeptRow[]): string {
  return Papa.unparse(
    rows.map((r) => ({
      department: r.department,
      count: r.count,
      assigned: r.assigned,
      assignmentRate: r.assignmentRate.toFixed(1),
    })),
    { columns: ['department', 'count', 'assigned', 'assignmentRate'] },
  )
}

export function unassignedCsv(rows: UnassignedRow[]): string {
  return Papa.unparse(
    rows.map((r) => ({
      name: r.name,
      department: r.department ?? '',
      email: r.email,
    })),
    { columns: ['name', 'department', 'email'] },
  )
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/reports/csvExport.ts
git commit -m "feat(reports): CSV export helpers"
```

---

## Task 4 — ReportsPage component

**Files:**
- Create: `src/components/reports/ReportsPage.tsx`
- Create: `src/components/reports/UtilizationBar.tsx`
- Create: `src/__tests__/reportsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ReportsPage } from '../components/reports/ReportsPage'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'

beforeEach(() => {
  useProjectStore.setState({ currentOfficeRole: 'owner' } as never)
  useFloorStore.setState({
    floors: [
      {
        id: 'f1', name: 'HQ', order: 0,
        elements: {
          d1: { id: 'd1', type: 'desk', deskId: 'D-1', assignedEmployeeId: 'e1', capacity: 1 },
          d2: { id: 'd2', type: 'desk', deskId: 'D-2', assignedEmployeeId: null, capacity: 1 },
        },
      },
    ],
    activeFloorId: 'f1',
  } as never)
  useEmployeeStore.setState({
    employees: {
      e1: { id: 'e1', name: 'Alice', department: 'Eng', status: 'active', seatId: 'd1', email: '', officeDays: [], equipmentNeeds: [], tags: [], employmentType: 'full-time' } as never,
      e2: { id: 'e2', name: 'Bob', department: 'Eng', status: 'active', seatId: null, email: '', officeDays: [], equipmentNeeds: [], tags: [], employmentType: 'full-time' } as never,
    },
    departmentColors: {},
  } as never)
})

function mount() {
  return render(
    <MemoryRouter initialEntries={['/t/t/o/o/reports']}>
      <Routes>
        <Route path="/t/:teamSlug/o/:officeSlug/reports" element={<ReportsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ReportsPage', () => {
  it('renders utilization, headcount, and unassigned cards', () => {
    mount()
    expect(screen.getByRole('heading', { name: /floor utilization/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /department headcount/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /unassigned/i })).toBeInTheDocument()
    // HQ floor: 1 of 2 assigned = 50%
    expect(screen.getByText(/HQ/)).toBeInTheDocument()
    expect(screen.getByText(/50\.0%|50%/)).toBeInTheDocument()
    // Eng dept: 2 employees, 1 assigned
    expect(screen.getByText('Eng')).toBeInTheDocument()
    // Unassigned: Bob
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement `UtilizationBar`**

```tsx
// src/components/reports/UtilizationBar.tsx
export function UtilizationBar({ percent }: { percent: number }) {
  const color =
    percent < 50 ? 'bg-red-500' :
    percent < 80 ? 'bg-yellow-500' :
    'bg-emerald-500'
  const width = Math.min(100, Math.max(0, percent))
  return (
    <div className="w-full bg-gray-100 rounded h-2 overflow-hidden" role="progressbar" aria-valuenow={Math.round(percent)}>
      <div className={`h-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  )
}
```

- [ ] **Step 3: Implement `ReportsPage`**

```tsx
// src/components/reports/ReportsPage.tsx
import { useMemo } from 'react'
import { useFloorStore } from '../../stores/floorStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useCan } from '../../hooks/useCan'
import {
  floorUtilization,
  departmentHeadcount,
  unassignedEmployees,
} from '../../lib/reports/calculations'
import { utilizationCsv, headcountCsv, unassignedCsv, downloadCsv } from '../../lib/reports/csvExport'
import { UtilizationBar } from './UtilizationBar'

export function ReportsPage() {
  const canView = useCan('viewReports')
  const floors = useFloorStore((s) => s.floors)
  const employees = useEmployeeStore((s) => s.employees)

  const utilRows = useMemo(() => floorUtilization(floors), [floors])
  const deptRows = useMemo(() => departmentHeadcount(employees), [employees])
  const unassignedRows = useMemo(() => unassignedEmployees(employees), [employees])

  if (!canView) {
    return <div className="p-6 text-gray-600">Not authorized to view reports.</div>
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <Card
        title="Floor utilization"
        onExport={() => downloadCsv('floor-utilization.csv', utilizationCsv(utilRows))}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-200">
              <th className="py-2">Floor</th>
              <th>Assigned</th>
              <th>Capacity</th>
              <th className="w-1/3">Utilization</th>
            </tr>
          </thead>
          <tbody>
            {utilRows.map((r) => (
              <tr key={r.floorId} className="border-b border-gray-100">
                <td className="py-2">{r.floorName}</td>
                <td>{r.assigned}</td>
                <td>{r.capacity}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <UtilizationBar percent={r.percent} />
                    <span className="text-xs text-gray-500 tabular-nums w-12 text-right">
                      {r.percent.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card
        title="Department headcount"
        onExport={() => downloadCsv('department-headcount.csv', headcountCsv(deptRows))}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-200">
              <th className="py-2">Department</th>
              <th>Count</th>
              <th>Assigned</th>
              <th>Assignment rate</th>
            </tr>
          </thead>
          <tbody>
            {deptRows.map((r) => (
              <tr key={r.department} className="border-b border-gray-100">
                <td className="py-2">{r.department}</td>
                <td>{r.count}</td>
                <td>{r.assigned}</td>
                <td>{r.assignmentRate.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card
        title={`Unassigned (${unassignedRows.length})`}
        onExport={() => downloadCsv('unassigned.csv', unassignedCsv(unassignedRows))}
      >
        {unassignedRows.length === 0 ? (
          <p className="text-sm text-gray-500">Everyone active has a seat.</p>
        ) : (
          <ul className="text-sm divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {unassignedRows.map((r) => (
              <li key={r.id} className="py-1.5 flex items-center justify-between">
                <span>{r.name}</span>
                <span className="text-xs text-gray-500">{r.department ?? '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Card({ title, onExport, children }: { title: string; onExport: () => void; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <button
          onClick={onExport}
          className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
        >
          Export CSV
        </button>
      </div>
      {children}
    </section>
  )
}
```

- [ ] **Step 4: Register route in `src/App.tsx`**

Pattern-match the roster / audit routes and add:
```tsx
const ReportsPage = lazy(() => import('./components/reports/ReportsPage').then(m => ({ default: m.ReportsPage })))
// ...inside ProjectShell children:
<Route path="reports" element={<ReportsPage />} />
```

- [ ] **Step 5: Add "Reports" nav pill in TopBar**

In `src/components/editor/TopBar.tsx`, add alongside Map/Roster/Audit (gated on `useCan('viewReports')`). Match existing NavLink styling.

- [ ] **Step 6: Run tests — PASS**

```bash
npx vitest run src/__tests__/reportsPage.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add src/components/reports/ src/App.tsx src/components/editor/TopBar.tsx src/__tests__/reportsPage.test.tsx
git commit -m "feat(reports): page with three cards + CSV export"
```

---

## Task 5 — Permission gating test

**Files:**
- Create: `src/__tests__/reportsPermissions.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ReportsPage } from '../components/reports/ReportsPage'
import { useProjectStore } from '../stores/projectStore'
import { useFloorStore } from '../stores/floorStore'
import { useEmployeeStore } from '../stores/employeeStore'

beforeEach(() => {
  useFloorStore.setState({ floors: [], activeFloorId: null } as never)
  useEmployeeStore.setState({ employees: {}, departmentColors: {} } as never)
})

function mount() {
  return render(
    <MemoryRouter initialEntries={['/t/t/o/o/reports']}>
      <Routes>
        <Route path="/t/:teamSlug/o/:officeSlug/reports" element={<ReportsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Reports permissions', () => {
  it('viewer sees "Not authorized"', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as never)
    mount()
    expect(screen.getByText(/not authorized/i)).toBeInTheDocument()
  })

  it('space-planner can view', () => {
    useProjectStore.setState({ currentOfficeRole: 'space-planner' } as never)
    mount()
    expect(screen.getByRole('heading', { name: /floor utilization/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__tests__/reportsPermissions.test.tsx
git add src/__tests__/reportsPermissions.test.tsx
git commit -m "test(reports): permission gating"
```

---

## Task 6 — Final verify + PR

- [ ] **Step 1: Gauntlet**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: green, ~402 tests pass (395 + 2 reportsCalc + 1 reportsPage + 2 reportsPermissions + 2 adjusted permissions tests; net +7 or so).

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/phase6-utilization-reports
```

Base: `feat/phase5-rbac-audit` (stacked). Title: `Phase 6: utilization reporting`.

PR body: summarize cards + permission fix; note CSV export uses PapaParse to match import convention; note no data-model changes.

---

## Branching

Start from `feat/phase5-rbac-audit` as `feat/phase6-utilization-reports`. PR base = `feat/phase5-rbac-audit`. Auto-retargets to main after Phase 5 merges.
