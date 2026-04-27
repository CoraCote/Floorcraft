import type { CanvasElement } from '../../types/elements'
import type { Employee } from '../../types/employee'
import type { Floor } from '../../types/floor'
import type { Neighborhood } from '../../types/neighborhood'
import type { Annotation } from '../../types/annotations'
import { DEFAULT_CANVAS_SETTINGS } from '../../types/project'
import demoSeedRaw from './demo-office-seed.json'

/**
 * Serialized shape the Supabase `offices.payload` column holds.
 * Mirrors what `useOfficeSync.buildCurrentPayload` writes and what
 * `ProjectShell` hydrates from on load. If those shapes drift, the
 * demo will still save but fail to rehydrate cleanly, so keeping them
 * in lockstep matters.
 */
export interface DemoOfficePayload {
  version: 2
  elements: Record<string, CanvasElement>
  employees: Record<string, Employee>
  departmentColors: Record<string, string>
  floors: Floor[]
  activeFloorId: string
  settings: typeof DEFAULT_CANVAS_SETTINGS
  neighborhoods: Record<string, Neighborhood>
  annotations: Record<string, Annotation>
}

/**
 * Shape of the JSON exported by the editor's File → Export → JSON
 * Project Data action (see `ExportDialog.handleExportJSON`). The
 * exporter writes a flat array for `elements` (the active floor's
 * live working set) and `employees`, but per-floor snapshots are
 * stored as an `id → element` dictionary. We reshape both into the
 * `Record<id, T>` form `ProjectShell` hydrates from before returning.
 *
 * The exporter intentionally does NOT include `activeFloorId`,
 * `neighborhoods`, `annotations`, or `departmentColors` — those are
 * derived or defaulted at load time. We do the same here.
 */
interface DemoSeedJSON {
  version: string
  project: { name: string; settings: Partial<typeof DEFAULT_CANVAS_SETTINGS> }
  elements: CanvasElement[]
  employees: Employee[]
  floors: Floor[]
  exportedAt: string
}

const seed = demoSeedRaw as unknown as DemoSeedJSON

/**
 * Palette used when deriving department colors from the seed's
 * employee list. Same hues as the previous programmatic demo so a
 * user who's been using the demo doesn't see colors flip
 * unexpectedly. First-seen-first-coloured (alphabetical for
 * stability across reloads).
 */
const DEPARTMENT_PALETTE: readonly string[] = [
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#EC4899', // pink
  '#14B8A6', // teal
  '#0EA5E9', // sky
  '#84CC16', // lime
  '#F97316', // orange
] as const

/**
 * Pick the active floor for first paint. Engineering has the densest
 * content + most assignments, so opening on it gives the strongest
 * first impression of "yes this is a populated office plan." Falls
 * back to the first floor if no engineering label is present.
 */
function pickActiveFloor(floors: Floor[]): Floor {
  const eng = floors.find((f) => /engineering/i.test(f.name))
  return eng ?? floors[0]
}

/**
 * Derive a `department → hex` map from the seed's employees. Stable
 * alphabetical order so reloads paint the same colors. We honour any
 * department the seed already references — no manual curation list.
 */
function deriveDepartmentColors(
  employees: Record<string, Employee>,
): Record<string, string> {
  const departments = new Set<string>()
  for (const emp of Object.values(employees)) {
    if (emp.department) departments.add(emp.department)
  }
  const sorted = [...departments].sort()
  const map: Record<string, string> = {}
  sorted.forEach((dept, i) => {
    map[dept] = DEPARTMENT_PALETTE[i % DEPARTMENT_PALETTE.length]
  })
  return map
}

/**
 * Build the demo office payload that "Try sample office" / "Load
 * sample content" hydrate stores from. The actual content is the
 * user's curated `demo-office-seed.json` — exported via File → Export
 * → JSON Project Data from the canonical demo office at
 * `/t/aircall/o/demo-office-scPxiS`. To refresh the demo, re-export
 * that office and overwrite `demo-office-seed.json` — no code
 * changes required.
 *
 * The function reshapes the export's flat arrays into the
 * `Record<id, T>` form the live stores expect, picks the engineering
 * floor as the default active surface, and derives department colors
 * from whichever departments appear in the seeded employees.
 */
export function buildDemoOfficePayload(): DemoOfficePayload {
  // Employees: array → dict keyed by id.
  const employees: Record<string, Employee> = {}
  for (const emp of seed.employees) {
    employees[emp.id] = emp
  }

  // Floors come through as-is — each `floor.elements` is already a
  // dict in the export shape.
  const floors: Floor[] = seed.floors

  const activeFloor = pickActiveFloor(floors)

  // The top-level `elements` field MUST mirror the active floor's
  // elements (matching the live-app contract enforced by `ProjectShell`
  // and `switchToFloor` — see PR #135 for the regression that
  // motivated this contract). The export's `elements` array IS the
  // active floor's elements, but we re-derive from `activeFloor`
  // anyway so the field is internally consistent regardless of which
  // floor the export was made on.
  const elements: Record<string, CanvasElement> = { ...activeFloor.elements }

  const departmentColors = deriveDepartmentColors(employees)

  return {
    version: 2,
    elements,
    employees,
    departmentColors,
    floors,
    activeFloorId: activeFloor.id,
    settings: {
      ...DEFAULT_CANVAS_SETTINGS,
      ...(seed.project.settings ?? {}),
    },
    // The export does not carry neighborhoods or annotations today.
    // Default to empty maps so the demo loads cleanly. If the
    // exported office grows neighborhoods or annotations, extend
    // `DemoSeedJSON` to include them and re-export.
    neighborhoods: {},
    annotations: {},
  }
}
