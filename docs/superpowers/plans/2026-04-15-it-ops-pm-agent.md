# IT Ops PM Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a proactive insights dashboard in the Floocraft editor's right sidebar that analyzes floor plan state and employee data to surface actionable recommendations for office managers.

**Architecture:** Client-side rules engine with 6 category-specific analyzers feeding a Zustand insights store. UI is a new "Insights" tab in the existing right sidebar with severity-grouped narrative cards and action buttons. Employee model extended with equipment and offboarding fields. Optional AI enrichment layer deferred to v2.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest (new), TailwindCSS, Lucide icons, @tanstack/react-virtual

**Spec:** `docs/superpowers/specs/2026-04-15-it-ops-pm-agent-design.md`

---

## File Structure

```
src/
├── types/
│   ├── employee.ts                      # MODIFY — add endDate, equipmentNeeds, equipmentStatus
│   ├── elements.ts                      # MODIFY — add zone? to BaseElement
│   └── insights.ts                      # CREATE — Insight, InsightAction, InsightCategory, Severity, AnalyzerInput
├── stores/
│   ├── employeeStore.ts                 # MODIFY — wire new employee fields into addEmployee/addEmployees
│   ├── uiStore.ts                       # MODIFY — add 'insights' to rightSidebarTab union
│   └── insightsStore.ts                 # CREATE — insights state, filters, dismissal, action execution, reactivity
├── lib/
│   └── analyzers/
│       ├── index.ts                     # CREATE — runAllAnalyzers coordinator
│       ├── utilization.ts               # CREATE — analyzeUtilization
│       ├── proximity.ts                 # CREATE — analyzeTeamProximity
│       ├── onboarding.ts               # CREATE — analyzeOnboarding
│       ├── moves.ts                     # CREATE — analyzeMoves
│       ├── equipment.ts                 # CREATE — analyzeEquipment
│       └── trends.ts                    # CREATE — analyzeTrends
├── components/
│   └── editor/
│       └── RightSidebar/
│           ├── RightSidebar.tsx          # MODIFY — add Insights tab
│           ├── InsightsPanel.tsx         # CREATE — main insights tab component
│           ├── InsightCard.tsx           # CREATE — individual insight card
│           ├── InsightFilters.tsx        # CREATE — filter controls
│           └── SeveritySummary.tsx       # CREATE — severity count bar
└── __tests__/
    └── analyzers/
        ├── utilization.test.ts          # CREATE
        ├── proximity.test.ts            # CREATE
        ├── onboarding.test.ts           # CREATE
        ├── moves.test.ts                # CREATE
        ├── equipment.test.ts            # CREATE
        ├── trends.test.ts               # CREATE
        └── index.test.ts                # CREATE — coordinator tests
```

---

## Phase 1: Foundation — Types, Test Setup, Employee Model Extension

### Task 1: Set up Vitest test framework

**Files:**
- Modify: `package.json`
- Create: `vite.config.ts` (update)
- Create: `src/__tests__/setup.ts`

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Add test script to package.json**

Add to the `"scripts"` section of `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Configure vitest in vite.config.ts**

Add the `test` section to the existing `vite.config.ts`:

```typescript
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
})
```

- [ ] **Step 4: Create test setup file**

Create `src/__tests__/setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Verify test framework works**

Run: `npx vitest run`
Expected: 0 tests found, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/__tests__/setup.ts
git commit -m "chore: set up vitest test framework"
```

---

### Task 2: Create insight types

**Files:**
- Create: `src/types/insights.ts`

- [ ] **Step 1: Create the insight types file**

Create `src/types/insights.ts`:

```typescript
import type { CanvasElement } from './elements'
import type { Employee } from './employee'

export type InsightCategory =
  | 'utilization'
  | 'proximity'
  | 'onboarding'
  | 'moves'
  | 'equipment'
  | 'trends'

export type Severity = 'critical' | 'warning' | 'info'

export interface InsightAction {
  label: string
  type: 'navigate' | 'assign' | 'highlight' | 'external' | 'dismiss'
  payload: Record<string, unknown>
}

export interface Insight {
  id: string
  category: InsightCategory
  severity: Severity
  title: string
  narrative: string
  relatedElementIds: string[]
  relatedEmployeeIds: string[]
  actions: InsightAction[]
  timestamp: number
  dismissed: boolean
}

export interface AnalyzerInput {
  elements: CanvasElement[]
  employees: Employee[]
  zones: Map<string, CanvasElement[]>
}

export type Analyzer = (input: AnalyzerInput) => Insight[]
```

- [ ] **Step 2: Commit**

```bash
git add src/types/insights.ts
git commit -m "feat: add insight types for IT Ops PM Agent"
```

---

### Task 3: Add zone field to BaseElement

**Files:**
- Modify: `src/types/elements.ts`

- [ ] **Step 1: Add zone to BaseElement interface**

In `src/types/elements.ts`, add `zone` to the `BaseElement` interface after the `visible` field:

```typescript
// Add after line 41 (visible: boolean)
  zone?: string
