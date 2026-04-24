/**
 * Command-palette action catalogue builder.
 *
 * Pure-ish helper that takes a snapshot of the stores + router context and
 * returns the flat `CommandItem[]` the palette renders. Split into its own
 * `.ts` module (no JSX, no component export) so `react-refresh/only-export-components`
 * stays happy and so the builder is trivial to unit-test in isolation.
 *
 * The `run()` closures reach back into the live stores via `getState()` at
 * fire-time (not capture-time) — that way the palette stays correct even
 * if the user opens it, lets a store mutate in the background, and only
 * then hits Enter. Navigation actions keep the bound `navigate` / slugs
 * because those only make sense in the render context that built the list.
 */
import type { NavigateFunction } from 'react-router-dom'
import type { Employee } from '../../types/employee'
import type { CanvasElement } from '../../types/elements'
import type { Floor } from '../../types/floor'
import type { ToolType } from '../../stores/canvasStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useUIStore } from '../../stores/uiStore'
import { useFloorStore } from '../../stores/floorStore'
import { switchToFloor } from '../../lib/seatAssignment'
import { focusOnElement } from '../../lib/canvasFocus'
import type { CommandItem } from '../../lib/commandPaletteFilter'

/** People section cap — keeps the list bounded for very large rosters. */
export const MAX_PEOPLE_RESULTS = 8

/** Elements section cap — labeled elements can multiply fast on big floors. */
export const MAX_ELEMENT_RESULTS = 20

/**
 * Stable metadata for each tool row. Mirrors the left-sidebar picker.
 *
 * Note: there is no standalone "workstation" tool — workstation elements
 * are stamped from the Library, not drawn with a dedicated tool. The
 * palette therefore doesn't include a Workstation row; users reach it
 * via the Library.
 */
export const TOOL_CHOICES: { id: ToolType; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'pan', label: 'Pan' },
  { id: 'wall', label: 'Wall' },
  { id: 'door', label: 'Door' },
  { id: 'window', label: 'Window' },
  { id: 'rect-shape', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'line-shape', label: 'Line' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'free-text', label: 'Text' },
  { id: 'measure', label: 'Measure' },
  { id: 'neighborhood', label: 'Neighborhood' },
]

export interface BuildCommandItemsInput {
  /** Ordered floor list (caller can sort however it wants; we preserve). */
  floors: Floor[]
  /** Employee map — already redacted if the viewer lacks PII permission. */
  employees: Record<string, Employee>
  /** Live elements on the ACTIVE floor — used for "Find element". */
  activeFloorElements: Record<string, CanvasElement>
  /** Current query — used to pre-filter the People and Elements slices
   *  so caps apply to the matching subset, not the first N overall. */
  query: string
  /** React-router navigate fn, for Navigation / Find-seat rows. */
  navigate: NavigateFunction
  /** Current team / office slugs — Navigate rows need both. */
  teamSlug?: string
  officeSlug?: string
  /** Close the palette — every run() fires this at the end. */
  close: () => void
  /** Current presentation-mode flag, so the label can flip. */
  presentationMode: boolean
}

/**
 * Build the full catalogue. Order within the flat list mirrors the
 * `SECTION_ORDER` render order in `commandPaletteFilter.ts` so grouping
 * the filtered result keeps sections adjacent without a second sort.
 */
