# Floocraft Office Pivot — Design Spec

**Date:** 2026-04-15
**Status:** Approved
**Approach:** Incremental refactor of existing codebase

## Overview

Pivot Floocraft from a generic floor plan / event seating tool to an office layout and employee seat management application. The core canvas engine (Konva, Zustand stores, pan/zoom/grid, drag-and-drop, selection, undo/redo, minimap, auto-save, keyboard shortcuts, wall drawing) is retained. All event/hospitality domain concepts are replaced with office/employee domain concepts.

**Primary users:**
- Facilities / office managers — plan where employees sit across multiple floors, handle desk moves, track who sits where
- HR / people ops — visualize team seating, onboard new hires to open seats, manage employee directory

## 1. Data Model

### 1.1 Employee (replaces Guest)

File: `src/types/employee.ts` (replaces `src/types/guests.ts`)

```typescript
interface Employee {
  id: string
  name: string
  email: string
  // Org structure
  department: string | null
  team: string | null
  title: string | null
  managerId: string | null       // references another Employee.id
  // Employment
  employmentType: 'full-time' | 'contractor' | 'part-time' | 'intern'
  officeDays: string[]            // e.g. ['Mon', 'Wed', 'Fri']
  startDate: string | null
  // Display
  photoUrl: string | null
  tags: string[]                  // e.g. ['standing-desk', 'accessibility', 'quiet-zone']
  // Assignment
  seatId: string | null           // element ID of assigned desk/office
  floorId: string | null          // which floor they're on
  createdAt: string
}

interface EmployeeImportRow {
  name: string
  email?: string
  department?: string
  team?: string
  title?: string
  manager?: string               // matched by name or email
  type?: string                  // full-time | contractor | part-time | intern
  office_days?: string           // comma-separated: "Mon,Wed,Fri"
  start_date?: string
  tags?: string                  // comma-separated
  [key: string]: string | undefined
}
```

### 1.2 Floor

File: `src/types/floor.ts`

```typescript
interface Floor {
  id: string
  name: string                   // e.g. "Floor 1", "Ground Floor"
  order: number                  // sort order in floor switcher
  elements: Record<string, CanvasElement>
}
```

Each floor owns its own elements map. Switching floors swaps which elements the canvas renders. The employee directory is project-wide and spans all floors.

### 1.3 Element Types (updated)

File: `src/types/elements.ts` (modified)

**Remove:** `table-round`, `table-banquet`, `stage`, `bar`, `reception`, `dance-floor`, `stool`, `podium`, `lectern`, `sofa`

**Keep:** `wall`, `door`, `window`, `chair`, `desk`, `counter`, `divider`, `planter`, `custom-shape`, `text-label`, `background-image`, `table-rect` (generic rectangular table for break rooms), `table-conference`

**Add:** `hot-desk`, `workstation`, `private-office`, `conference-room`, `phone-booth`, `common-area`

Updated type union:

```typescript
type ElementType =
  | 'wall' | 'door' | 'window'
  | 'desk' | 'hot-desk' | 'workstation' | 'private-office'
  | 'conference-room' | 'phone-booth' | 'common-area'
  | 'chair' | 'counter' | 'table-rect' | 'table-conference'
  | 'divider' | 'planter'
  | 'custom-shape' | 'text-label' | 'background-image'
```

**Assignable elements** (have seats for employees): `desk` (1 seat), `hot-desk` (1 seat), `workstation` (N seats), `private-office` (1-2 seats)

**Non-assignable elements** (spatial): `conference-room` (labeled with capacity), `phone-booth`, `common-area`, structural elements

### 1.4 Project (updated)

File: `src/types/project.ts` (modified)

```typescript
interface Project {
  id: string
  ownerId: string | null
  name: string
  slug: string
  sharePermission: 'private' | 'view' | 'comment' | 'edit'
  buildingName: string | null
  floors: Floor[]
  activeFloorId: string
  canvasSettings: CanvasSettings
  thumbnailUrl: string | null
  createdAt: string
  updatedAt: string
}
```