```

So the interface becomes:

```typescript
export interface BaseElement {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  locked: boolean
  groupId: string | null
  zIndex: number
  label: string
  visible: boolean
  zone?: string
  style: ElementStyle
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/elements.ts
git commit -m "feat: add zone field to BaseElement for spatial grouping"
```

---

### Task 4: Extend Employee type with equipment and offboarding fields

**Files:**
- Modify: `src/types/employee.ts`
- Modify: `src/stores/employeeStore.ts`

- [ ] **Step 1: Add new fields to Employee interface**

In `src/types/employee.ts`, add these fields to the `Employee` interface after `startDate`:

```typescript
  endDate: string | null
  equipmentNeeds: string[]
  equipmentStatus: 'pending' | 'provisioned' | 'not-needed'
```

So the full interface becomes:

```typescript
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
```

- [ ] **Step 2: Update addEmployee in employeeStore.ts**

In `src/stores/employeeStore.ts`, update the `addEmployee` action to include the new fields. Find the employee creation object inside `addEmployee` and add:

```typescript
      endDate: data.endDate || null,
      equipmentNeeds: data.equipmentNeeds || [],
      equipmentStatus: data.equipmentStatus || 'not-needed',
```

These lines go after `startDate: data.startDate || null,`.

- [ ] **Step 3: Update addEmployees in employeeStore.ts**

In `src/stores/employeeStore.ts`, update the bulk `addEmployees` action similarly. Inside the `for (const e of newEmployees)` loop, add after `startDate`:

```typescript
          endDate: e.endDate || null,
          equipmentNeeds: e.equipmentNeeds || [],
          equipmentStatus: e.equipmentStatus || 'not-needed',
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/employee.ts src/stores/employeeStore.ts
git commit -m "feat: extend Employee with endDate, equipmentNeeds, equipmentStatus"
```

---

## Phase 2: Analyzers (TDD)

Each analyzer is a pure function: `(AnalyzerInput) => Insight[]`. We write a failing test, then implement.

### Task 5: Utilization analyzer

**Files:**
- Create: `src/__tests__/analyzers/utilization.test.ts`
- Create: `src/lib/analyzers/utilization.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/analyzers/utilization.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { analyzeUtilization } from '../../lib/analyzers/utilization'
import type { AnalyzerInput } from '../../types/insights'
import type { DeskElement } from '../../types/elements'
import type { Employee } from '../../types/employee'

function makeDeskElement(overrides: Partial<DeskElement> = {}): DeskElement {
  return {
    id: overrides.id || 'desk-1',
    type: 'desk',
    x: 0, y: 0, width: 72, height: 48, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Desk', visible: true,
    style: { fill: '#FEF3C7', stroke: '#D97706', strokeWidth: 1, opacity: 1 },
    deskId: overrides.deskId || 'D-101',
    assignedEmployeeId: overrides.assignedEmployeeId ?? null,
    capacity: 1,
    zone: overrides.zone,
    ...overrides,
  } as DeskElement
}

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id || 'emp-1',
    name: overrides.name || 'Test Employee',
    email: '', department: null, team: null, title: null,
    managerId: null, employmentType: 'full-time', officeDays: [],
    startDate: null, endDate: null, equipmentNeeds: [], equipmentStatus: 'not-needed',
    photoUrl: null, tags: [], seatId: null, floorId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeInput(overrides: Partial<AnalyzerInput> = {}): AnalyzerInput {
  return {
    elements: overrides.elements || [],
    employees: overrides.employees || [],
    zones: overrides.zones || new Map(),
  }
}

describe('analyzeUtilization', () => {
  it('returns empty array when no assignable elements exist', () => {
    const result = analyzeUtilization(makeInput())
    expect(result).toEqual([])
  })

  it('returns critical insight when zone utilization is below 20%', () => {
    const desks = Array.from({ length: 10 }, (_, i) =>
      makeDeskElement({ id: `desk-${i}`, deskId: `D-${i}`, zone: 'Zone A', assignedEmployeeId: i === 0 ? 'emp-1' : null })
    )
    const zones = new Map([['Zone A', desks]])
    const result = analyzeUtilization(makeInput({ elements: desks, zones }))

    expect(result.length).toBeGreaterThanOrEqual(1)
    const zoneInsight = result.find(r => r.category === 'utilization' && r.title.includes('Zone A'))
    expect(zoneInsight).toBeDefined()
    expect(zoneInsight!.severity).toBe('critical')
  })

  it('returns warning insight when zone utilization is below 40%', () => {
    const desks = Array.from({ length: 10 }, (_, i) =>
      makeDeskElement({ id: `desk-${i}`, deskId: `D-${i}`, zone: 'Zone B', assignedEmployeeId: i < 3 ? `emp-${i}` : null })
    )
    const zones = new Map([['Zone B', desks]])
    const result = analyzeUtilization(makeInput({ elements: desks, zones }))

    const zoneInsight = result.find(r => r.title.includes('Zone B'))
    expect(zoneInsight).toBeDefined()
    expect(zoneInsight!.severity).toBe('warning')
  })

  it('returns info insight for overall unassigned desks summary', () => {
    const desks = Array.from({ length: 5 }, (_, i) =>
      makeDeskElement({ id: `desk-${i}`, deskId: `D-${i}`, assignedEmployeeId: i < 3 ? `emp-${i}` : null })
    )
    const result = analyzeUtilization(makeInput({ elements: desks }))

    const summaryInsight = result.find(r => r.category === 'utilization')
    expect(summaryInsight).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/analyzers/utilization.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement analyzeUtilization**

Create `src/lib/analyzers/utilization.ts`:

```typescript
import type { AnalyzerInput, Insight } from '../../types/insights'
import { isAssignableElement } from '../../types/elements'
import type { DeskElement, WorkstationElement, PrivateOfficeElement } from '../../types/elements'

function getAssignedCount(el: DeskElement | WorkstationElement | PrivateOfficeElement): number {
  if (el.type === 'desk' || el.type === 'hot-desk') {
    return el.assignedEmployeeId ? 1 : 0
  }
  if (el.type === 'workstation') {
    return el.assignedEmployeeIds.length
  }
  if (el.type === 'private-office') {
    return el.assignedEmployeeIds.length
  }
  return 0
}

function getCapacity(el: DeskElement | WorkstationElement | PrivateOfficeElement): number {
  if (el.type === 'desk' || el.type === 'hot-desk') return 1
  if (el.type === 'workstation') return el.positions
  if (el.type === 'private-office') return el.capacity
  return 0
}

export function analyzeUtilization(input: AnalyzerInput): Insight[] {
  const insights: Insight[] = []
  const assignable = input.elements.filter(isAssignableElement)

  if (assignable.length === 0) return []

  // Per-zone analysis
  for (const [zoneName, zoneElements] of input.zones) {
    const zoneAssignable = zoneElements.filter(isAssignableElement)
    if (zoneAssignable.length === 0) continue

    const totalCapacity = zoneAssignable.reduce((sum, el) => sum + getCapacity(el), 0)
    const totalAssigned = zoneAssignable.reduce((sum, el) => sum + getAssignedCount(el), 0)
    const utilization = totalCapacity > 0 ? totalAssigned / totalCapacity : 0
    const pct = Math.round(utilization * 100)
    const unassignedCount = totalCapacity - totalAssigned

    let severity: 'critical' | 'warning' | 'info'
    if (pct < 20 || pct > 95) {
      severity = 'critical'
    } else if (pct < 40 || pct > 85) {
      severity = 'warning'
    } else {
      severity = 'info'
    }

    // Only report non-info utilization or if there are unassigned seats
    if (severity !== 'info' || unassignedCount > 0) {
      insights.push({
        id: `utilization-zone-${zoneName}`,
        category: 'utilization',
        severity,
        title: `${zoneName} at ${pct}% utilization`,
        narrative: `${zoneName} has ${totalCapacity} seats with ${totalAssigned} assigned (${unassignedCount} open). ${
          pct < 40
            ? 'Consider consolidating to free up this zone.'
            : pct > 85
              ? 'This zone is nearly full — plan for overflow.'
              : ''
        }`.trim(),
        relatedElementIds: zoneAssignable.map((el) => el.id),
        relatedEmployeeIds: [],
        actions: [
          { label: 'View on map', type: 'navigate', payload: { elementIds: zoneAssignable.map((el) => el.id) } },
        ],
        timestamp: Date.now(),
        dismissed: false,
      })
    }
  }

  // Overall summary for unzoned elements
  const unzoned = assignable.filter((el) => !el.zone)
  if (unzoned.length > 0) {
    const totalCapacity = unzoned.reduce((sum, el) => sum + getCapacity(el as DeskElement | WorkstationElement | PrivateOfficeElement), 0)
    const totalAssigned = unzoned.reduce((sum, el) => sum + getAssignedCount(el as DeskElement | WorkstationElement | PrivateOfficeElement), 0)
    const unassignedCount = totalCapacity - totalAssigned

    if (unassignedCount > 0) {
      insights.push({
        id: 'utilization-unzoned',
        category: 'utilization',
        severity: 'info',
        title: `${unassignedCount} unzoned seat${unassignedCount === 1 ? '' : 's'} available`,
        narrative: `${unassignedCount} of ${totalCapacity} seats without a zone assignment are open. Consider assigning zones for better space tracking.`,
        relatedElementIds: unzoned.map((el) => el.id),
        relatedEmployeeIds: [],
        actions: [
          { label: 'View on map', type: 'navigate', payload: { elementIds: unzoned.map((el) => el.id) } },
        ],
        timestamp: Date.now(),
        dismissed: false,
      })
    }
  }

  return insights
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/analyzers/utilization.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/analyzers/utilization.test.ts src/lib/analyzers/utilization.ts
git commit -m "feat: add utilization analyzer with tests"
```

---

### Task 6: Team proximity analyzer

**Files:**
- Create: `src/__tests__/analyzers/proximity.test.ts`
- Create: `src/lib/analyzers/proximity.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/analyzers/proximity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { analyzeTeamProximity } from '../../lib/analyzers/proximity'
import type { AnalyzerInput } from '../../types/insights'
import type { DeskElement } from '../../types/elements'
import type { Employee } from '../../types/employee'

function makeDeskElement(overrides: Partial<DeskElement> = {}): DeskElement {
  return {
    id: overrides.id || 'desk-1',
    type: 'desk',
    x: 0, y: 0, width: 72, height: 48, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Desk', visible: true,
    style: { fill: '#FEF3C7', stroke: '#D97706', strokeWidth: 1, opacity: 1 },
    deskId: overrides.deskId || 'D-101',
    assignedEmployeeId: overrides.assignedEmployeeId ?? null,
    capacity: 1,
    zone: overrides.zone,
    ...overrides,
  } as DeskElement
}

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id || 'emp-1',
    name: overrides.name || 'Test Employee',
    email: '', department: overrides.department ?? null, team: null, title: null,
    managerId: null, employmentType: 'full-time', officeDays: [],
    startDate: null, endDate: null, equipmentNeeds: [], equipmentStatus: 'not-needed',
    photoUrl: null, tags: [], seatId: overrides.seatId ?? null, floorId: overrides.floorId ?? null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('analyzeTeamProximity', () => {
  it('returns empty array when no employees have departments', () => {
    const result = analyzeTeamProximity({
      elements: [],
      employees: [makeEmployee({ department: null })],
      zones: new Map(),
    })
    expect(result).toEqual([])
  })

  it('returns warning when a department is split across 2+ zones', () => {
    const desks = [
      makeDeskElement({ id: 'd-1', deskId: 'D-1', zone: 'Zone A', assignedEmployeeId: 'emp-1' }),
      makeDeskElement({ id: 'd-2', deskId: 'D-2', zone: 'Zone A', assignedEmployeeId: 'emp-2' }),
      makeDeskElement({ id: 'd-3', deskId: 'D-3', zone: 'Zone B', assignedEmployeeId: 'emp-3' }),
    ]
    const employees = [
      makeEmployee({ id: 'emp-1', department: 'Engineering', seatId: 'D-1' }),
      makeEmployee({ id: 'emp-2', department: 'Engineering', seatId: 'D-2' }),
      makeEmployee({ id: 'emp-3', department: 'Engineering', seatId: 'D-3' }),
    ]
    const zones = new Map([
      ['Zone A', [desks[0], desks[1]]],
      ['Zone B', [desks[2]]],
    ])

    const result = analyzeTeamProximity({ elements: desks, employees, zones })

    const splitInsight = result.find(r => r.title.includes('Engineering'))
    expect(splitInsight).toBeDefined()
    expect(splitInsight!.severity).toBe('warning')
    expect(splitInsight!.narrative).toContain('Zone A')
    expect(splitInsight!.narrative).toContain('Zone B')
  })

  it('returns no insight when department is in a single zone', () => {
    const desks = [
      makeDeskElement({ id: 'd-1', deskId: 'D-1', zone: 'Zone A', assignedEmployeeId: 'emp-1' }),
      makeDeskElement({ id: 'd-2', deskId: 'D-2', zone: 'Zone A', assignedEmployeeId: 'emp-2' }),
    ]
    const employees = [
      makeEmployee({ id: 'emp-1', department: 'Engineering', seatId: 'D-1' }),
      makeEmployee({ id: 'emp-2', department: 'Engineering', seatId: 'D-2' }),
    ]
    const zones = new Map([['Zone A', desks]])

    const result = analyzeTeamProximity({ elements: desks, employees, zones })
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/analyzers/proximity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement analyzeTeamProximity**

Create `src/lib/analyzers/proximity.ts`:

```typescript
import type { AnalyzerInput, Insight } from '../../types/insights'
import { isDeskElement, isWorkstationElement, isPrivateOfficeElement } from '../../types/elements'
import type { CanvasElement } from '../../types/elements'

function getEmployeeZone(
  employeeSeatId: string | null,
  elements: CanvasElement[],
): string | null {
  if (!employeeSeatId) return null
  for (const el of elements) {
    if (isDeskElement(el) && el.deskId === employeeSeatId) return el.zone || null
    if (isWorkstationElement(el) && el.deskId === employeeSeatId) return el.zone || null
    if (isPrivateOfficeElement(el) && el.deskId === employeeSeatId) return el.zone || null
  }
  return null
}

export function analyzeTeamProximity(input: AnalyzerInput): Insight[] {
  const insights: Insight[] = []

  // Group employees by department
  const deptMap = new Map<string, { employeeId: string; zone: string | null }[]>()
  for (const emp of input.employees) {
    if (!emp.department) continue
    if (!deptMap.has(emp.department)) deptMap.set(emp.department, [])
    const zone = getEmployeeZone(emp.seatId, input.elements)
    deptMap.get(emp.department)!.push({ employeeId: emp.id, zone })
  }

  for (const [dept, members] of deptMap) {
    const seatedMembers = members.filter((m) => m.zone !== null)
    if (seatedMembers.length < 2) continue

    // Count per zone
    const zoneCounts = new Map<string, string[]>()
    for (const m of seatedMembers) {
      const z = m.zone!
      if (!zoneCounts.has(z)) zoneCounts.set(z, [])
      zoneCounts.get(z)!.push(m.employeeId)
    }

    if (zoneCounts.size < 2) continue

    const zoneBreakdown = [...zoneCounts.entries()]
      .map(([z, ids]) => `${ids.length} in ${z}`)
      .join(', ')

    insights.push({
      id: `proximity-dept-${dept}`,
      category: 'proximity',
      severity: 'warning',
      title: `${dept} split across ${zoneCounts.size} zones`,
      narrative: `${dept} team is spread across multiple zones: ${zoneBreakdown}. Co-locating could improve collaboration.`,
      relatedElementIds: seatedMembers.map((m) => m.employeeId),
      relatedEmployeeIds: members.map((m) => m.employeeId),
      actions: [
        { label: 'Highlight team', type: 'highlight', payload: { employeeIds: members.map((m) => m.employeeId) } },
      ],
      timestamp: Date.now(),
      dismissed: false,
    })
  }

  return insights
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/analyzers/proximity.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/analyzers/proximity.test.ts src/lib/analyzers/proximity.ts
git commit -m "feat: add team proximity analyzer with tests"
```

---

### Task 7: Onboarding analyzer

**Files:**
- Create: `src/__tests__/analyzers/onboarding.test.ts`
- Create: `src/lib/analyzers/onboarding.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/analyzers/onboarding.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { analyzeOnboarding } from '../../lib/analyzers/onboarding'
import type { Employee } from '../../types/employee'

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id || 'emp-1',
    name: overrides.name || 'Test Employee',
    email: '', department: null, team: null, title: null,
    managerId: null, employmentType: 'full-time', officeDays: [],
    startDate: null, endDate: null, equipmentNeeds: [], equipmentStatus: 'not-needed',
    photoUrl: null, tags: [], seatId: null, floorId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('analyzeOnboarding', () => {
  it('returns critical for new hire within 7 days with no seat', () => {
    const inFiveDays = new Date()
    inFiveDays.setDate(inFiveDays.getDate() + 5)

    const result = analyzeOnboarding({
      elements: [],
      employees: [
        makeEmployee({ id: 'e1', name: 'Sarah Chen', startDate: inFiveDays.toISOString(), seatId: null }),
      ],
      zones: new Map(),
    })

    expect(result.length).toBe(1)
    expect(result[0].severity).toBe('critical')
    expect(result[0].title).toContain('Sarah Chen')
  })

  it('returns warning for new hire within 30 days with no seat', () => {
    const inTwentyDays = new Date()
    inTwentyDays.setDate(inTwentyDays.getDate() + 20)

    const result = analyzeOnboarding({
      elements: [],
      employees: [
        makeEmployee({ id: 'e1', name: 'Mike Torres', startDate: inTwentyDays.toISOString(), seatId: null }),
      ],
      zones: new Map(),
    })

    expect(result.length).toBe(1)
    expect(result[0].severity).toBe('warning')
  })

  it('returns info for departed employee still assigned a seat', () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const result = analyzeOnboarding({
      elements: [],
      employees: [
        makeEmployee({ id: 'e1', name: 'Former Employee', endDate: thirtyDaysAgo.toISOString(), seatId: 'D-101' }),
      ],
      zones: new Map(),
    })

    expect(result.length).toBe(1)
    expect(result[0].severity).toBe('info')
    expect(result[0].title).toContain('Former Employee')
  })

  it('returns no insight for new hire who already has a seat', () => {
    const inFiveDays = new Date()
    inFiveDays.setDate(inFiveDays.getDate() + 5)

    const result = analyzeOnboarding({
      elements: [],
      employees: [
        makeEmployee({ id: 'e1', startDate: inFiveDays.toISOString(), seatId: 'D-101' }),
      ],
      zones: new Map(),
    })

    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/analyzers/onboarding.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement analyzeOnboarding**

Create `src/lib/analyzers/onboarding.ts`:

```typescript
import type { AnalyzerInput, Insight } from '../../types/insights'

export function analyzeOnboarding(input: AnalyzerInput): Insight[] {
  const insights: Insight[] = []
  const now = new Date()

  for (const emp of input.employees) {
    // New hires without seats
    if (emp.startDate && !emp.seatId) {
      const startDate = new Date(emp.startDate)
      if (startDate <= now) continue // already started, different issue

      const daysUntilStart = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      if (daysUntilStart <= 30) {
        const severity = daysUntilStart <= 7 ? 'critical' as const : 'warning' as const
        insights.push({
          id: `onboarding-no-seat-${emp.id}`,
          category: 'onboarding',
          severity,
          title: `${emp.name} starts in ${daysUntilStart} day${daysUntilStart === 1 ? '' : 's'} with no desk`,
          narrative: `${emp.name}${emp.department ? ` (${emp.department})` : ''} starts on ${startDate.toLocaleDateString()}. No desk has been assigned yet.${
            emp.equipmentStatus === 'pending' ? ' Equipment is also pending.' : ''
          }`,
          relatedElementIds: [],
          relatedEmployeeIds: [emp.id],
          actions: [
            { label: 'Auto-assign', type: 'assign', payload: { employeeId: emp.id } },
          ],
          timestamp: Date.now(),
          dismissed: false,
        })
      }
    }

    // Departed employees still occupying seats
    if (emp.endDate && emp.seatId) {
      const endDate = new Date(emp.endDate)
      if (endDate < now) {
        const daysSinceDeparture = Math.ceil((now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24))
        insights.push({
          id: `onboarding-departed-${emp.id}`,
          category: 'onboarding',
          severity: 'info',
          title: `${emp.name} departed ${daysSinceDeparture} day${daysSinceDeparture === 1 ? '' : 's'} ago — seat still assigned`,
          narrative: `${emp.name} left on ${endDate.toLocaleDateString()} but is still assigned to seat ${emp.seatId}. Unassign to free the desk.`,
          relatedElementIds: [],
          relatedEmployeeIds: [emp.id],
          actions: [
            { label: 'Unassign', type: 'assign', payload: { employeeId: emp.id, action: 'unassign' } },
          ],
          timestamp: Date.now(),
          dismissed: false,
        })
      }
    }
  }

  return insights
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/analyzers/onboarding.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/analyzers/onboarding.test.ts src/lib/analyzers/onboarding.ts
git commit -m "feat: add onboarding/offboarding analyzer with tests"
```

---

### Task 8: Equipment analyzer

**Files:**
- Create: `src/__tests__/analyzers/equipment.test.ts`
- Create: `src/lib/analyzers/equipment.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/analyzers/equipment.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { analyzeEquipment } from '../../lib/analyzers/equipment'
import type { Employee } from '../../types/employee'

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id || 'emp-1',
    name: overrides.name || 'Test Employee',
    email: '', department: null, team: null, title: null,
    managerId: null, employmentType: 'full-time', officeDays: [],
    startDate: null, endDate: null, equipmentNeeds: [], equipmentStatus: 'not-needed',
    photoUrl: null, tags: [], seatId: null, floorId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('analyzeEquipment', () => {
  it('returns warning for seated employees with pending equipment', () => {
    const result = analyzeEquipment({
      elements: [],
      employees: [
        makeEmployee({
          id: 'e1', name: 'Jane',
          seatId: 'D-101',
          equipmentNeeds: ['monitor', 'standing-desk'],
          equipmentStatus: 'pending',
        }),
      ],
      zones: new Map(),
    })

    expect(result.length).toBe(1)
    expect(result[0].severity).toBe('warning')
    expect(result[0].narrative).toContain('monitor')
    expect(result[0].narrative).toContain('standing-desk')
  })

  it('returns info for unassigned employees with pending equipment', () => {
    const result = analyzeEquipment({
      elements: [],
      employees: [
        makeEmployee({
          id: 'e1', name: 'John',
          seatId: null,
          equipmentNeeds: ['docking-station'],
          equipmentStatus: 'pending',
        }),
      ],
      zones: new Map(),
    })

    expect(result.length).toBe(1)
    expect(result[0].severity).toBe('info')
  })

  it('returns no insight for provisioned employees', () => {
    const result = analyzeEquipment({
      elements: [],
      employees: [
        makeEmployee({
          equipmentNeeds: ['monitor'],
          equipmentStatus: 'provisioned',
          seatId: 'D-101',
        }),
      ],
      zones: new Map(),
    })

    expect(result).toEqual([])
  })

  it('returns aggregate insight when multiple employees have pending equipment', () => {
    const result = analyzeEquipment({
      elements: [],
      employees: [
        makeEmployee({ id: 'e1', name: 'A', seatId: 'D-1', equipmentNeeds: ['monitor'], equipmentStatus: 'pending' }),
        makeEmployee({ id: 'e2', name: 'B', seatId: 'D-2', equipmentNeeds: ['monitor'], equipmentStatus: 'pending' }),
        makeEmployee({ id: 'e3', name: 'C', seatId: 'D-3', equipmentNeeds: ['keyboard'], equipmentStatus: 'pending' }),
      ],
      zones: new Map(),
    })

    // Should have individual insights + potentially an aggregate
    expect(result.length).toBeGreaterThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/analyzers/equipment.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement analyzeEquipment**

Create `src/lib/analyzers/equipment.ts`:

```typescript
import type { AnalyzerInput, Insight } from '../../types/insights'

export function analyzeEquipment(input: AnalyzerInput): Insight[] {
  const insights: Insight[] = []

  const pendingEmployees = input.employees.filter(
    (emp) => emp.equipmentStatus === 'pending' && emp.equipmentNeeds.length > 0
  )

  if (pendingEmployees.length === 0) return []

  for (const emp of pendingEmployees) {
    const isSeated = emp.seatId !== null
    insights.push({
      id: `equipment-pending-${emp.id}`,
      category: 'equipment',
      severity: isSeated ? 'warning' : 'info',
      title: `${emp.name} needs ${emp.equipmentNeeds.length} item${emp.equipmentNeeds.length === 1 ? '' : 's'}`,
      narrative: `${emp.name} has pending equipment: ${emp.equipmentNeeds.join(', ')}.${
        isSeated ? ` They are seated at ${emp.seatId} — provision soon.` : ' Assign a desk first, then provision.'
      }`,
      relatedElementIds: [],
      relatedEmployeeIds: [emp.id],
      actions: [
        { label: 'View details', type: 'highlight', payload: { employeeId: emp.id } },
      ],
      timestamp: Date.now(),
      dismissed: false,
    })
  }

  return insights
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/analyzers/equipment.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/analyzers/equipment.test.ts src/lib/analyzers/equipment.ts
git commit -m "feat: add equipment analyzer with tests"
```

---

### Task 9: Moves analyzer

**Files:**
- Create: `src/__tests__/analyzers/moves.test.ts`
- Create: `src/lib/analyzers/moves.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/analyzers/moves.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { analyzeMoves } from '../../lib/analyzers/moves'
import type { Employee } from '../../types/employee'
import type { DeskElement } from '../../types/elements'

function makeDeskElement(overrides: Partial<DeskElement> = {}): DeskElement {
  return {
    id: overrides.id || 'desk-1',
    type: 'desk',
    x: 0, y: 0, width: 72, height: 48, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Desk', visible: true,
    style: { fill: '#FEF3C7', stroke: '#D97706', strokeWidth: 1, opacity: 1 },
    deskId: overrides.deskId || 'D-101',
    assignedEmployeeId: overrides.assignedEmployeeId ?? null,
    capacity: 1,
    zone: overrides.zone,
    ...overrides,
  } as DeskElement
}

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id || 'emp-1',
    name: overrides.name || 'Test Employee',
    email: '', department: null, team: null, title: null,
    managerId: null, employmentType: 'full-time', officeDays: [],
    startDate: null, endDate: null, equipmentNeeds: [], equipmentStatus: 'not-needed',
    photoUrl: null, tags: [], seatId: null, floorId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('analyzeMoves', () => {
  it('returns empty when no employees have pending-move tag', () => {
    const result = analyzeMoves({
      elements: [],
      employees: [makeEmployee()],
      zones: new Map(),
    })
    expect(result).toEqual([])
  })

  it('returns info for employee with pending-move tag', () => {
    const result = analyzeMoves({
      elements: [
        makeDeskElement({ id: 'd-1', deskId: 'D-1', assignedEmployeeId: 'e1' }),
      ],
      employees: [
        makeEmployee({ id: 'e1', name: 'Alice', seatId: 'D-1', tags: ['pending-move'] }),
      ],
      zones: new Map(),
    })

    expect(result.length).toBe(1)
    expect(result[0].category).toBe('moves')
    expect(result[0].title).toContain('Alice')
  })

  it('detects multiple pending moves and creates aggregate insight', () => {
    const result = analyzeMoves({
      elements: [],
      employees: [
        makeEmployee({ id: 'e1', name: 'Alice', tags: ['pending-move'] }),
        makeEmployee({ id: 'e2', name: 'Bob', tags: ['pending-move'] }),
        makeEmployee({ id: 'e3', name: 'Carol', tags: ['pending-move'] }),
      ],
      zones: new Map(),
    })

    // Individual + aggregate
    expect(result.length).toBe(4)
    const aggregate = result.find(r => r.id === 'moves-aggregate')
    expect(aggregate).toBeDefined()
    expect(aggregate!.title).toContain('3')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/analyzers/moves.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement analyzeMoves**

Create `src/lib/analyzers/moves.ts`:

```typescript
import type { AnalyzerInput, Insight } from '../../types/insights'

export function analyzeMoves(input: AnalyzerInput): Insight[] {
  const insights: Insight[] = []

  const pendingMoves = input.employees.filter((emp) =>
    emp.tags.includes('pending-move')
  )

  if (pendingMoves.length === 0) return []

  for (const emp of pendingMoves) {
    insights.push({
      id: `moves-pending-${emp.id}`,
      category: 'moves',
      severity: 'info',
      title: `${emp.name} has a pending move`,
      narrative: `${emp.name}${emp.department ? ` (${emp.department})` : ''} is tagged for relocation.${
        emp.seatId ? ` Currently at ${emp.seatId}.` : ' Not currently assigned a desk.'
      }`,
      relatedElementIds: [],
      relatedEmployeeIds: [emp.id],
      actions: [
        { label: 'View on map', type: 'navigate', payload: { employeeId: emp.id } },
      ],
      timestamp: Date.now(),
      dismissed: false,
    })
  }

  // Aggregate if multiple moves
  if (pendingMoves.length > 1) {
    insights.push({
      id: 'moves-aggregate',
      category: 'moves',
      severity: 'warning',
      title: `${pendingMoves.length} pending moves to coordinate`,
      narrative: `${pendingMoves.map((e) => e.name).join(', ')} are all tagged for relocation. Consider batching these moves.`,
      relatedElementIds: [],
      relatedEmployeeIds: pendingMoves.map((e) => e.id),
      actions: [
        { label: 'Highlight all', type: 'highlight', payload: { employeeIds: pendingMoves.map((e) => e.id) } },
      ],
      timestamp: Date.now(),
      dismissed: false,
    })
  }

  return insights
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/analyzers/moves.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/analyzers/moves.test.ts src/lib/analyzers/moves.ts
git commit -m "feat: add moves analyzer with tests"
```

---

### Task 10: Trends analyzer

**Files:**
- Create: `src/__tests__/analyzers/trends.test.ts`
- Create: `src/lib/analyzers/trends.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/analyzers/trends.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { analyzeTrends } from '../../lib/analyzers/trends'

describe('analyzeTrends', () => {
  it('returns empty array (placeholder — trends require history snapshots)', () => {
    const result = analyzeTrends({
      elements: [],
      employees: [],
      zones: new Map(),
    })
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/analyzers/trends.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement analyzeTrends stub**

Create `src/lib/analyzers/trends.ts`:

```typescript
import type { AnalyzerInput, Insight } from '../../types/insights'

// Trends analysis requires historical state snapshots.
// This is a placeholder that returns no insights until the history
// persistence layer is built (deferred to v2).
export function analyzeTrends(_input: AnalyzerInput): Insight[] {
  return []
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/analyzers/trends.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/analyzers/trends.test.ts src/lib/analyzers/trends.ts
git commit -m "feat: add trends analyzer stub (requires history, deferred to v2)"
```

---

### Task 11: Analyzer coordinator

**Files:**
- Create: `src/__tests__/analyzers/index.test.ts`
- Create: `src/lib/analyzers/index.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/analyzers/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { runAllAnalyzers, buildAnalyzerInput } from '../../lib/analyzers'
import type { CanvasElement, DeskElement } from '../../types/elements'
import type { Employee } from '../../types/employee'

function makeDeskElement(overrides: Partial<DeskElement> = {}): DeskElement {
  return {
    id: overrides.id || 'desk-1',
    type: 'desk',
    x: 0, y: 0, width: 72, height: 48, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Desk', visible: true,
    style: { fill: '#FEF3C7', stroke: '#D97706', strokeWidth: 1, opacity: 1 },
    deskId: overrides.deskId || 'D-101',
    assignedEmployeeId: overrides.assignedEmployeeId ?? null,
    capacity: 1,
    zone: overrides.zone,
    ...overrides,
  } as DeskElement
}

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id || 'emp-1',
    name: overrides.name || 'Test Employee',
    email: '', department: null, team: null, title: null,
    managerId: null, employmentType: 'full-time', officeDays: [],
    startDate: null, endDate: null, equipmentNeeds: [], equipmentStatus: 'not-needed',
    photoUrl: null, tags: [], seatId: null, floorId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('buildAnalyzerInput', () => {
  it('groups elements by zone', () => {
    const elements: CanvasElement[] = [
      makeDeskElement({ id: 'd-1', zone: 'Zone A' }),
      makeDeskElement({ id: 'd-2', zone: 'Zone A' }),
      makeDeskElement({ id: 'd-3', zone: 'Zone B' }),
      makeDeskElement({ id: 'd-4' }), // no zone
    ]

    const input = buildAnalyzerInput(elements, [])
    expect(input.zones.get('Zone A')?.length).toBe(2)
    expect(input.zones.get('Zone B')?.length).toBe(1)
    expect(input.zones.has('undefined')).toBe(false)
  })
})

describe('runAllAnalyzers', () => {
  it('returns an array of insights from all analyzers', () => {
    const elements: CanvasElement[] = [
      makeDeskElement({ id: 'd-1', deskId: 'D-1', zone: 'Zone A' }),
    ]

    const result = runAllAnalyzers(elements, [])
    expect(Array.isArray(result)).toBe(true)
  })

  it('deduplicates insights by id', () => {
    // Running twice with the same input should produce unique insight IDs
    const elements: CanvasElement[] = [
      makeDeskElement({ id: 'd-1', deskId: 'D-1', zone: 'Zone A' }),
    ]
    const employees = [
      makeEmployee({ id: 'e1', tags: ['pending-move'] }),
    ]

    const result = runAllAnalyzers(elements, employees)
    const ids = result.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sorts insights by severity: critical first, then warning, then info', () => {
    const inFiveDays = new Date()
    inFiveDays.setDate(inFiveDays.getDate() + 5)

    const elements: CanvasElement[] = Array.from({ length: 10 }, (_, i) =>
      makeDeskElement({ id: `d-${i}`, deskId: `D-${i}`, zone: 'Zone A', assignedEmployeeId: i === 0 ? 'e-seated' : null })
    )
    const employees = [
      makeEmployee({ id: 'e-new', name: 'New Hire', startDate: inFiveDays.toISOString(), seatId: null }),
      makeEmployee({ id: 'e-move', name: 'Mover', tags: ['pending-move'] }),
    ]

    const result = runAllAnalyzers(elements, employees)
    const severityOrder = { critical: 0, warning: 1, info: 2 }

    for (let i = 1; i < result.length; i++) {
      expect(severityOrder[result[i].severity]).toBeGreaterThanOrEqual(
        severityOrder[result[i - 1].severity]
      )
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/analyzers/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the coordinator**

Create `src/lib/analyzers/index.ts`:

```typescript
import type { CanvasElement } from '../../types/elements'
import type { Employee } from '../../types/employee'
import type { AnalyzerInput, Insight } from '../../types/insights'
import { analyzeUtilization } from './utilization'
import { analyzeTeamProximity } from './proximity'
import { analyzeOnboarding } from './onboarding'
import { analyzeMoves } from './moves'
import { analyzeEquipment } from './equipment'
import { analyzeTrends } from './trends'

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const

export function buildAnalyzerInput(
  elements: CanvasElement[],
  employees: Employee[],
): AnalyzerInput {
  const zones = new Map<string, CanvasElement[]>()

  for (const el of elements) {
    if (el.zone) {
      if (!zones.has(el.zone)) zones.set(el.zone, [])
      zones.get(el.zone)!.push(el)
    }
  }

  return { elements, employees, zones }
}

export function runAllAnalyzers(
  elements: CanvasElement[],
  employees: Employee[],
): Insight[] {
  const input = buildAnalyzerInput(elements, employees)

  const allInsights = [
    ...analyzeUtilization(input),
    ...analyzeTeamProximity(input),
    ...analyzeOnboarding(input),
    ...analyzeMoves(input),
    ...analyzeEquipment(input),
    ...analyzeTrends(input),
  ]

  // Deduplicate by id (keep first occurrence)
  const seen = new Set<string>()
  const unique: Insight[] = []
  for (const insight of allInsights) {
    if (!seen.has(insight.id)) {
      seen.add(insight.id)
      unique.push(insight)
    }
  }

  // Sort by severity (critical first)
  unique.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  return unique
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/analyzers/index.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Run all analyzer tests together**

Run: `npx vitest run src/__tests__/analyzers/`
Expected: All tests across all analyzer files PASS.

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/analyzers/index.test.ts src/lib/analyzers/index.ts
git commit -m "feat: add analyzer coordinator with dedup, sorting, and zone grouping"
```

---

## Phase 3: Insights Store

### Task 12: Create insights store

**Files:**
- Create: `src/stores/insightsStore.ts`

- [ ] **Step 1: Create the insights store**

Create `src/stores/insightsStore.ts`:

```typescript
import { create } from 'zustand'
import type { Insight, InsightCategory, Severity } from '../types/insights'
import { runAllAnalyzers } from '../lib/analyzers'
import type { CanvasElement } from '../types/elements'
import type { Employee } from '../types/employee'

interface InsightsState {
  insights: Insight[]
  dismissedIds: Set<string>
  filter: {
    categories: Set<InsightCategory>
    severities: Set<Severity>
    showDismissed: boolean
  }
  lastAnalyzedAt: number | null
  isAnalyzing: boolean

  // Actions
  runAnalysis: (elements: CanvasElement[], employees: Employee[]) => void
  dismissInsight: (id: string) => void
  restoreInsight: (id: string) => void
  toggleCategory: (category: InsightCategory) => void
  toggleSeverity: (severity: Severity) => void
  setShowDismissed: (show: boolean) => void

  // Computed
  getFilteredInsights: () => Insight[]
  getCounts: () => { critical: number; warning: number; info: number; total: number }
}

const ALL_CATEGORIES: InsightCategory[] = ['utilization', 'proximity', 'onboarding', 'moves', 'equipment', 'trends']
const ALL_SEVERITIES: Severity[] = ['critical', 'warning', 'info']

function loadDismissedIds(projectId?: string): Set<string> {
  try {
    const key = `floocraft-dismissed-${projectId || 'default'}`
    const stored = localStorage.getItem(key)
    if (stored) return new Set(JSON.parse(stored))
  } catch {
    // ignore
  }
  return new Set()
}

function saveDismissedIds(ids: Set<string>, projectId?: string) {
  try {
    const key = `floocraft-dismissed-${projectId || 'default'}`
    localStorage.setItem(key, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

export const useInsightsStore = create<InsightsState>((set, get) => ({
  insights: [],
  dismissedIds: loadDismissedIds(),
  filter: {
    categories: new Set(ALL_CATEGORIES),
    severities: new Set(ALL_SEVERITIES),
    showDismissed: false,
  },
  lastAnalyzedAt: null,
  isAnalyzing: false,

  runAnalysis: (elements, employees) => {
    set({ isAnalyzing: true })
    const raw = runAllAnalyzers(elements, employees)
    const dismissed = get().dismissedIds
    const insights = raw.map((insight) => ({
      ...insight,
      dismissed: dismissed.has(insight.id),
    }))
    set({ insights, lastAnalyzedAt: Date.now(), isAnalyzing: false })
  },

  dismissInsight: (id) => {
    set((state) => {
      const next = new Set(state.dismissedIds)
      next.add(id)
      saveDismissedIds(next)
      return {
        dismissedIds: next,
        insights: state.insights.map((i) =>
          i.id === id ? { ...i, dismissed: true } : i
        ),
      }
    })
  },

  restoreInsight: (id) => {
    set((state) => {
      const next = new Set(state.dismissedIds)
      next.delete(id)
      saveDismissedIds(next)
      return {
        dismissedIds: next,
        insights: state.insights.map((i) =>
          i.id === id ? { ...i, dismissed: false } : i
        ),
      }
    })
  },

  toggleCategory: (category) => {
    set((state) => {
      const next = new Set(state.filter.categories)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return { filter: { ...state.filter, categories: next } }
    })
  },

  toggleSeverity: (severity) => {
    set((state) => {
      const next = new Set(state.filter.severities)
      if (next.has(severity)) {
        next.delete(severity)
      } else {
        next.add(severity)
      }
      return { filter: { ...state.filter, severities: next } }
    })
  },

  setShowDismissed: (show) => {
    set((state) => ({ filter: { ...state.filter, showDismissed: show } }))
  },

  getFilteredInsights: () => {
    const state = get()
    return state.insights.filter((insight) => {
      if (!state.filter.categories.has(insight.category)) return false
      if (!state.filter.severities.has(insight.severity)) return false
      if (insight.dismissed && !state.filter.showDismissed) return false
      return true
    })
  },

  getCounts: () => {
    const state = get()
    const active = state.insights.filter((i) => !i.dismissed)
    return {
      critical: active.filter((i) => i.severity === 'critical').length,
      warning: active.filter((i) => i.severity === 'warning').length,
      info: active.filter((i) => i.severity === 'info').length,
      total: active.length,
    }
  },
}))
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/insightsStore.ts
git commit -m "feat: add insights store with filtering, dismissal, and persistence"
```

---

## Phase 4: UI Components

### Task 13: Update UIStore and RightSidebar for Insights tab

**Files:**
- Modify: `src/stores/uiStore.ts`
- Modify: `src/components/editor/RightSidebar/RightSidebar.tsx`

- [ ] **Step 1: Add 'insights' to rightSidebarTab type in uiStore.ts**

In `src/stores/uiStore.ts`, change the `rightSidebarTab` type from:

```typescript
  rightSidebarTab: 'properties' | 'people' | 'reports'
```

to:

```typescript
  rightSidebarTab: 'properties' | 'people' | 'reports' | 'insights'
```

Do this in both the interface definition (around line 10) and keep the default value as `'properties'`.

- [ ] **Step 2: Add Insights tab to RightSidebar.tsx**

In `src/components/editor/RightSidebar/RightSidebar.tsx`, add the import and tab entry:

Add import at the top:

```typescript
import { InsightsPanel } from './InsightsPanel'
```

Add the tab to the `tabs` array:

```typescript
  const tabs = [
    { id: 'properties' as const, label: 'Properties' },
    { id: 'people' as const, label: 'People' },
    { id: 'reports' as const, label: 'Reports' },
    { id: 'insights' as const, label: 'Insights' },
  ]
```

Add the panel render in the tab content area:

```typescript
        {tab === 'insights' && <InsightsPanel />}
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/uiStore.ts src/components/editor/RightSidebar/RightSidebar.tsx
git commit -m "feat: add Insights tab to right sidebar"
```

---

### Task 14: Create SeveritySummary component

**Files:**
- Create: `src/components/editor/RightSidebar/SeveritySummary.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/editor/RightSidebar/SeveritySummary.tsx`:

```typescript
interface SeveritySummaryProps {
  critical: number
  warning: number
  info: number
}

export function SeveritySummary({ critical, warning, info }: SeveritySummaryProps) {
  return (
    <div className="flex items-center gap-4 px-3 py-2 bg-gray-50 rounded-lg text-xs">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        <span className="font-medium text-gray-700">{critical} Critical</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-yellow-500" />
        <span className="font-medium text-gray-700">{warning} Warning</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-blue-500" />
        <span className="font-medium text-gray-700">{info} Info</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/RightSidebar/SeveritySummary.tsx
git commit -m "feat: add SeveritySummary component"
```

---

### Task 15: Create InsightFilters component

**Files:**
- Create: `src/components/editor/RightSidebar/InsightFilters.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/editor/RightSidebar/InsightFilters.tsx`:

```typescript
import type { InsightCategory, Severity } from '../../../types/insights'

const CATEGORY_LABELS: Record<InsightCategory, string> = {
  utilization: 'Utilization',
  proximity: 'Team Proximity',
  onboarding: 'Onboarding',
  moves: 'Moves',
  equipment: 'Equipment',
  trends: 'Trends',
}

const SEVERITY_COLORS: Record<Severity, { bg: string; text: string; ring: string }> = {
  critical: { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-300' },
  warning: { bg: 'bg-yellow-100', text: 'text-yellow-700', ring: 'ring-yellow-300' },
  info: { bg: 'bg-blue-100', text: 'text-blue-700', ring: 'ring-blue-300' },
}

interface InsightFiltersProps {
  activeCategories: Set<InsightCategory>
  activeSeverities: Set<Severity>
  onToggleCategory: (category: InsightCategory) => void
  onToggleSeverity: (severity: Severity) => void
}

export function InsightFilters({
  activeCategories,
  activeSeverities,
  onToggleCategory,
  onToggleSeverity,
}: InsightFiltersProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* Severity toggles */}
      <div className="flex gap-1.5">
        {(['critical', 'warning', 'info'] as Severity[]).map((sev) => {
          const active = activeSeverities.has(sev)
          const colors = SEVERITY_COLORS[sev]
          return (
            <button
              key={sev}
              onClick={() => onToggleSeverity(sev)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                active
                  ? `${colors.bg} ${colors.text} ring-1 ${colors.ring}`
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {sev.charAt(0).toUpperCase() + sev.slice(1)}
            </button>
          )
        })}
      </div>

      {/* Category filter dropdown */}
      <div className="flex gap-1 flex-wrap">
        {(Object.entries(CATEGORY_LABELS) as [InsightCategory, string][]).map(
          ([cat, label]) => {
            const active = activeCategories.has(cat)
            return (
              <button
                key={cat}
                onClick={() => onToggleCategory(cat)}
                className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
                  active
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-gray-50 text-gray-400'
                }`}
              >
                {label}
              </button>
            )
          }
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/RightSidebar/InsightFilters.tsx
git commit -m "feat: add InsightFilters component"
```

---

### Task 16: Create InsightCard component

**Files:**
- Create: `src/components/editor/RightSidebar/InsightCard.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/editor/RightSidebar/InsightCard.tsx`:

```typescript
import { X } from 'lucide-react'
import type { Insight, Severity } from '../../../types/insights'

const BORDER_COLORS: Record<Severity, string> = {
  critical: 'border-l-red-500',
  warning: 'border-l-yellow-500',
  info: 'border-l-blue-500',
}

const BADGE_COLORS: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-700',
  warning: 'bg-yellow-100 text-yellow-700',
  info: 'bg-blue-100 text-blue-700',
}

interface InsightCardProps {
  insight: Insight
  onDismiss: (id: string) => void
  onAction: (insightId: string, actionIndex: number) => void
  onClick: (insight: Insight) => void
}

export function InsightCard({ insight, onDismiss, onAction, onClick }: InsightCardProps) {
  return (
    <div
      className={`relative border-l-4 ${BORDER_COLORS[insight.severity]} bg-white rounded-r-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer`}
      onClick={() => onClick(insight)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${BADGE_COLORS[insight.severity]}`}>
            {insight.severity.toUpperCase()}
          </span>
          <span className="text-xs text-gray-400">{insight.category}</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDismiss(insight.id)
          }}
          className="p-0.5 text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>

      {/* Title */}
      <h4 className="text-sm font-semibold text-gray-800 mb-1">{insight.title}</h4>

      {/* Narrative */}
      <p className="text-xs text-gray-500 leading-relaxed mb-2">{insight.narrative}</p>

      {/* Actions */}
      {insight.actions.length > 0 && (
        <div className="flex gap-1.5">
          {insight.actions.map((action, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation()
                onAction(insight.id, i)
              }}
              className="px-2.5 py-1 text-xs font-medium border border-gray-200 rounded hover:bg-gray-50 transition-colors text-gray-600"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/RightSidebar/InsightCard.tsx
git commit -m "feat: add InsightCard component"
```

---

### Task 17: Create InsightsPanel (main container)

**Files:**
- Create: `src/components/editor/RightSidebar/InsightsPanel.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/editor/RightSidebar/InsightsPanel.tsx`:

```typescript
import { useEffect, useCallback, useRef } from 'react'
import { RefreshCw, CheckCircle } from 'lucide-react'
import { useInsightsStore } from '../../../stores/insightsStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useShallow } from 'zustand/react/shallow'
import { SeveritySummary } from './SeveritySummary'
import { InsightFilters } from './InsightFilters'
import { InsightCard } from './InsightCard'
import type { Insight } from '../../../types/insights'

export function InsightsPanel() {
  const elements = useElementsStore((s) => s.elements)
  const employees = useEmployeeStore((s) => s.employees)

  const {
    lastAnalyzedAt,
    isAnalyzing,
    runAnalysis,
    dismissInsight,
    restoreInsight,
    toggleCategory,
    toggleSeverity,
    getFilteredInsights,
    getCounts,
    filter,
  } = useInsightsStore(
    useShallow((s) => ({
      lastAnalyzedAt: s.lastAnalyzedAt,
      isAnalyzing: s.isAnalyzing,
      runAnalysis: s.runAnalysis,
      dismissInsight: s.dismissInsight,
      restoreInsight: s.restoreInsight,
      toggleCategory: s.toggleCategory,
      toggleSeverity: s.toggleSeverity,
      getFilteredInsights: s.getFilteredInsights,
      getCounts: s.getCounts,
      filter: s.filter,
    }))
  )

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerAnalysis = useCallback(() => {
    const elementsList = Object.values(elements)
    const employeesList = Object.values(employees)
    runAnalysis(elementsList, employeesList)
  }, [elements, employees, runAnalysis])

  // Debounced reactive analysis
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(triggerAnalysis, 500)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [triggerAnalysis])

  const filtered = getFilteredInsights()
  const dismissed = useInsightsStore((s) => s.insights.filter((i) => i.dismissed))
  const counts = getCounts()

  const handleAction = (_insightId: string, _actionIndex: number) => {
    // Action execution will be wired to canvas navigation/assignment in future tasks
  }

  const handleCardClick = (_insight: Insight) => {
    // Highlight related elements on canvas — future wire-up
  }

  const lastAnalyzedLabel = lastAnalyzedAt
    ? `${Math.round((Date.now() - lastAnalyzedAt) / 1000)}s ago`
    : 'never'

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Severity summary */}
      <SeveritySummary
        critical={counts.critical}
        warning={counts.warning}
        info={counts.info}
      />

      {/* Filters */}
      <InsightFilters
        activeCategories={filter.categories}
        activeSeverities={filter.severities}
        onToggleCategory={toggleCategory}
        onToggleSeverity={toggleSeverity}
      />

      {/* Insight cards */}
      <div className="flex-1 overflow-y-auto -mx-3 px-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle size={32} className="text-green-400 mb-3" />
            <p className="text-sm font-medium text-gray-600">All clear</p>
            <p className="text-xs text-gray-400 mt-1">No issues detected. Your office layout looks good.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onDismiss={dismissInsight}
                onAction={handleAction}
                onClick={handleCardClick}
              />
            ))}
          </div>
        )}

        {/* Dismissed section */}
        {dismissed.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => useInsightsStore.getState().setShowDismissed(!filter.showDismissed)}
              className="text-xs text-gray-400 hover:text-gray-600 mb-2"
            >
              {filter.showDismissed ? 'Hide' : 'Show'} dismissed ({dismissed.length})
            </button>
            {filter.showDismissed && (
              <div className="flex flex-col gap-2 opacity-60">
                {dismissed.map((insight) => (
                  <div
                    key={insight.id}
                    className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded text-xs text-gray-500"
                  >
                    <span className="truncate">{insight.title}</span>
                    <button
                      onClick={() => restoreInsight(insight.id)}
                      className="ml-2 text-blue-500 hover:text-blue-700 flex-shrink-0"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[10px] text-gray-400">
        <span>Last analyzed: {lastAnalyzedLabel}</span>
        <button
          onClick={triggerAnalysis}
          disabled={isAnalyzing}
          className="flex items-center gap-1 text-gray-400 hover:text-gray-600 disabled:opacity-40"
        >
          <RefreshCw size={10} className={isAnalyzing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/RightSidebar/InsightsPanel.tsx
git commit -m "feat: add InsightsPanel with reactive analysis and card rendering"
```

---

### Task 18: Add badge count to Insights tab

**Files:**
- Modify: `src/components/editor/RightSidebar/RightSidebar.tsx`

- [ ] **Step 1: Add badge to the Insights tab button**

In `src/components/editor/RightSidebar/RightSidebar.tsx`, import the insights store and show a badge:

Add at top:

```typescript
import { useInsightsStore } from '../../../stores/insightsStore'
```

Inside the `RightSidebar` component, before the return:

```typescript
  const insightCounts = useInsightsStore((s) => s.getCounts())
  const badgeCount = insightCounts.critical + insightCounts.warning
```

Replace the tab button rendering to add a badge for the insights tab. Change the tab map function:

```typescript
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-2.5 text-xs font-medium transition-colors relative ${
              tab === t.id
                ? 'text-blue-700 border-b-2 border-blue-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.id === 'insights' && badgeCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full">
                {badgeCount}
              </span>
            )}
          </button>
        ))}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/RightSidebar/RightSidebar.tsx
git commit -m "feat: add badge count for critical+warning insights on tab"
```

---

## Phase 5: Final Verification

### Task 19: Run all tests and build

**Files:** None — verification only.

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All analyzer tests pass (utilization, proximity, onboarding, equipment, moves, trends, coordinator).

- [ ] **Step 2: Run type check**

Run: `npx tsc -b --noEmit`
Expected: No type errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: No lint errors (fix any that appear).

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve any lint/type issues from insights feature"
```