export function buildCommandItems(input: BuildCommandItemsInput): CommandItem[] {
  const {
    floors,
    employees,
    activeFloorElements,
    query,
    navigate,
    teamSlug,
    officeSlug,
    close,
    presentationMode,
  } = input
  const out: CommandItem[] = []
  const basePath = teamSlug && officeSlug ? `/t/${teamSlug}/o/${officeSlug}` : null
  const q = query.trim().toLowerCase()

  // --- Floors --------------------------------------------------------------
  // One row per floor. Dispatches through `switchToFloor` (seatAssignment
  // helper) so the active-floor swap and element rehydration travel as one
  // atomic operation — selecting a floor from the palette should feel
  // identical to clicking the floor switcher.
  const sortedFloors = [...floors].sort((a, b) => a.order - b.order)
  for (const floor of sortedFloors) {
    out.push({
      id: `floor-${floor.id}`,
      section: 'floors',
      label: `Go to floor: ${floor.name}`,
      subtitle: 'Floor',
      run: () => {
        switchToFloor(floor.id)
        close()
      },
    })
  }

  // --- People — Find seat --------------------------------------------------
  // Only employees with a seat. Navigates to the owning floor, selects the
  // seat, and pans the viewport to it — mirrors MapView's `?focus=` effect.
  const seatedEmployees = Object.values(employees).filter(
    (e) => e.seatId !== null && e.floorId !== null,
  )
  const matchingSeated = q
    ? seatedEmployees.filter((e) => e.name.toLowerCase().includes(q))
    : seatedEmployees
  for (const emp of matchingSeated.slice(0, MAX_PEOPLE_RESULTS)) {
    const deptTag = emp.department ? ` (${emp.department})` : ''
    out.push({
      id: `person-${emp.id}`,
      section: 'people',
      label: `Find ${emp.name}${deptTag}`,
      subtitle: 'Seat',
      run: () => {
        if (emp.seatId === null || emp.floorId === null) return close()
        switchToFloor(emp.floorId)
        // Read the destination floor's elements AFTER the switch so we
        // see the just-rehydrated map (the live `elementsStore.elements`
        // now reflects `emp.floorId`).
        const target = useFloorStore
          .getState()
          .floors.find((f) => f.id === emp.floorId)
        const seatEl = target?.elements[emp.seatId]
        if (seatEl) {
          useUIStore.getState().setSelectedIds([emp.seatId])
          focusOnElement(
            { x: seatEl.x, y: seatEl.y, width: seatEl.width, height: seatEl.height },
            emp.seatId,
          )
        }
        close()
      },
    })
  }

  // --- Elements — Find element ---------------------------------------------
  // One row per named element on the active floor. Elements with empty
  // labels are skipped so the list doesn't fill up with anonymous walls.
  const labeledElements = Object.values(activeFloorElements).filter(
    (el) => typeof el.label === 'string' && el.label.trim() !== '',
  )
  const matchingElements = q
    ? labeledElements.filter((el) => el.label.toLowerCase().includes(q))
    : labeledElements
  for (const el of matchingElements.slice(0, MAX_ELEMENT_RESULTS)) {
    out.push({
      id: `element-${el.id}`,
      section: 'elements',
      label: `Find ${el.label}`,
      subtitle: prettyElementType(el.type),
      run: () => {
        useUIStore.getState().setSelectedIds([el.id])
        focusOnElement(
          { x: el.x, y: el.y, width: el.width, height: el.height },
          el.id,
        )
        close()
      },
    })
  }

  // --- Navigation ----------------------------------------------------------
  if (basePath) {
    out.push(
      {
        id: 'nav-map',
        section: 'navigate',
        label: 'Go to Map',
        subtitle: 'Navigation',
        run: () => {
          navigate(`${basePath}/map`)
          close()
        },
      },
      {
        id: 'nav-roster',
        section: 'navigate',
        label: 'Open Roster',
        subtitle: 'Navigation',
        run: () => {
          navigate(`${basePath}/roster`)
          close()
        },
      },
      {
        id: 'nav-reports',
        section: 'navigate',
        label: 'Open Reports',
        subtitle: 'Navigation',
        run: () => {
          navigate(`${basePath}/reports`)
          close()
        },
      },
    )
  }
  if (teamSlug) {
    out.push({
      id: 'nav-team-settings',
      section: 'navigate',
      label: 'Go to Team Settings',
      subtitle: 'Navigation',
      run: () => {
        navigate(`/t/${teamSlug}/settings`)
        close()
      },
    })
  }
  out.push({
    id: 'nav-help',
    section: 'navigate',
    label: 'Open Help',
    subtitle: 'Navigation',
    run: () => {
      navigate('/help')
      close()
    },
  })

  // --- View toggles --------------------------------------------------------
  out.push(
    {
      id: 'view-toggle-grid',
      section: 'view',
      label: 'Toggle grid',
      subtitle: 'View',
      run: () => {
        useCanvasStore.getState().toggleGrid()
        close()
      },
    },
    {
      id: 'view-toggle-dimensions',
      section: 'view',
      label: 'Toggle dimensions',
      subtitle: 'View',
      run: () => {
        useCanvasStore.getState().toggleDimensions()
        close()
      },
    },
    {
      id: 'view-zoom-in',
      section: 'view',
      label: 'Zoom in',
      subtitle: 'View',
      run: () => {
        useCanvasStore.getState().zoomIn()
        close()
      },
    },
    {
      id: 'view-zoom-out',
      section: 'view',
      label: 'Zoom out',
      subtitle: 'View',
      run: () => {
        useCanvasStore.getState().zoomOut()
        close()
      },
    },
    {
      id: 'view-zoom-reset',
      section: 'view',
      label: 'Reset zoom',
      subtitle: 'View',
      run: () => {
        useCanvasStore.getState().resetZoom()
        close()
      },
    },
  )

  // --- Tools ---------------------------------------------------------------
  for (const tool of TOOL_CHOICES) {
    out.push({
      id: `tool-${tool.id}`,
      section: 'tools',
      label: `Switch to tool: ${tool.label}`,
      subtitle: 'Tool',
      run: () => {
        useCanvasStore.getState().setActiveTool(tool.id)
        close()
      },
    })
  }

  // --- Actions (presentation + export) -------------------------------------
  out.push({
    id: 'action-presentation',
    section: 'actions',
    label: presentationMode
      ? 'Exit presentation mode'
      : 'Enter presentation mode',
    subtitle: 'Action',
    run: () => {
      useUIStore.getState().setPresentationMode(!presentationMode)
      close()
    },
  })
  out.push({
    id: 'action-export',
    section: 'actions',
    label: 'Export PDF',
    subtitle: 'Action',
    run: () => {
      useUIStore.getState().setExportDialogOpen(true)
      close()
    },
  })
  out.push({
    id: 'action-export-png',
    section: 'actions',
    label: 'Export PNG',
    subtitle: 'Action',
    run: () => {
      useUIStore.getState().setExportDialogOpen(true)
      close()
    },
  })

  return out
}

/**
 * Friendly element-type label for the right-side hint. Falls back to the
 * raw type when we don't have a curated string — better to show the
 * internal enum than an empty chip.
 */
function prettyElementType(type: string): string {
  switch (type) {
    case 'desk':
      return 'Desk'
    case 'hot-desk':
      return 'Hot desk'
    case 'workstation':
      return 'Workstation'
    case 'private-office':
      return 'Private office'
    case 'conference-room':
      return 'Conference room'
    case 'phone-booth':
      return 'Phone booth'
    case 'common-area':
      return 'Common area'
    case 'table-rect':
    case 'table-conference':
    case 'table-round':
    case 'table-oval':
      return 'Table'
    case 'text-label':
    case 'free-text':
      return 'Text'
    case 'wall':
      return 'Wall'
    case 'door':
      return 'Door'
    case 'window':
      return 'Window'
    default:
      return type
  }
}