The single `canvasData` field is replaced by the `floors` array. `activeFloorId` tracks which floor is currently displayed.

## 2. UI Layout

### 2.1 Floor Switcher Bar

A horizontal tab bar rendered between the TopBar and the canvas. Shows one tab per floor, with the active floor highlighted in blue with an underline. An "+ Add Floor" button at the end creates a new empty floor. Right-clicking a floor tab shows options to rename or delete (with confirmation if it has elements).

Switching floors updates `activeFloorId` in the project store and swaps the elements store to the selected floor's elements map.

### 2.2 Left Sidebar — Element Library (updated)

Replace event-oriented categories with office categories:

**Workspaces:** Desk, Hot Desk, Workstation (Bench), Private Office
**Rooms:** Conference Room, Phone Booth, Common Area
**Structure:** Wall, Door, Window, Divider, Planter
**Other:** Chair, Counter, Table, Custom Shape, Text Label

### 2.3 Right Sidebar — Tabs

Replace current tabs (Properties, Guests, Comments, Versions) with:

- **Properties** — Same as current, adapted for new element types. Desk elements show a "Desk ID" field (e.g., "D-101") and an "Assigned To" display with a clear button.
- **People** — Employee management panel (replaces Guests tab). See Section 3.
- **Reports** — New tab housing all 7 report types. See Section 4.

### 2.4 Canvas Rendering Changes

**Desk rendering:** Desks display a colored border matching the assigned employee's department (auto-assigned from a 12-color palette). The desk shows the desk ID (e.g., "D-101"), the employee name, and the department in small text. Unassigned desks render with a dashed gray border and "Open" label.

**Conference rooms:** Rendered as labeled rectangles with the room name and capacity (e.g., "Maple Room · 8 seats"). Yellow/amber fill to visually distinguish from desks.

**Common areas:** Rendered with a light green fill and a label (e.g., "Kitchen", "Lounge").

### 2.5 Status Bar (updated)

Changes from "Total Seats / Assigned / Unassigned / Guests Without Seats" to:

**Desks: 47 · Assigned: 42 · Open: 5 · Occupancy: 89%**

Computed from assignable elements on the current floor.

## 3. People Panel

Replaces the GuestListPanel in the right sidebar.

### 3.1 Layout

- **Search bar** with a filter dropdown (department, team, employment type, tags, assignment status)
- **Quick filter pills:** All (count), Unassigned (count), New Hires (count — employees with start date within 30 days)
- **Employee list** grouped by department, each group collapsible with a header showing department name and count
- **Employee cards** show: avatar circle with initials (colored by department), name, title, assignment status (desk ID or "Unassigned" in red), and a green/red status dot
- **Drag-to-assign:** Employee cards are draggable (using dataTransfer with `application/employee-id`). Drop onto a desk on the canvas to assign.
- **Actions:** "+ Add Employee" button for inline add, "CSV Import" button opening the import dialog

### 3.2 CSV Import (updated)

The import dialog accepts CSV with flexible column name matching:

- name / full_name / employee_name
- email / email_address
- department / dept
- team / group
- title / role / job_title
- manager / manager_name / reports_to
- type / employment_type (defaults to "full-time")
- office_days / days / in_office (comma-separated)
- start_date / hire_date
- tags (comma-separated)

Preview table shows first 10 rows before import. Manager field matched by name or email against existing employees (unmatched managers set to null with a warning).

## 4. Reports & Views

All accessed from the Reports tab in the right sidebar. Each report is represented by a card; clicking it opens the report inline in the sidebar or as a modal/overlay depending on the report type.

### 4.1 Occupancy Dashboard

Renders inline in the sidebar. Shows:

- **Overall occupancy** as a large percentage number with color (green >80%, yellow 60-80%, red <60%)
- **Per-floor breakdown** with progress bars (each bar colored by occupancy level)
- **Per-department breakdown** showing department color dot, name, and "X/Y seats" count

All numbers are computed live from the employee and elements stores across all floors.

### 4.2 Employee Directory

Opens as a full-page modal overlay. Sortable, searchable table with columns:

| Name | Department | Team | Title | Floor | Desk | Manager | Type | Office Days | Tags |

Click any row to: close the modal, switch to that employee's floor, pan the canvas to center on their desk, and select the desk element. Search supports name, email, department, team, title, and tags.

### 4.3 Org Chart Overlay

A toggle in the Reports tab. When enabled, renders a Konva Layer on top of the canvas that draws dashed lines from each manager's desk to their direct reports' desks. Line color matches the department color. Only shows relationships where both manager and report are on the current floor. A small legend shows which color corresponds to which manager.

### 4.4 Move Planner

Entering Move Planner mode from the Reports tab activates a "draft" state:

- A yellow banner appears at the top: "Move Planner — Drag employees between desks to plan moves"
- Employee reassignments within this mode are tracked as pending moves, not applied immediately
- A panel shows the pending move list: "Jane Smith: D-101 → D-205", "Alex Lee: D-102 → D-301 (Floor 3)"
- Cross-floor moves are supported (the target desk's floor is noted)
- Two buttons: **Apply All** (commits all moves to the actual employee store) and **Discard** (reverts all pending changes)
- Exiting Move Planner mode without applying discards pending changes (with confirmation if moves exist)

### 4.5 Unassigned Report

Renders inline in the sidebar with two sections:

- **Employees without seats** — sorted by start date (upcoming new hires first), showing name, department, start date
- **Open desks** — grouped by floor, showing desk ID, location context

Clicking an employee highlights them; clicking an open desk while an employee is highlighted offers to assign them. Open desks on the current floor are highlighted on the canvas with a pulsing green outline.

### 4.6 Seat Map (Color Mode)

A canvas overlay mode toggled from the Reports tab. When active, all assignable elements are filled with solid colors based on a selected dimension:

- **By Department** (default) — each desk colored by the assigned employee's department
- **By Team** — colored by team
- **By Employment Type** — full-time, contractor, part-time, intern each get a color
- **By Office Days** — heatmap showing which desks are occupied on which days

A dropdown selects the dimension. A legend panel shows the color mapping. Unassigned desks appear in light gray.

### 4.7 Export (updated)

Replaces the current generic export dialog. Options:

- **PDF Floor Plan** — One page per floor. Desks annotated with employee names and desk IDs. Department color legend included. Title and building name in header.
- **CSV Employee Roster** — All employees with columns: Name, Email, Department, Team, Title, Floor, Desk, Manager, Employment Type, Office Days, Start Date, Tags
- **JSON Project Data** — Full project serialization including all floors, elements, and employee assignments

## 5. Templates

Replace all existing templates (wedding-reception, corporate-boardroom, fine-dining) with:

### 5.1 Open Plan Office

~40 desks in clusters of 4-6, 2 conference rooms along walls, 2 phone booths in corners, 1 kitchen/lounge common area. Single floor.

### 5.2 Mixed Office

6 private offices along the perimeter (for managers), ~30 open desks in center clusters, 2 conference rooms, 2 phone booths, 1 reception common area. Single floor.

### 5.3 Executive Floor

12 larger private offices, 1 boardroom (conference room, 16 seats), 1 executive lounge (common area), 1 admin desk cluster of 8 desks. Single floor.

## 6. Landing Page & Branding

### 6.1 Terminology Changes

- "Guest" → "Employee" (all code, UI text, variable names)
- "Seating chart" → "Seat map" or "Office plan"
- "Floor plan" stays (still accurate)
- "Floocraft" name stays

### 6.2 Landing Page Updates

- Hero heading: "Floocraft" (unchanged)
- Hero subtext: "Plan your office layout, manage employee seating, and track space utilization. All in one interactive tool."
- CTA button: "Create an Office Plan"
- Template section: "Or start from a template" with the 3 office templates
- Footer: "Floocraft — Office layout & seat management"

## 7. What's NOT in Scope

- Hot desk booking system (future — v1 is permanent assignments only)
- Supabase / database integration
- Real-time collaboration
- Authentication / multi-user
- Version history with restore
- Background image upload and tracing
- Actual org chart visualization (tree view) — only the overlay lines on the floor plan
