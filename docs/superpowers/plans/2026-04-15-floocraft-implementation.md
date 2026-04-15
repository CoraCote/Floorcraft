# Floocraft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully interactive browser-based floor plan and seating chart application with real-time collaboration.

**Architecture:** React SPA with Konva.js canvas, Zustand state management with undo/redo, Supabase for auth/DB/realtime/storage, Yjs CRDTs for conflict-free collaboration. Split-panel editor layout with left toolbox, central canvas, collapsible right properties panel.

**Tech Stack:** React 18, TypeScript, Vite, Konva.js/react-konva, Zustand/zundo, TailwindCSS, Radix UI, Supabase, Yjs, React Router v7, jsPDF, Papa Parse

**Spec:** `docs/superpowers/specs/2026-04-15-floocraft-design.md`

---

## File Structure

```
src/
├── main.tsx
├── App.tsx
├── index.css                         # Tailwind directives + global styles
├── types/
│   ├── elements.ts                   # BaseElement, WallElement, TableElement, etc.
│   ├── guests.ts                     # Guest, SeatPosition
│   ├── project.ts                    # Project, ProjectVersion, CanvasSettings
│   └── collaboration.ts             # CursorInfo, Comment, Presence
├── lib/
│   ├── constants.ts                  # Colors, grid defaults, element defaults
│   ├── geometry.ts                   # Snap, alignment, distance helpers
│   ├── seatLayout.ts                 # Compute seat positions for table types
│   ├── slug.ts                       # Random slug generator
│   ├── csv.ts                        # CSV parse/export with Papa Parse
│   ├── exportPng.ts                  # PNG export from Konva stage
│   ├── exportPdf.ts                  # PDF export with jsPDF
│   ├── exportJson.ts                 # JSON project backup
│   ├── supabase.ts                   # Supabase client init
│   └── yjs.ts                        # Yjs doc + provider setup
├── stores/
│   ├── elementsStore.ts              # Canvas elements CRUD + undo/redo
│   ├── canvasStore.ts                # Zoom, pan, grid, active tool
│   ├── seatingStore.ts               # Guest list, seat assignments
│   ├── uiStore.ts                    # Panels, modals, selection state
│   ├── projectStore.ts               # Project metadata, versions
│   └── collaborationStore.ts         # Presence, cursors, comments
├── hooks/
│   ├── useCanvasInteraction.ts       # Pan, zoom handlers
│   ├── useWallDrawing.ts             # Wall tool state machine
│   ├── useElementDrag.ts             # Drag + snap + alignment guides
│   ├── useKeyboardShortcuts.ts       # Global keyboard handler
│   ├── useAutoSave.ts                # Debounced save to localStorage/Supabase
│   ├── useYjsSync.ts                 # Yjs <-> Zustand bridge
│   └── usePresence.ts                # Supabase Presence
├── components/
│   ├── editor/
│   │   ├── EditorPage.tsx            # Main 3-panel editor layout
│   │   ├── TopBar.tsx                # Project name, undo/redo, zoom, share, export
│   │   ├── LeftSidebar/
│   │   │   ├── ToolSelector.tsx      # Tool radio buttons
│   │   │   └── ElementLibrary.tsx    # Draggable furniture catalog
│   │   ├── Canvas/
│   │   │   ├── CanvasStage.tsx       # Konva Stage wrapper, pan/zoom
│   │   │   ├── GridLayer.tsx         # Dot/line grid
│   │   │   ├── BackgroundLayer.tsx   # Background image
│   │   │   ├── ElementRenderer.tsx   # Dispatches element type -> shape
│   │   │   ├── WallRenderer.tsx      # Wall polyline rendering
│   │   │   ├── TableRenderer.tsx     # Table + seat circles
│   │   │   ├── FurnitureRenderer.tsx # Generic furniture shapes
│   │   │   ├── DoorRenderer.tsx      # Door arc + wall gap
│   │   │   ├── WindowRenderer.tsx    # Window dashed segment
│   │   │   ├── SeatLabelsLayer.tsx   # Guest name labels on seats
│   │   │   ├── SelectionOverlay.tsx  # Selection box + handles
│   │   │   ├── AlignmentGuides.tsx   # Smart snap guides
│   │   │   ├── DimensionOverlay.tsx  # Live measurement labels
│   │   │   ├── WallDrawingOverlay.tsx# Ghost wall during drawing
│   │   │   ├── CursorsLayer.tsx      # Collaborator cursors
│   │   │   └── CommentsLayer.tsx     # Pinned comment icons
│   │   ├── RightSidebar/
│   │   │   ├── RightSidebar.tsx      # Tab container
│   │   │   ├── PropertiesPanel.tsx   # Selected element properties
│   │   │   ├── GuestListPanel.tsx    # Guest list with search/sort
│   │   │   ├── CSVImportDialog.tsx   # CSV upload + column mapping
│   │   │   ├── SeatAssignPopover.tsx # Click-to-assign popover
│   │   │   ├── TableViewPanel.tsx    # Per-table seat list
│   │   │   ├── CommentsPanel.tsx     # Threaded comments
│   │   │   └── VersionHistoryPanel.tsx
│   │   ├── Minimap.tsx
│   │   ├── StatusBar.tsx             # Seat counts
│   │   ├── ContextMenu.tsx           # Right-click menu
│   │   ├── ShareModal.tsx
│   │   ├── ExportDialog.tsx
│   │   └── KeyboardShortcutsOverlay.tsx
│   ├── dashboard/
│   │   ├── DashboardPage.tsx
│   │   ├── ProjectCard.tsx
│   │   └── NewProjectModal.tsx       # Template picker
│   ├── auth/
│   │   ├── AuthProvider.tsx
│   │   ├── LoginModal.tsx
│   │   └── SignUpPrompt.tsx
│   ├── presentation/
│   │   └── PresentationMode.tsx
│   ├── embed/
│   │   └── EmbedView.tsx
│   └── landing/
│       └── LandingPage.tsx
├── data/
│   └── templates/
│       ├── index.ts
│       ├── wedding-reception.ts
│       ├── corporate-boardroom.ts
│       └── fine-dining.ts
```

---

## Phase 1: Project Scaffolding & Core Types

### Task 1: Scaffold Vite + React + TypeScript project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `index.html`

- [ ] **Step 1: Initialize Vite project**

```bash
cd /Users/robertcasto/Floocraft2
npm create vite@latest . -- --template react-ts
```

Select "React" and "TypeScript" if prompted. If directory is non-empty, confirm overwrite.

- [ ] **Step 2: Install core dependencies**

```bash
npm install react-konva konva zustand zundo @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-context-menu @radix-ui/react-tabs react-router-dom nanoid papaparse jspdf @tanstack/react-virtual lucide-react
npm install -D tailwindcss @tailwindcss/vite @types/papaparse
```

- [ ] **Step 3: Configure Tailwind**

Replace `src/index.css` with:

```css
@import "tailwindcss";
```

Update `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

- [ ] **Step 4: Set up base App with router**

Replace `src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div className="flex items-center justify-center h-screen text-2xl font-bold">Floocraft</div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

Replace `src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 5: Verify it runs**

```bash
npm run dev
```

Expected: Dev server starts, browser shows "Floocraft" centered on page.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite + React + TypeScript project with Tailwind and dependencies"
```

---

### Task 2: Define core TypeScript types

**Files:**
- Create: `src/types/elements.ts`, `src/types/guests.ts`, `src/types/project.ts`, `src/types/collaboration.ts`

- [ ] **Step 1: Create element types**

Create `src/types/elements.ts`:

```typescript
export type ElementType =
  | 'wall'
  | 'room'
  | 'door'
  | 'window'
  | 'table-round'
  | 'table-rect'
  | 'table-banquet'
  | 'table-conference'
  | 'chair'
  | 'sofa'
  | 'desk'
  | 'counter'
  | 'stage'
  | 'bar'
  | 'reception'
  | 'dance-floor'
  | 'custom-shape'
  | 'text-label'
  | 'background-image'
  | 'divider'
  | 'planter'
  | 'stool'
  | 'podium'
  | 'lectern'

export interface ElementStyle {
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
}

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
  style: ElementStyle
}

export interface WallElement extends BaseElement {
  type: 'wall'
  points: number[]
  thickness: number
  connectedWallIds: string[]
}

export interface DoorElement extends BaseElement {
  type: 'door'
  parentWallId: string
  positionOnWall: number
  swingDirection: 'left' | 'right' | 'both'
  openAngle: number
}

export interface WindowElement extends BaseElement {
  type: 'window'
  parentWallId: string
  positionOnWall: number
}

export interface SeatPosition {
  id: string
  offsetX: number
  offsetY: number
  rotation: number
  assignedGuestId: string | null
}

export type TableType = 'table-round' | 'table-rect' | 'table-banquet' | 'table-conference'

export interface TableElement extends BaseElement {
  type: TableType
  seatCount: number
  seatLayout: 'around' | 'one-side' | 'both-sides' | 'u-shape'
  seats: SeatPosition[]
}

export interface BackgroundImageElement extends BaseElement {
  type: 'background-image'
  storageUrl: string
  originalWidth: number
  originalHeight: number
}

export type CanvasElement =
  | WallElement
  | DoorElement
  | WindowElement
  | TableElement
  | BackgroundImageElement
  | BaseElement

export function isWallElement(el: CanvasElement): el is WallElement {
  return el.type === 'wall'
}

export function isDoorElement(el: CanvasElement): el is DoorElement {
  return el.type === 'door'
}

export function isWindowElement(el: CanvasElement): el is WindowElement {
  return el.type === 'window'
}

export function isTableElement(el: CanvasElement): el is TableElement {
  return (
    el.type === 'table-round' ||
    el.type === 'table-rect' ||
    el.type === 'table-banquet' ||
    el.type === 'table-conference'
  )
}

export function isBackgroundImageElement(el: CanvasElement): el is BackgroundImageElement {
  return el.type === 'background-image'
}
```

- [ ] **Step 2: Create guest types**

Create `src/types/guests.ts`:

```typescript
export interface Guest {
  id: string
  projectId: string
  name: string
  groupName: string | null
  dietary: string | null
  vip: boolean
  customAttributes: Record<string, string>
  seatElementId: string | null
  createdAt: string
}

export interface GuestImportRow {
  name: string
  group?: string
  dietary?: string
  vip?: string | boolean
  [key: string]: string | boolean | undefined
}
```

- [ ] **Step 3: Create project types**

Create `src/types/project.ts`:

```typescript
import type { CanvasElement } from './elements'
import type { Guest } from './guests'

export interface CanvasSettings {
  gridSize: number
  scale: number
  scaleUnit: 'ft' | 'm' | 'cm' | 'in'
  showGrid: boolean
}

export interface Project {
  id: string
  ownerId: string | null
  name: string
  slug: string
  sharePermission: 'private' | 'view' | 'comment' | 'edit'
  canvasData: Record<string, CanvasElement>
  canvasSettings: CanvasSettings
  thumbnailUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectVersion {
  id: string
  projectId: string
  name: string | null
  canvasData: Record<string, CanvasElement>
  guestData: Guest[]
  createdAt: string
}

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  gridSize: 12,
  scale: 1,
  scaleUnit: 'ft',
  showGrid: true,
}
```

- [ ] **Step 4: Create collaboration types**

Create `src/types/collaboration.ts`:

```typescript
export interface CursorInfo {
  userId: string
  userName: string
  color: string
  x: number
  y: number
  lastUpdated: number
}

export interface Comment {
  id: string
  projectId: string
  authorId: string | null
  authorName: string
  x: number
  y: number
  targetElementId: string | null
  body: string
  parentId: string | null
  resolved: boolean
  reactions: Record<string, number>
  createdAt: string
}
```

- [ ] **Step 5: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/
git commit -m "feat: add core TypeScript types for elements, guests, projects, collaboration"
```

---

### Task 3: Create constants and geometry utilities

**Files:**
- Create: `src/lib/constants.ts`, `src/lib/geometry.ts`, `src/lib/slug.ts`, `src/lib/seatLayout.ts`

- [ ] **Step 1: Create constants**

Create `src/lib/constants.ts`:

```typescript
export const GRID_SIZE_DEFAULT = 12
export const GRID_SNAP_THRESHOLD = 6
export const WALL_SNAP_THRESHOLD = 8
export const SEAT_DROP_THRESHOLD = 20

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 4.0
export const ZOOM_STEP = 0.1

export const UNDO_LIMIT = 50

export const ALIGNMENT_THRESHOLD = 5

export const GROUP_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // emerald
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#84CC16', // lime
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#D946EF', // fuchsia
] as const

export const CURSOR_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
] as const

export const UNASSIGNED_SEAT_FILL = '#E5E7EB'
export const UNASSIGNED_SEAT_STROKE = '#9CA3AF'
export const CONFLICT_COLOR = '#DC2626'
export const ALIGNMENT_GUIDE_COLOR = '#FF00FF'

export const ELEMENT_DEFAULTS: Record<string, { width: number; height: number; fill: string; stroke: string }> = {
  'table-round': { width: 80, height: 80, fill: '#F3F4F6', stroke: '#6B7280' },
  'table-rect': { width: 120, height: 60, fill: '#F3F4F6', stroke: '#6B7280' },
  'table-banquet': { width: 200, height: 60, fill: '#F3F4F6', stroke: '#6B7280' },
  'table-conference': { width: 240, height: 80, fill: '#F3F4F6', stroke: '#6B7280' },
  'chair': { width: 24, height: 24, fill: '#DBEAFE', stroke: '#3B82F6' },
  'sofa': { width: 80, height: 36, fill: '#DBEAFE', stroke: '#3B82F6' },
  'stool': { width: 20, height: 20, fill: '#DBEAFE', stroke: '#3B82F6' },
  'desk': { width: 72, height: 48, fill: '#FEF3C7', stroke: '#D97706' },
  'counter': { width: 120, height: 36, fill: '#FEF3C7', stroke: '#D97706' },
  'podium': { width: 36, height: 36, fill: '#E0E7FF', stroke: '#4F46E5' },
  'lectern': { width: 30, height: 30, fill: '#E0E7FF', stroke: '#4F46E5' },
  'stage': { width: 240, height: 120, fill: '#FEE2E2', stroke: '#B91C1C' },
  'bar': { width: 160, height: 40, fill: '#FED7AA', stroke: '#C2410C' },
  'reception': { width: 100, height: 40, fill: '#D1FAE5', stroke: '#059669' },
  'dance-floor': { width: 200, height: 200, fill: '#EDE9FE', stroke: '#7C3AED' },
  'custom-shape': { width: 100, height: 100, fill: '#F9FAFB', stroke: '#D1D5DB' },
  'divider': { width: 120, height: 4, fill: '#9CA3AF', stroke: '#6B7280' },
  'planter': { width: 40, height: 40, fill: '#D1FAE5', stroke: '#059669' },
}

export const TABLE_SEAT_DEFAULTS: Record<string, number> = {
  'table-round': 8,
  'table-rect': 6,
  'table-banquet': 16,
  'table-conference': 14,
}
```

- [ ] **Step 2: Create geometry helpers**

Create `src/lib/geometry.ts`:

```typescript
export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize
}

export function distanceBetween(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function rectCenter(rect: Rect): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}

export function snapRotation(degrees: number, snapIncrement: number): number {
  return Math.round(degrees / snapIncrement) * snapIncrement
}

export interface AlignmentGuide {
  orientation: 'horizontal' | 'vertical'
  position: number
  start: number
  end: number
}

export function findAlignmentGuides(
  movingRect: Rect,
  otherRects: Rect[],
  threshold: number
): AlignmentGuide[] {
  const guides: AlignmentGuide[] = []
  const movingCenter = rectCenter(movingRect)

  for (const other of otherRects) {
    const otherCenter = rectCenter(other)

    // Vertical center alignment
    if (Math.abs(movingCenter.x - otherCenter.x) < threshold) {
      guides.push({
        orientation: 'vertical',
        position: otherCenter.x,
        start: Math.min(movingRect.y, other.y),
        end: Math.max(movingRect.y + movingRect.height, other.y + other.height),
      })
    }

    // Horizontal center alignment
    if (Math.abs(movingCenter.y - otherCenter.y) < threshold) {
      guides.push({
        orientation: 'horizontal',
        position: otherCenter.y,
        start: Math.min(movingRect.x, other.x),
        end: Math.max(movingRect.x + movingRect.width, other.x + other.width),
      })
    }

    // Left edge alignment
    if (Math.abs(movingRect.x - other.x) < threshold) {
      guides.push({
        orientation: 'vertical',
        position: other.x,
        start: Math.min(movingRect.y, other.y),
        end: Math.max(movingRect.y + movingRect.height, other.y + other.height),
      })
    }

    // Right edge alignment
    if (Math.abs(movingRect.x + movingRect.width - (other.x + other.width)) < threshold) {
      guides.push({
        orientation: 'vertical',
        position: other.x + other.width,
        start: Math.min(movingRect.y, other.y),
        end: Math.max(movingRect.y + movingRect.height, other.y + other.height),
      })
    }

    // Top edge alignment
    if (Math.abs(movingRect.y - other.y) < threshold) {
      guides.push({
        orientation: 'horizontal',
        position: other.y,
        start: Math.min(movingRect.x, other.x),
        end: Math.max(movingRect.x + movingRect.width, other.x + other.width),
      })
    }

    // Bottom edge alignment
    if (Math.abs(movingRect.y + movingRect.height - (other.y + other.height)) < threshold) {
      guides.push({
        orientation: 'horizontal',
        position: other.y + other.height,
        start: Math.min(movingRect.x, other.x),
        end: Math.max(movingRect.x + movingRect.width, other.x + other.width),
      })
    }
  }

  return guides
}

export function getSnappedPosition(
  pos: Point,
  otherRects: Rect[],
  movingSize: { width: number; height: number },
  threshold: number
): { snapped: Point; guides: AlignmentGuide[] } {
  const movingRect: Rect = { x: pos.x, y: pos.y, ...movingSize }
  const guides = findAlignmentGuides(movingRect, otherRects, threshold)

  let snappedX = pos.x
  let snappedY = pos.y

  for (const guide of guides) {
    if (guide.orientation === 'vertical') {
      const movingCenter = pos.x + movingSize.width / 2
      if (Math.abs(movingCenter - guide.position) < threshold) {
        snappedX = guide.position - movingSize.width / 2
      } else if (Math.abs(pos.x - guide.position) < threshold) {
        snappedX = guide.position
      } else if (Math.abs(pos.x + movingSize.width - guide.position) < threshold) {
        snappedX = guide.position - movingSize.width
      }
    }
    if (guide.orientation === 'horizontal') {
      const movingCenter = pos.y + movingSize.height / 2
      if (Math.abs(movingCenter - guide.position) < threshold) {
        snappedY = guide.position - movingSize.height / 2
      } else if (Math.abs(pos.y - guide.position) < threshold) {
        snappedY = guide.position
      } else if (Math.abs(pos.y + movingSize.height - guide.position) < threshold) {
        snappedY = guide.position - movingSize.height
      }
    }
  }

  return { snapped: { x: snappedX, y: snappedY }, guides }
}
```

- [ ] **Step 3: Create slug generator**

Create `src/lib/slug.ts`:

```typescript
import { nanoid } from 'nanoid'

const adjectives = [
  'bright', 'calm', 'bold', 'swift', 'warm',
  'cool', 'fair', 'keen', 'pure', 'soft',
  'glad', 'fine', 'neat', 'wise', 'true',
]

const nouns = [
  'hall', 'room', 'plan', 'seat', 'deck',
  'view', 'nest', 'arch', 'grid', 'zone',
  'loft', 'wing', 'bay', 'den', 'hub',
]

export function generateSlug(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const id = nanoid(6)
  return `${adj}-${noun}-${id}`
}
```

- [ ] **Step 4: Create seat layout calculator**

Create `src/lib/seatLayout.ts`:

```typescript
import type { SeatPosition, TableType } from '../types/elements'
import { nanoid } from 'nanoid'

export function computeSeatPositions(
  tableType: TableType,
  seatCount: number,
  seatLayout: 'around' | 'one-side' | 'both-sides' | 'u-shape',
  tableWidth: number,
  tableHeight: number
): SeatPosition[] {
  switch (tableType) {
    case 'table-round':
      return computeRoundSeats(seatCount, tableWidth)
    case 'table-rect':
      return computeRectSeats(seatCount, seatLayout, tableWidth, tableHeight)
    case 'table-banquet':
      return computeBanquetSeats(seatCount, tableWidth, tableHeight)
    case 'table-conference':
      return computeConferenceSeats(seatCount, tableWidth, tableHeight)
  }
}

function computeRoundSeats(seatCount: number, diameter: number): SeatPosition[] {
  const seats: SeatPosition[] = []
  const radius = diameter / 2 + 16 // seats sit outside table edge
  for (let i = 0; i < seatCount; i++) {
    const angle = (2 * Math.PI * i) / seatCount - Math.PI / 2
    seats.push({
      id: nanoid(8),
      offsetX: Math.cos(angle) * radius,
      offsetY: Math.sin(angle) * radius,
      rotation: (angle * 180) / Math.PI + 90,
      assignedGuestId: null,
    })
  }
  return seats
}

function computeRectSeats(
  seatCount: number,
  layout: 'around' | 'one-side' | 'both-sides' | 'u-shape',
  width: number,
  height: number
): SeatPosition[] {
  const seats: SeatPosition[] = []
  const seatSpacing = 30
  const offset = 18 // distance from table edge

  if (layout === 'one-side') {
    const startX = -(seatCount - 1) * seatSpacing / 2
    for (let i = 0; i < seatCount; i++) {
      seats.push({
        id: nanoid(8),
        offsetX: startX + i * seatSpacing,
        offsetY: height / 2 + offset,
        rotation: 0,
        assignedGuestId: null,
      })
    }
  } else if (layout === 'both-sides') {
    const perSide = Math.ceil(seatCount / 2)
    const startX = -(perSide - 1) * seatSpacing / 2
    for (let i = 0; i < perSide; i++) {
      seats.push({
        id: nanoid(8),
        offsetX: startX + i * seatSpacing,
        offsetY: -(height / 2 + offset),
        rotation: 180,
        assignedGuestId: null,
      })
    }
    const bottomCount = seatCount - perSide
    const startX2 = -(bottomCount - 1) * seatSpacing / 2
    for (let i = 0; i < bottomCount; i++) {
      seats.push({
        id: nanoid(8),
        offsetX: startX2 + i * seatSpacing,
        offsetY: height / 2 + offset,
        rotation: 0,
        assignedGuestId: null,
      })
    }
  } else {
    // 'around' — distribute around all edges
    const perLongSide = Math.floor(seatCount * (width / (2 * width + 2 * height)))
    const perShortSide = Math.floor((seatCount - 2 * perLongSide) / 2)
    const remaining = seatCount - 2 * perLongSide - 2 * perShortSide
    let idx = 0

    // Top side
    const topCount = perLongSide + (remaining > 0 ? 1 : 0)
    const topStart = -(topCount - 1) * seatSpacing / 2
    for (let i = 0; i < topCount; i++) {
      seats.push({ id: nanoid(8), offsetX: topStart + i * seatSpacing, offsetY: -(height / 2 + offset), rotation: 180, assignedGuestId: null })
      idx++
    }
    // Right side
    const rightCount = perShortSide
    const rightStart = -(rightCount - 1) * seatSpacing / 2
    for (let i = 0; i < rightCount; i++) {
      seats.push({ id: nanoid(8), offsetX: width / 2 + offset, offsetY: rightStart + i * seatSpacing, rotation: 270, assignedGuestId: null })
      idx++
    }
    // Bottom side
    const bottomCount = perLongSide
    const bottomStart = (bottomCount - 1) * seatSpacing / 2
    for (let i = 0; i < bottomCount; i++) {
      seats.push({ id: nanoid(8), offsetX: bottomStart - i * seatSpacing, offsetY: height / 2 + offset, rotation: 0, assignedGuestId: null })
      idx++
    }
    // Left side
    const leftCount = seatCount - idx
    const leftStart = (leftCount - 1) * seatSpacing / 2
    for (let i = 0; i < leftCount; i++) {
      seats.push({ id: nanoid(8), offsetX: -(width / 2 + offset), offsetY: leftStart - i * seatSpacing, rotation: 90, assignedGuestId: null })
    }
  }

  return seats
}

function computeBanquetSeats(seatCount: number, width: number, height: number): SeatPosition[] {
  const seats: SeatPosition[] = []
  const perSide = Math.ceil(seatCount / 2)
  const seatSpacing = Math.min(30, (width - 20) / perSide)
  const offset = 18
  const startX = -(perSide - 1) * seatSpacing / 2

  // Top side
  for (let i = 0; i < perSide; i++) {
    seats.push({
      id: nanoid(8),
      offsetX: startX + i * seatSpacing,
      offsetY: -(height / 2 + offset),
      rotation: 180,
      assignedGuestId: null,
    })
  }
  // Bottom side
  const bottomCount = seatCount - perSide
  const startX2 = -(bottomCount - 1) * seatSpacing / 2
  for (let i = 0; i < bottomCount; i++) {
    seats.push({
      id: nanoid(8),
      offsetX: startX2 + i * seatSpacing,
      offsetY: height / 2 + offset,
      rotation: 0,
      assignedGuestId: null,
    })
  }

  return seats
}

function computeConferenceSeats(seatCount: number, width: number, height: number): SeatPosition[] {
  // Conference = seats around all 4 sides
  return computeRectSeats(seatCount, 'around', width, height)
}
```

- [ ] **Step 5: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/
git commit -m "feat: add constants, geometry utils, slug generator, and seat layout calculator"
```

---

## Phase 2: Zustand Stores

### Task 4: Create the elements store with undo/redo

**Files:**
- Create: `src/stores/elementsStore.ts`

- [ ] **Step 1: Create elements store**

Create `src/stores/elementsStore.ts`:

```typescript
import { create } from 'zustand'
import { temporal } from 'zundo'
import { nanoid } from 'nanoid'
import type { CanvasElement, TableElement, SeatPosition } from '../types/elements'
import { isTableElement } from '../types/elements'
import { UNDO_LIMIT } from '../lib/constants'

interface ElementsState {
  elements: Record<string, CanvasElement>

  // CRUD
  addElement: (element: CanvasElement) => void
  updateElement: (id: string, updates: Partial<CanvasElement>) => void
  removeElement: (id: string) => void
  removeElements: (ids: string[]) => void
  setElements: (elements: Record<string, CanvasElement>) => void

  // Bulk
  duplicateElements: (ids: string[]) => string[]
  moveElements: (ids: string[], dx: number, dy: number) => void

  // Z-ordering
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  bringForward: (id: string) => void
  sendBackward: (id: string) => void

  // Grouping
  groupElements: (ids: string[]) => string
  ungroupElements: (groupId: string) => void

  // Seat assignment
  assignSeat: (elementId: string, seatId: string, guestId: string) => void
  unassignSeat: (elementId: string, seatId: string) => void

  // Helpers
  getMaxZIndex: () => number
  getElementsByGroup: (groupId: string) => CanvasElement[]
  getAllSeats: () => { element: TableElement; seat: SeatPosition }[]
}

export const useElementsStore = create<ElementsState>()(
  temporal(
    (set, get) => ({
      elements: {},

      addElement: (element) =>
        set((state) => ({
          elements: { ...state.elements, [element.id]: element },
        })),

      updateElement: (id, updates) =>
        set((state) => {
          const existing = state.elements[id]
          if (!existing) return state
          return {
            elements: {
              ...state.elements,
              [id]: { ...existing, ...updates } as CanvasElement,
            },
          }
        }),

      removeElement: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.elements
          return { elements: rest }
        }),

      removeElements: (ids) =>
        set((state) => {
          const next = { ...state.elements }
          for (const id of ids) {
            delete next[id]
          }
          return { elements: next }
        }),

      setElements: (elements) => set({ elements }),

      duplicateElements: (ids) => {
        const newIds: string[] = []
        const newGroupId = nanoid()
        set((state) => {
          const next = { ...state.elements }
          for (const id of ids) {
            const el = state.elements[id]
            if (!el) continue
            const newId = nanoid()
            newIds.push(newId)
            next[newId] = {
              ...el,
              id: newId,
              x: el.x + 20,
              y: el.y + 20,
              groupId: ids.length > 1 ? newGroupId : el.groupId,
              zIndex: get().getMaxZIndex() + 1,
            } as CanvasElement
          }
          return { elements: next }
        })
        return newIds
      },

      moveElements: (ids, dx, dy) =>
        set((state) => {
          const next = { ...state.elements }
          for (const id of ids) {
            const el = next[id]
            if (!el || el.locked) continue
            next[id] = { ...el, x: el.x + dx, y: el.y + dy } as CanvasElement
          }
          return { elements: next }
        }),

      bringToFront: (id) =>
        set((state) => {
          const el = state.elements[id]
          if (!el) return state
          return {
            elements: {
              ...state.elements,
              [id]: { ...el, zIndex: get().getMaxZIndex() + 1 } as CanvasElement,
            },
          }
        }),

      sendToBack: (id) =>
        set((state) => {
          const el = state.elements[id]
          if (!el) return state
          const minZ = Math.min(...Object.values(state.elements).map((e) => e.zIndex))
          return {
            elements: {
              ...state.elements,
              [id]: { ...el, zIndex: minZ - 1 } as CanvasElement,
            },
          }
        }),

      bringForward: (id) =>
        set((state) => {
          const el = state.elements[id]
          if (!el) return state
          return {
            elements: {
              ...state.elements,
              [id]: { ...el, zIndex: el.zIndex + 1 } as CanvasElement,
            },
          }
        }),

      sendBackward: (id) =>
        set((state) => {
          const el = state.elements[id]
          if (!el) return state
          return {
            elements: {
              ...state.elements,
              [id]: { ...el, zIndex: el.zIndex - 1 } as CanvasElement,
            },
          }
        }),

      groupElements: (ids) => {
        const groupId = nanoid()
        set((state) => {
          const next = { ...state.elements }
          for (const id of ids) {
            const el = next[id]
            if (!el) continue
            next[id] = { ...el, groupId } as CanvasElement
          }
          return { elements: next }
        })
        return groupId
      },

      ungroupElements: (groupId) =>
        set((state) => {
          const next = { ...state.elements }
          for (const [id, el] of Object.entries(next)) {
            if (el.groupId === groupId) {
              next[id] = { ...el, groupId: null } as CanvasElement
            }
          }
          return { elements: next }
        }),

      assignSeat: (elementId, seatId, guestId) =>
        set((state) => {
          const el = state.elements[elementId]
          if (!el || !isTableElement(el)) return state
          const seats = el.seats.map((s) =>
            s.id === seatId ? { ...s, assignedGuestId: guestId } : s
          )
          return {
            elements: {
              ...state.elements,
              [elementId]: { ...el, seats } as TableElement,
            },
          }
        }),

      unassignSeat: (elementId, seatId) =>
        set((state) => {
          const el = state.elements[elementId]
          if (!el || !isTableElement(el)) return state
          const seats = el.seats.map((s) =>
            s.id === seatId ? { ...s, assignedGuestId: null } : s
          )
          return {
            elements: {
              ...state.elements,
              [elementId]: { ...el, seats } as TableElement,
            },
          }
        }),

      getMaxZIndex: () => {
        const els = Object.values(get().elements)
        if (els.length === 0) return 0
        return Math.max(...els.map((e) => e.zIndex))
      },

      getElementsByGroup: (groupId) =>
        Object.values(get().elements).filter((e) => e.groupId === groupId),

      getAllSeats: () => {
        const result: { element: TableElement; seat: SeatPosition }[] = []
        for (const el of Object.values(get().elements)) {
          if (isTableElement(el)) {
            for (const seat of el.seats) {
              result.push({ element: el, seat })
            }
          }
        }
        return result
      },
    }),
    { limit: UNDO_LIMIT }
  )
)
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/stores/elementsStore.ts
git commit -m "feat: add elements store with CRUD, undo/redo, grouping, seat assignment"
```

---

### Task 5: Create canvas, UI, and seating stores

**Files:**
- Create: `src/stores/canvasStore.ts`, `src/stores/uiStore.ts`, `src/stores/seatingStore.ts`, `src/stores/projectStore.ts`, `src/stores/collaborationStore.ts`

- [ ] **Step 1: Create canvas store**

Create `src/stores/canvasStore.ts`:

```typescript
import { create } from 'zustand'
import { GRID_SIZE_DEFAULT, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from '../lib/constants'
import type { CanvasSettings } from '../types/project'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'

export type ToolType = 'select' | 'pan' | 'wall' | 'door' | 'window'

interface CanvasState {
  // Viewport
  stageX: number
  stageY: number
  stageScale: number

  // Grid
  settings: CanvasSettings

  // Tool
  activeTool: ToolType

  // Actions
  setStagePosition: (x: number, y: number) => void
  setStageScale: (scale: number) => void
  zoomIn: () => void
  zoomOut: () => void
  zoomToFit: (contentBounds: { x: number; y: number; width: number; height: number }, stageWidth: number, stageHeight: number) => void
  resetZoom: () => void
  setActiveTool: (tool: ToolType) => void
  setSettings: (settings: Partial<CanvasSettings>) => void
  toggleGrid: () => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  stageX: 0,
  stageY: 0,
  stageScale: 1,
  settings: { ...DEFAULT_CANVAS_SETTINGS },
  activeTool: 'select',

  setStagePosition: (x, y) => set({ stageX: x, stageY: y }),

  setStageScale: (scale) =>
    set({ stageScale: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale)) }),

  zoomIn: () => {
    const current = get().stageScale
    set({ stageScale: Math.min(ZOOM_MAX, current + ZOOM_STEP) })
  },

  zoomOut: () => {
    const current = get().stageScale
    set({ stageScale: Math.max(ZOOM_MIN, current - ZOOM_STEP) })
  },

  zoomToFit: (contentBounds, stageWidth, stageHeight) => {
    if (contentBounds.width === 0 || contentBounds.height === 0) return
    const padding = 50
    const scaleX = (stageWidth - padding * 2) / contentBounds.width
    const scaleY = (stageHeight - padding * 2) / contentBounds.height
    const newScale = Math.min(scaleX, scaleY, ZOOM_MAX)
    const newX = -contentBounds.x * newScale + (stageWidth - contentBounds.width * newScale) / 2
    const newY = -contentBounds.y * newScale + (stageHeight - contentBounds.height * newScale) / 2
    set({ stageScale: newScale, stageX: newX, stageY: newY })
  },

  resetZoom: () => set({ stageScale: 1, stageX: 0, stageY: 0 }),

  setActiveTool: (tool) => set({ activeTool: tool }),

  setSettings: (partial) =>
    set((state) => ({ settings: { ...state.settings, ...partial } })),

  toggleGrid: () =>
    set((state) => ({
      settings: { ...state.settings, showGrid: !state.settings.showGrid },
    })),
}))
```

- [ ] **Step 2: Create UI store**

Create `src/stores/uiStore.ts`:

```typescript
import { create } from 'zustand'

interface UIState {
  // Selection
  selectedIds: string[]
  hoveredId: string | null

  // Panels
  rightSidebarOpen: boolean
  rightSidebarTab: 'properties' | 'guests' | 'table' | 'comments' | 'versions'

  // Modals
  shareModalOpen: boolean
  exportDialogOpen: boolean
  templatePickerOpen: boolean
  shortcutsOverlayOpen: boolean
  csvImportOpen: boolean

  // Presentation
  presentationMode: boolean

  // Context menu
  contextMenu: { x: number; y: number; elementId: string | null } | null

  // Inline editing
  editingLabelId: string | null

  // Actions
  setSelectedIds: (ids: string[]) => void
  addToSelection: (id: string) => void
  removeFromSelection: (id: string) => void
  toggleSelection: (id: string) => void
  clearSelection: () => void
  setHoveredId: (id: string | null) => void
  setRightSidebarOpen: (open: boolean) => void
  setRightSidebarTab: (tab: UIState['rightSidebarTab']) => void
  setShareModalOpen: (open: boolean) => void
  setExportDialogOpen: (open: boolean) => void
  setTemplatePickerOpen: (open: boolean) => void
  setShortcutsOverlayOpen: (open: boolean) => void
  setCsvImportOpen: (open: boolean) => void
  setPresentationMode: (mode: boolean) => void
  setContextMenu: (menu: UIState['contextMenu']) => void
  setEditingLabelId: (id: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedIds: [],
  hoveredId: null,
  rightSidebarOpen: true,
  rightSidebarTab: 'properties',
  shareModalOpen: false,
  exportDialogOpen: false,
  templatePickerOpen: false,
  shortcutsOverlayOpen: false,
  csvImportOpen: false,
  presentationMode: false,
  contextMenu: null,
  editingLabelId: null,

  setSelectedIds: (ids) => set({ selectedIds: ids }),
  addToSelection: (id) => set((s) => ({ selectedIds: [...s.selectedIds, id] })),
  removeFromSelection: (id) =>
    set((s) => ({ selectedIds: s.selectedIds.filter((i) => i !== id) })),
  toggleSelection: (id) =>
    set((s) =>
      s.selectedIds.includes(id)
        ? { selectedIds: s.selectedIds.filter((i) => i !== id) }
        : { selectedIds: [...s.selectedIds, id] }
    ),
  clearSelection: () => set({ selectedIds: [] }),
  setHoveredId: (id) => set({ hoveredId: id }),
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
  setRightSidebarTab: (tab) => set({ rightSidebarTab: tab, rightSidebarOpen: true }),
  setShareModalOpen: (open) => set({ shareModalOpen: open }),
  setExportDialogOpen: (open) => set({ exportDialogOpen: open }),
  setTemplatePickerOpen: (open) => set({ templatePickerOpen: open }),
  setShortcutsOverlayOpen: (open) => set({ shortcutsOverlayOpen: open }),
  setCsvImportOpen: (open) => set({ csvImportOpen: open }),
  setPresentationMode: (mode) => set({ presentationMode: mode }),
  setContextMenu: (menu) => set({ contextMenu: menu }),
  setEditingLabelId: (id) => set({ editingLabelId: id }),
}))
```

- [ ] **Step 3: Create seating store**

Create `src/stores/seatingStore.ts`:

```typescript
import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Guest } from '../types/guests'
import { GROUP_COLORS } from '../lib/constants'

interface SeatingState {
  guests: Record<string, Guest>
  groupColors: Record<string, string>
  searchQuery: string
  sortBy: 'name' | 'group' | 'status'

  // Actions
  addGuest: (name: string, groupName?: string, dietary?: string, vip?: boolean) => string
  addGuests: (guests: Omit<Guest, 'id' | 'projectId' | 'createdAt' | 'seatElementId'>[]) => void
  updateGuest: (id: string, updates: Partial<Guest>) => void
  removeGuest: (id: string) => void
  removeGuests: (ids: string[]) => void
  setGuests: (guests: Record<string, Guest>) => void
  assignGuestToSeat: (guestId: string, seatElementId: string) => void
  unassignGuest: (guestId: string) => void
  setSearchQuery: (query: string) => void
  setSortBy: (sort: SeatingState['sortBy']) => void
  setGroupColor: (groupName: string, color: string) => void

  // Computed
  getAssignedCount: () => number
  getUnassignedGuests: () => Guest[]
  getGuestsBySeat: (seatElementId: string) => Guest[]
  getConflicts: () => Map<string, string[]>
  getGroupColor: (groupName: string) => string
  getFilteredGuests: () => Guest[]
}

export const useSeatingStore = create<SeatingState>((set, get) => ({
  guests: {},
  groupColors: {},
  searchQuery: '',
  sortBy: 'name',

  addGuest: (name, groupName, dietary, vip) => {
    const id = nanoid()
    const guest: Guest = {
      id,
      projectId: '',
      name,
      groupName: groupName || null,
      dietary: dietary || null,
      vip: vip || false,
      customAttributes: {},
      seatElementId: null,
      createdAt: new Date().toISOString(),
    }
    set((state) => ({
      guests: { ...state.guests, [id]: guest },
    }))
    if (groupName) {
      get().getGroupColor(groupName) // ensure color assigned
    }
    return id
  },

  addGuests: (newGuests) =>
    set((state) => {
      const next = { ...state.guests }
      const nextColors = { ...state.groupColors }
      let colorIdx = Object.keys(nextColors).length

      for (const g of newGuests) {
        const id = nanoid()
        next[id] = {
          id,
          projectId: '',
          name: g.name,
          groupName: g.groupName || null,
          dietary: g.dietary || null,
          vip: g.vip || false,
          customAttributes: g.customAttributes || {},
          seatElementId: null,
          createdAt: new Date().toISOString(),
        }
        if (g.groupName && !nextColors[g.groupName]) {
          nextColors[g.groupName] = GROUP_COLORS[colorIdx % GROUP_COLORS.length]
          colorIdx++
        }
      }
      return { guests: next, groupColors: nextColors }
    }),

  updateGuest: (id, updates) =>
    set((state) => {
      const guest = state.guests[id]
      if (!guest) return state
      return { guests: { ...state.guests, [id]: { ...guest, ...updates } } }
    }),

  removeGuest: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.guests
      return { guests: rest }
    }),

  removeGuests: (ids) =>
    set((state) => {
      const next = { ...state.guests }
      for (const id of ids) delete next[id]
      return { guests: next }
    }),

  setGuests: (guests) => set({ guests }),

  assignGuestToSeat: (guestId, seatElementId) =>
    set((state) => {
      const guest = state.guests[guestId]
      if (!guest) return state
      return {
        guests: {
          ...state.guests,
          [guestId]: { ...guest, seatElementId },
        },
      }
    }),

  unassignGuest: (guestId) =>
    set((state) => {
      const guest = state.guests[guestId]
      if (!guest) return state
      return {
        guests: {
          ...state.guests,
          [guestId]: { ...guest, seatElementId: null },
        },
      }
    }),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortBy: (sort) => set({ sortBy: sort }),
  setGroupColor: (groupName, color) =>
    set((state) => ({
      groupColors: { ...state.groupColors, [groupName]: color },
    })),

  getAssignedCount: () =>
    Object.values(get().guests).filter((g) => g.seatElementId !== null).length,

  getUnassignedGuests: () =>
    Object.values(get().guests).filter((g) => g.seatElementId === null),

  getGuestsBySeat: (seatElementId) =>
    Object.values(get().guests).filter((g) => g.seatElementId === seatElementId),

  getConflicts: () => {
    const seatMap = new Map<string, string[]>()
    for (const guest of Object.values(get().guests)) {
      if (guest.seatElementId) {
        const existing = seatMap.get(guest.seatElementId) || []
        existing.push(guest.id)
        seatMap.set(guest.seatElementId, existing)
      }
    }
    const conflicts = new Map<string, string[]>()
    for (const [seatId, guestIds] of seatMap.entries()) {
      if (guestIds.length > 1) {
        conflicts.set(seatId, guestIds)
      }
    }
    return conflicts
  },

  getGroupColor: (groupName) => {
    const state = get()
    if (state.groupColors[groupName]) return state.groupColors[groupName]
    const colorIdx = Object.keys(state.groupColors).length
    const color = GROUP_COLORS[colorIdx % GROUP_COLORS.length]
    set((s) => ({ groupColors: { ...s.groupColors, [groupName]: color } }))
    return color
  },

  getFilteredGuests: () => {
    const state = get()
    let guests = Object.values(state.guests)

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase()
      guests = guests.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.groupName && g.groupName.toLowerCase().includes(q))
      )
    }

    guests.sort((a, b) => {
      switch (state.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'group':
          return (a.groupName || '').localeCompare(b.groupName || '')
        case 'status':
          return (a.seatElementId ? 1 : 0) - (b.seatElementId ? 1 : 0)
        default:
          return 0
      }
    })

    return guests
  },
}))
```

- [ ] **Step 4: Create project store**

Create `src/stores/projectStore.ts`:

```typescript
import { create } from 'zustand'
import type { Project, ProjectVersion } from '../types/project'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'
import { generateSlug } from '../lib/slug'

interface ProjectState {
  currentProject: Project | null
  versions: ProjectVersion[]
  isDirty: boolean
  lastSavedAt: string | null

  setCurrentProject: (project: Project) => void
  updateProjectName: (name: string) => void
  updateSharePermission: (perm: Project['sharePermission']) => void
  setVersions: (versions: ProjectVersion[]) => void
  addVersion: (version: ProjectVersion) => void
  setDirty: (dirty: boolean) => void
  setLastSavedAt: (at: string) => void

  createNewProject: (name?: string) => Project
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: null,
  versions: [],
  isDirty: false,
  lastSavedAt: null,

  setCurrentProject: (project) => set({ currentProject: project }),

  updateProjectName: (name) =>
    set((state) => ({
      currentProject: state.currentProject
        ? { ...state.currentProject, name }
        : null,
      isDirty: true,
    })),

  updateSharePermission: (perm) =>
    set((state) => ({
      currentProject: state.currentProject
        ? { ...state.currentProject, sharePermission: perm }
        : null,
      isDirty: true,
    })),

  setVersions: (versions) => set({ versions }),
  addVersion: (version) =>
    set((state) => ({ versions: [version, ...state.versions] })),

  setDirty: (dirty) => set({ isDirty: dirty }),
  setLastSavedAt: (at) => set({ lastSavedAt: at, isDirty: false }),

  createNewProject: (name) => {
    const project: Project = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      ownerId: null,
      name: name || 'Untitled Floor Plan',
      slug: generateSlug(),
      sharePermission: 'private',
      canvasData: {},
      canvasSettings: { ...DEFAULT_CANVAS_SETTINGS },
      thumbnailUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    set({ currentProject: project, versions: [], isDirty: false })
    return project
  },
}))
```

- [ ] **Step 5: Create collaboration store (placeholder for Phase 5)**

Create `src/stores/collaborationStore.ts`:

```typescript
import { create } from 'zustand'
import type { CursorInfo, Comment } from '../types/collaboration'

interface CollaborationState {
  cursors: Record<string, CursorInfo>
  comments: Comment[]
  isConnected: boolean

  setCursors: (cursors: Record<string, CursorInfo>) => void
  updateCursor: (userId: string, cursor: CursorInfo) => void
  removeCursor: (userId: string) => void
  setComments: (comments: Comment[]) => void
  addComment: (comment: Comment) => void
  updateComment: (id: string, updates: Partial<Comment>) => void
  removeComment: (id: string) => void
  setConnected: (connected: boolean) => void
}

export const useCollaborationStore = create<CollaborationState>((set) => ({
  cursors: {},
  comments: [],
  isConnected: false,

  setCursors: (cursors) => set({ cursors }),
  updateCursor: (userId, cursor) =>
    set((state) => ({ cursors: { ...state.cursors, [userId]: cursor } })),
  removeCursor: (userId) =>
    set((state) => {
      const { [userId]: _, ...rest } = state.cursors
      return { cursors: rest }
    }),
  setComments: (comments) => set({ comments }),
  addComment: (comment) =>
    set((state) => ({ comments: [...state.comments, comment] })),
  updateComment: (id, updates) =>
    set((state) => ({
      comments: state.comments.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
  removeComment: (id) =>
    set((state) => ({
      comments: state.comments.filter((c) => c.id !== id),
    })),
  setConnected: (connected) => set({ isConnected: connected }),
}))
```

- [ ] **Step 6: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/stores/
git commit -m "feat: add canvas, UI, seating, project, and collaboration Zustand stores"
```

---

## Phase 3: Canvas Engine & Editor Shell

### Task 6: Build the editor page layout shell

**Files:**
- Create: `src/components/editor/EditorPage.tsx`, `src/components/editor/TopBar.tsx`, `src/components/editor/LeftSidebar/ToolSelector.tsx`, `src/components/editor/LeftSidebar/ElementLibrary.tsx`, `src/components/editor/RightSidebar/RightSidebar.tsx`, `src/components/editor/StatusBar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create EditorPage layout**

Create `src/components/editor/EditorPage.tsx`:

```tsx
import { TopBar } from './TopBar'
import { ToolSelector } from './LeftSidebar/ToolSelector'
import { ElementLibrary } from './LeftSidebar/ElementLibrary'
import { RightSidebar } from './RightSidebar/RightSidebar'
import { StatusBar } from './StatusBar'
import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { useEffect } from 'react'

export function EditorPage() {
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen)
  const presentationMode = useUIStore((s) => s.presentationMode)
  const createNewProject = useProjectStore((s) => s.createNewProject)
  const currentProject = useProjectStore((s) => s.currentProject)

  useEffect(() => {
    if (!currentProject) {
      createNewProject()
    }
  }, [currentProject, createNewProject])

  if (presentationMode) {
    return (
      <div className="w-screen h-screen bg-white">
        <div className="w-full h-full flex items-center justify-center text-gray-400">
          Canvas (presentation mode)
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-50">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-[260px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <ToolSelector />
          <div className="border-t border-gray-200" />
          <ElementLibrary />
        </div>

        {/* Canvas */}
        <div className="flex-1 relative bg-gray-100 overflow-hidden">
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg">
            Canvas Area
          </div>
          <StatusBar />
        </div>

        {/* Right Sidebar */}
        {rightSidebarOpen && (
          <div className="w-[320px] flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
            <RightSidebar />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create TopBar**

Create `src/components/editor/TopBar.tsx`:

```tsx
import { useProjectStore } from '../../stores/projectStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useUIStore } from '../../stores/uiStore'
import { useElementsStore } from '../../stores/elementsStore'
import {
  Undo2, Redo2, ZoomIn, ZoomOut, Share2, Download,
  Maximize2, PanelRightOpen, PanelRightClose
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export function TopBar() {
  const project = useProjectStore((s) => s.currentProject)
  const updateName = useProjectStore((s) => s.updateProjectName)
  const { stageScale, zoomIn, zoomOut, resetZoom } = useCanvasStore()
  const { rightSidebarOpen, setRightSidebarOpen, setShareModalOpen, setExportDialogOpen, setPresentationMode } = useUIStore()
  const undo = useElementsStore.temporal.getState().undo
  const redo = useElementsStore.temporal.getState().redo

  const [editing, setEditing] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleNameSubmit = () => {
    if (nameValue.trim()) {
      updateName(nameValue.trim())
    }
    setEditing(false)
  }

  return (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 flex-shrink-0">
      {/* Project Name */}
      <div className="flex-shrink-0">
        {editing ? (
          <input
            ref={inputRef}
            className="text-sm font-semibold px-2 py-1 border border-blue-400 rounded outline-none"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSubmit()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <button
            className="text-sm font-semibold text-gray-800 hover:bg-gray-100 px-2 py-1 rounded"
            onDoubleClick={() => {
              setNameValue(project?.name || '')
              setEditing(true)
            }}
          >
            {project?.name || 'Untitled Floor Plan'}
          </button>
        )}
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-1">
        <button onClick={() => undo()} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Undo (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <button onClick={() => redo()} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Redo (Ctrl+Shift+Z)">
          <Redo2 size={16} />
        </button>
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <button onClick={zoomOut} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Zoom Out">
          <ZoomOut size={16} />
        </button>
        <button
          onClick={resetZoom}
          className="text-xs font-medium text-gray-600 hover:bg-gray-100 px-2 py-1 rounded min-w-[48px] text-center"
          title="Reset Zoom"
        >
          {Math.round(stageScale * 100)}%
        </button>
        <button onClick={zoomIn} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Zoom In">
          <ZoomIn size={16} />
        </button>
      </div>

      <div className="flex-1" />

      {/* Right side actions */}
      <button
        onClick={() => setPresentationMode(true)}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
        title="Presentation Mode (P)"
      >
        <Maximize2 size={16} />
      </button>

      <button
        onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
        title="Toggle Right Sidebar"
      >
        {rightSidebarOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
      </button>

      <button
        onClick={() => setShareModalOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
      >
        <Share2 size={14} />
        Share
      </button>

      <button
        onClick={() => setExportDialogOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
      >
        <Download size={14} />
        Export
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Create ToolSelector**

Create `src/components/editor/LeftSidebar/ToolSelector.tsx`:

```tsx
import { useCanvasStore, type ToolType } from '../../../stores/canvasStore'
import { MousePointer2, Hand, Minus, DoorOpen, SquareIcon } from 'lucide-react'

const tools: { id: ToolType; label: string; icon: React.ReactNode; shortcut: string }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 size={18} />, shortcut: 'V' },
  { id: 'pan', label: 'Pan', icon: <Hand size={18} />, shortcut: 'Space' },
  { id: 'wall', label: 'Wall', icon: <Minus size={18} />, shortcut: 'W' },
  { id: 'door', label: 'Door', icon: <DoorOpen size={18} />, shortcut: 'D' },
  { id: 'window', label: 'Window', icon: <SquareIcon size={18} />, shortcut: '' },
]

export function ToolSelector() {
  const activeTool = useCanvasStore((s) => s.activeTool)
  const setActiveTool = useCanvasStore((s) => s.setActiveTool)

  return (
    <div className="p-3">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tools</div>
      <div className="flex flex-col gap-0.5">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded text-sm transition-colors ${
              activeTool === tool.id
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
            title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
          >
            {tool.icon}
            <span>{tool.label}</span>
            {tool.shortcut && (
              <span className="ml-auto text-[10px] text-gray-400 font-mono">{tool.shortcut}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create ElementLibrary**

Create `src/components/editor/LeftSidebar/ElementLibrary.tsx`:

```tsx
import { ELEMENT_DEFAULTS, TABLE_SEAT_DEFAULTS } from '../../../lib/constants'
import type { ElementType, TableType } from '../../../types/elements'
import { useElementsStore } from '../../../stores/elementsStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { nanoid } from 'nanoid'
import { computeSeatPositions } from '../../../lib/seatLayout'
import type { CanvasElement, TableElement, BaseElement } from '../../../types/elements'

interface LibraryItem {
  type: ElementType
  label: string
  category: string
}

const LIBRARY_ITEMS: LibraryItem[] = [
  { type: 'table-round', label: 'Round Table', category: 'Tables' },
  { type: 'table-rect', label: 'Rectangular Table', category: 'Tables' },
  { type: 'table-banquet', label: 'Banquet Table', category: 'Tables' },
  { type: 'table-conference', label: 'Conference Table', category: 'Tables' },
  { type: 'chair', label: 'Chair', category: 'Seating' },
  { type: 'sofa', label: 'Sofa', category: 'Seating' },
  { type: 'stool', label: 'Stool', category: 'Seating' },
  { type: 'desk', label: 'Desk', category: 'Work' },
  { type: 'counter', label: 'Counter', category: 'Work' },
  { type: 'podium', label: 'Podium', category: 'Work' },
  { type: 'lectern', label: 'Lectern', category: 'Work' },
  { type: 'stage', label: 'Stage', category: 'Venue' },
  { type: 'bar', label: 'Bar', category: 'Venue' },
  { type: 'reception', label: 'Reception Desk', category: 'Venue' },
  { type: 'dance-floor', label: 'Dance Floor', category: 'Venue' },
  { type: 'custom-shape', label: 'Custom Shape', category: 'Zones' },
  { type: 'divider', label: 'Divider', category: 'Zones' },
  { type: 'planter', label: 'Planter', category: 'Zones' },
]

function isTableType(type: ElementType): type is TableType {
  return type === 'table-round' || type === 'table-rect' || type === 'table-banquet' || type === 'table-conference'
}

export function ElementLibrary() {
  const addElement = useElementsStore((s) => s.addElement)
  const getMaxZIndex = useElementsStore((s) => s.getMaxZIndex)
  const stageScale = useCanvasStore((s) => s.stageScale)
  const stageX = useCanvasStore((s) => s.stageX)
  const stageY = useCanvasStore((s) => s.stageY)

  const handleAddElement = (item: LibraryItem) => {
    const defaults = ELEMENT_DEFAULTS[item.type] || { width: 60, height: 60, fill: '#F3F4F6', stroke: '#6B7280' }
    const id = nanoid()

    // Place at center of visible canvas area
    const x = (-stageX + 400) / stageScale
    const y = (-stageY + 300) / stageScale

    if (isTableType(item.type)) {
      const seatCount = TABLE_SEAT_DEFAULTS[item.type] || 6
      const layout = item.type === 'table-round' ? 'around' as const
        : item.type === 'table-banquet' ? 'both-sides' as const
        : item.type === 'table-conference' ? 'around' as const
        : 'both-sides' as const

      const element: TableElement = {
        id,
        type: item.type,
        x, y,
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        locked: false,
        groupId: null,
        zIndex: getMaxZIndex() + 1,
        label: item.label,
        visible: true,
        style: { fill: defaults.fill, stroke: defaults.stroke, strokeWidth: 2, opacity: 1 },
        seatCount,
        seatLayout: layout,
        seats: computeSeatPositions(item.type, seatCount, layout, defaults.width, defaults.height),
      }
      addElement(element)
    } else {
      const element: BaseElement = {
        id,
        type: item.type,
        x, y,
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        locked: false,
        groupId: null,
        zIndex: getMaxZIndex() + 1,
        label: item.label,
        visible: true,
        style: { fill: defaults.fill, stroke: defaults.stroke, strokeWidth: 2, opacity: 1 },
      }
      addElement(element)
    }
  }

  const categories = [...new Set(LIBRARY_ITEMS.map((i) => i.category))]

  return (
    <div className="p-3 flex-1 overflow-y-auto">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Elements</div>
      {categories.map((cat) => (
        <div key={cat} className="mb-3">
          <div className="text-xs font-medium text-gray-400 mb-1">{cat}</div>
          <div className="grid grid-cols-2 gap-1">
            {LIBRARY_ITEMS.filter((i) => i.category === cat).map((item) => (
              <button
                key={item.type}
                onClick={() => handleAddElement(item)}
                className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded border border-gray-100 hover:border-gray-200 transition-colors"
              >
                <div
                  className="w-5 h-4 rounded-sm border flex-shrink-0"
                  style={{
                    backgroundColor: ELEMENT_DEFAULTS[item.type]?.fill || '#F3F4F6',
                    borderColor: ELEMENT_DEFAULTS[item.type]?.stroke || '#6B7280',
                  }}
                />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Create RightSidebar**

Create `src/components/editor/RightSidebar/RightSidebar.tsx`:

```tsx
import { useUIStore } from '../../../stores/uiStore'

export function RightSidebar() {
  const tab = useUIStore((s) => s.rightSidebarTab)
  const setTab = useUIStore((s) => s.setRightSidebarTab)

  const tabs = [
    { id: 'properties' as const, label: 'Properties' },
    { id: 'guests' as const, label: 'Guests' },
    { id: 'comments' as const, label: 'Comments' },
    { id: 'versions' as const, label: 'Versions' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-2.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? 'text-blue-700 border-b-2 border-blue-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-sm text-gray-400">
          {tab === 'properties' && 'Select an element to see its properties'}
          {tab === 'guests' && 'Guest list panel'}
          {tab === 'comments' && 'Comments panel'}
          {tab === 'versions' && 'Version history panel'}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create StatusBar**

Create `src/components/editor/StatusBar.tsx`:

```tsx
import { useElementsStore } from '../../stores/elementsStore'
import { useSeatingStore } from '../../stores/seatingStore'

export function StatusBar() {
  const allSeats = useElementsStore((s) => s.getAllSeats())
  const guestCount = useSeatingStore((s) => Object.keys(s.guests).length)
  const assignedCount = useSeatingStore((s) => s.getAssignedCount())
  const totalSeats = allSeats.length
  const unassignedSeats = totalSeats - allSeats.filter((s) => s.seat.assignedGuestId !== null).length
  const guestsWithoutSeats = guestCount - assignedCount

  return (
    <div className="absolute bottom-0 left-0 right-0 h-8 bg-white/90 backdrop-blur border-t border-gray-200 flex items-center px-4 gap-6 text-xs text-gray-600">
      <span>Total Seats: <strong>{totalSeats}</strong></span>
      <span>Assigned: <strong>{assignedCount}</strong></span>
      <span>Unassigned: <strong>{unassignedSeats}</strong></span>
      {guestCount > 0 && (
        <span>Guests Without Seats: <strong>{guestsWithoutSeats}</strong></span>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Update App.tsx with routes**

Replace `src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { EditorPage } from './components/editor/EditorPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/project/new" replace />} />
        <Route path="/project/:slug" element={<EditorPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 8: Verify it builds and renders**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
git add src/
git commit -m "feat: build editor page layout with TopBar, LeftSidebar, RightSidebar, and StatusBar"
```

---

### Task 7: Build the Konva canvas with grid, pan, and zoom

**Files:**
- Create: `src/components/editor/Canvas/CanvasStage.tsx`, `src/components/editor/Canvas/GridLayer.tsx`
- Modify: `src/components/editor/EditorPage.tsx`

- [ ] **Step 1: Create GridLayer**

Create `src/components/editor/Canvas/GridLayer.tsx`:

```tsx
import { Layer, Line } from 'react-konva'
import { useCanvasStore } from '../../../stores/canvasStore'

interface GridLayerProps {
  width: number
  height: number
}

export function GridLayer({ width, height }: GridLayerProps) {
  const { stageX, stageY, stageScale, settings } = useCanvasStore()

  if (!settings.showGrid) return null

  const gridSize = settings.gridSize
  const lines: React.ReactNode[] = []

  // Calculate visible area in canvas coordinates
  const startX = Math.floor(-stageX / stageScale / gridSize) * gridSize - gridSize
  const startY = Math.floor(-stageY / stageScale / gridSize) * gridSize - gridSize
  const endX = startX + width / stageScale + gridSize * 2
  const endY = startY + height / stageScale + gridSize * 2

  // Vertical lines
  for (let x = startX; x <= endX; x += gridSize) {
    lines.push(
      <Line
        key={`v-${x}`}
        points={[x, startY, x, endY]}
        stroke="#E5E7EB"
        strokeWidth={0.5 / stageScale}
        listening={false}
      />
    )
  }

  // Horizontal lines
  for (let y = startY; y <= endY; y += gridSize) {
    lines.push(
      <Line
        key={`h-${y}`}
        points={[startX, y, endX, y]}
        stroke="#E5E7EB"
        strokeWidth={0.5 / stageScale}
        listening={false}
      />
    )
  }

  return <Layer listening={false}>{lines}</Layer>
}
```

- [ ] **Step 2: Create CanvasStage**

Create `src/components/editor/Canvas/CanvasStage.tsx`:

```tsx
import { Stage } from 'react-konva'
import { useRef, useCallback, useState, useEffect } from 'react'
import type Konva from 'konva'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useUIStore } from '../../../stores/uiStore'
import { GridLayer } from './GridLayer'
import { ZOOM_MIN, ZOOM_MAX } from '../../../lib/constants'

export function CanvasStage() {
  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  const { stageX, stageY, stageScale, setStagePosition, setStageScale, activeTool } = useCanvasStore()
  const { clearSelection, setContextMenu } = useUIStore()

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Wheel zoom (zoom toward cursor)
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      const stage = stageRef.current
      if (!stage) return

      const oldScale = stageScale
      const pointer = stage.getPointerPosition()
      if (!pointer) return

      const scaleBy = 1.08
      const newScale = e.evt.deltaY < 0
        ? Math.min(ZOOM_MAX, oldScale * scaleBy)
        : Math.max(ZOOM_MIN, oldScale / scaleBy)

      const mousePointTo = {
        x: (pointer.x - stageX) / oldScale,
        y: (pointer.y - stageY) / oldScale,
      }

      setStageScale(newScale)
      setStagePosition(
        pointer.x - mousePointTo.x * newScale,
        pointer.y - mousePointTo.y * newScale
      )
    },
    [stageScale, stageX, stageY, setStageScale, setStagePosition]
  )

  // Pan with middle mouse or when pan tool active
  const isPanning = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Right click context menu
      if (e.evt.button === 2) {
        e.evt.preventDefault()
        setContextMenu({
          x: e.evt.clientX,
          y: e.evt.clientY,
          elementId: null,
        })
        return
      }

      // Middle mouse or pan tool
      if (e.evt.button === 1 || activeTool === 'pan') {
        isPanning.current = true
        lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
        return
      }

      // Click on empty canvas = deselect
      if (e.target === e.target.getStage()) {
        clearSelection()
        setContextMenu(null)
      }
    },
    [activeTool, clearSelection, setContextMenu]
  )

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isPanning.current) return
      const dx = e.evt.clientX - lastPointer.current.x
      const dy = e.evt.clientY - lastPointer.current.y
      lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
      setStagePosition(stageX + dx, stageY + dy)
    },
    [stageX, stageY, setStagePosition]
  )

  const handleMouseUp = useCallback(() => {
    isPanning.current = false
  }, [])

  const cursor = activeTool === 'pan' ? 'grab' : activeTool === 'wall' ? 'crosshair' : 'default'

  return (
    <div ref={containerRef} className="w-full h-full" style={{ cursor }}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={stageX}
        y={stageY}
        scaleX={stageScale}
        scaleY={stageScale}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        <GridLayer width={size.width} height={size.height} />
      </Stage>
    </div>
  )
}
```

- [ ] **Step 3: Wire CanvasStage into EditorPage**

Edit `src/components/editor/EditorPage.tsx` — replace the canvas placeholder:

```tsx
import { TopBar } from './TopBar'
import { ToolSelector } from './LeftSidebar/ToolSelector'
import { ElementLibrary } from './LeftSidebar/ElementLibrary'
import { RightSidebar } from './RightSidebar/RightSidebar'
import { StatusBar } from './StatusBar'
import { CanvasStage } from './Canvas/CanvasStage'
import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { useEffect } from 'react'

export function EditorPage() {
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen)
  const presentationMode = useUIStore((s) => s.presentationMode)
  const createNewProject = useProjectStore((s) => s.createNewProject)
  const currentProject = useProjectStore((s) => s.currentProject)

  useEffect(() => {
    if (!currentProject) {
      createNewProject()
    }
  }, [currentProject, createNewProject])

  if (presentationMode) {
    return (
      <div className="w-screen h-screen bg-white">
        <CanvasStage />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-50">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-[260px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <ToolSelector />
          <div className="border-t border-gray-200" />
          <ElementLibrary />
        </div>

        {/* Canvas */}
        <div className="flex-1 relative bg-gray-100 overflow-hidden">
          <CanvasStage />
          <StatusBar />
        </div>

        {/* Right Sidebar */}
        {rightSidebarOpen && (
          <div className="w-[320px] flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
            <RightSidebar />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify it builds**

```bash
npm run build
```

Expected: Build succeeds. Running `npm run dev` shows the editor with a grid canvas that pans (middle mouse) and zooms (scroll wheel).

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat: add Konva canvas with grid, pan (middle-mouse/tool), and scroll-wheel zoom"
```

---

### Task 8: Render elements on canvas

**Files:**
- Create: `src/components/editor/Canvas/ElementRenderer.tsx`, `src/components/editor/Canvas/TableRenderer.tsx`, `src/components/editor/Canvas/FurnitureRenderer.tsx`, `src/components/editor/Canvas/SeatLabelsLayer.tsx`
- Modify: `src/components/editor/Canvas/CanvasStage.tsx`

- [ ] **Step 1: Create TableRenderer**

Create `src/components/editor/Canvas/TableRenderer.tsx`:

```tsx
import { Group, Rect, Circle, Ellipse, Text } from 'react-konva'
import type { TableElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { useSeatingStore } from '../../../stores/seatingStore'
import { UNASSIGNED_SEAT_FILL, UNASSIGNED_SEAT_STROKE } from '../../../lib/constants'

interface TableRendererProps {
  element: TableElement
}

export function TableRenderer({ element }: TableRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  const guests = useSeatingStore((s) => s.guests)
  const getGroupColor = useSeatingStore((s) => s.getGroupColor)

  const isRound = element.type === 'table-round'

  return (
    <Group
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      listening={!element.locked}
    >
      {/* Table shape */}
      {isRound ? (
        <Ellipse
          radiusX={element.width / 2}
          radiusY={element.height / 2}
          fill={element.style.fill}
          stroke={isSelected ? '#3B82F6' : element.style.stroke}
          strokeWidth={isSelected ? 2.5 : element.style.strokeWidth}
        />
      ) : (
        <Rect
          x={-element.width / 2}
          y={-element.height / 2}
          width={element.width}
          height={element.height}
          fill={element.style.fill}
          stroke={isSelected ? '#3B82F6' : element.style.stroke}
          strokeWidth={isSelected ? 2.5 : element.style.strokeWidth}
          cornerRadius={4}
        />
      )}

      {/* Table label */}
      <Text
        text={element.label}
        x={-element.width / 2}
        y={-6}
        width={element.width}
        align="center"
        fontSize={11}
        fill="#6B7280"
        listening={false}
      />

      {/* Seats */}
      {element.seats.map((seat) => {
        const guest = seat.assignedGuestId ? guests[seat.assignedGuestId] : null
        const groupColor = guest?.groupName ? getGroupColor(guest.groupName) : null

        return (
          <Group key={seat.id} x={seat.offsetX} y={seat.offsetY}>
            <Circle
              radius={10}
              fill={guest ? (groupColor || '#93C5FD') : UNASSIGNED_SEAT_FILL}
              stroke={guest ? (groupColor || '#3B82F6') : UNASSIGNED_SEAT_STROKE}
              strokeWidth={1.5}
              dash={guest ? undefined : [3, 3]}
            />
            {guest && (
              <Text
                text={guest.name.split(' ')[0]}
                x={-20}
                y={12}
                width={40}
                align="center"
                fontSize={8}
                fill="#374151"
                listening={false}
              />
            )}
          </Group>
        )
      })}
    </Group>
  )
}
```

- [ ] **Step 2: Create FurnitureRenderer**

Create `src/components/editor/Canvas/FurnitureRenderer.tsx`:

```tsx
import { Group, Rect, Text } from 'react-konva'
import type { BaseElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'

interface FurnitureRendererProps {
  element: BaseElement
}

export function FurnitureRenderer({ element }: FurnitureRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)

  return (
    <Group
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      listening={!element.locked}
    >
      <Rect
        x={-element.width / 2}
        y={-element.height / 2}
        width={element.width}
        height={element.height}
        fill={element.style.fill}
        stroke={isSelected ? '#3B82F6' : element.style.stroke}
        strokeWidth={isSelected ? 2.5 : element.style.strokeWidth}
        cornerRadius={3}
        opacity={element.style.opacity}
      />
      <Text
        text={element.label}
        x={-element.width / 2}
        y={-6}
        width={element.width}
        align="center"
        fontSize={10}
        fill="#6B7280"
        listening={false}
      />
    </Group>
  )
}
```

- [ ] **Step 3: Create ElementRenderer dispatcher**

Create `src/components/editor/Canvas/ElementRenderer.tsx`:

```tsx
import { Layer, Group } from 'react-konva'
import { useElementsStore } from '../../../stores/elementsStore'
import { useUIStore } from '../../../stores/uiStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { isTableElement } from '../../../types/elements'
import { TableRenderer } from './TableRenderer'
import { FurnitureRenderer } from './FurnitureRenderer'
import { useCallback } from 'react'
import type Konva from 'konva'
import { snapToGrid } from '../../../lib/geometry'

export function ElementRenderer() {
  const elements = useElementsStore((s) => s.elements)
  const updateElement = useElementsStore((s) => s.updateElement)
  const { setSelectedIds, toggleSelection, setContextMenu } = useUIStore()
  const activeTool = useCanvasStore((s) => s.activeTool)
  const gridSize = useCanvasStore((s) => s.settings.gridSize)
  const showGrid = useCanvasStore((s) => s.settings.showGrid)

  const sorted = Object.values(elements)
    .filter((el) => el.visible)
    .sort((a, b) => a.zIndex - b.zIndex)

  const handleDragEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      let x = e.target.x()
      let y = e.target.y()
      if (showGrid) {
        x = snapToGrid(x, gridSize)
        y = snapToGrid(y, gridSize)
      }
      updateElement(id, { x, y })
    },
    [updateElement, gridSize, showGrid]
  )

  const handleClick = useCallback(
    (id: string, e: Konva.KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true
      if (activeTool !== 'select') return
      if (e.evt.shiftKey) {
        toggleSelection(id)
      } else {
        setSelectedIds([id])
      }
    },
    [activeTool, setSelectedIds, toggleSelection]
  )

  const handleContextMenu = useCallback(
    (id: string, e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault()
      e.cancelBubble = true
      setSelectedIds([id])
      setContextMenu({
        x: e.evt.clientX,
        y: e.evt.clientY,
        elementId: id,
      })
    },
    [setSelectedIds, setContextMenu]
  )

  return (
    <Layer>
      {sorted.map((el) => {
        const draggable = activeTool === 'select' && !el.locked

        return (
          <Group
            key={el.id}
            draggable={draggable}
            onDragEnd={(e) => handleDragEnd(el.id, e)}
            onClick={(e) => handleClick(el.id, e)}
            onTap={(e) => handleClick(el.id, e)}
            onContextMenu={(e) => handleContextMenu(el.id, e)}
          >
            {isTableElement(el) ? (
              <TableRenderer element={el} />
            ) : (
              <FurnitureRenderer element={el} />
            )}
          </Group>
        )
      })}
    </Layer>
  )
}
```

- [ ] **Step 4: Wire ElementRenderer into CanvasStage**

In `src/components/editor/Canvas/CanvasStage.tsx`, add the import and component inside the `<Stage>`:

Add import at top:
```tsx
import { ElementRenderer } from './ElementRenderer'
```

Inside the `<Stage>` after `<GridLayer>`:
```tsx
<ElementRenderer />
```

- [ ] **Step 5: Verify it builds**

```bash
npm run build
```

Expected: Build succeeds. Clicking elements in the left sidebar library adds them to the canvas. Elements are draggable with grid snapping.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: render tables and furniture on canvas with drag, snap, selection"
```

---

### Task 9: Keyboard shortcuts

**Files:**
- Create: `src/hooks/useKeyboardShortcuts.ts`, `src/components/editor/KeyboardShortcutsOverlay.tsx`
- Modify: `src/components/editor/EditorPage.tsx`

- [ ] **Step 1: Create keyboard shortcuts hook**

Create `src/hooks/useKeyboardShortcuts.ts`:

```typescript
import { useEffect } from 'react'
import { useElementsStore } from '../stores/elementsStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useUIStore } from '../stores/uiStore'

export function useKeyboardShortcuts() {
  const { selectedIds, clearSelection, setPresentationMode, presentationMode, setShortcutsOverlayOpen } = useUIStore()
  const { removeElements, duplicateElements, moveElements, groupElements, ungroupElements } = useElementsStore()
  const elements = useElementsStore((s) => s.elements)
  const { setActiveTool, toggleGrid, zoomIn, zoomOut, resetZoom } = useCanvasStore()
  const undo = useElementsStore.temporal.getState().undo
  const redo = useElementsStore.temporal.getState().redo

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      const mod = e.metaKey || e.ctrlKey

      // Escape
      if (e.key === 'Escape') {
        if (presentationMode) {
          setPresentationMode(false)
        } else {
          clearSelection()
          setActiveTool('select')
        }
        return
      }

      // Undo/Redo
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
      if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); return }
      if (mod && e.key === 'Z') { e.preventDefault(); redo(); return }

      // Delete
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault()
        removeElements(selectedIds)
        clearSelection()
        return
      }

      // Duplicate
      if (mod && e.key === 'd') {
        e.preventDefault()
        if (selectedIds.length > 0) {
          const newIds = duplicateElements(selectedIds)
          useUIStore.getState().setSelectedIds(newIds)
        }
        return
      }

      // Select all
      if (mod && e.key === 'a') {
        e.preventDefault()
        useUIStore.getState().setSelectedIds(Object.keys(elements))
        return
      }

      // Group
      if (mod && e.key === 'g' && !e.shiftKey) {
        e.preventDefault()
        if (selectedIds.length > 1) groupElements(selectedIds)
        return
      }

      // Ungroup
      if (mod && e.key === 'g' && e.shiftKey) {
        e.preventDefault()
        if (selectedIds.length === 1) {
          const el = elements[selectedIds[0]]
          if (el?.groupId) ungroupElements(el.groupId)
        }
        return
      }

      // Lock
      if (mod && e.key === 'l') {
        e.preventDefault()
        for (const id of selectedIds) {
          const el = elements[id]
          if (el) useElementsStore.getState().updateElement(id, { locked: !el.locked })
        }
        return
      }

      // Nudge
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (selectedIds.length === 0) return
        e.preventDefault()
        const amount = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -amount : e.key === 'ArrowRight' ? amount : 0
        const dy = e.key === 'ArrowUp' ? -amount : e.key === 'ArrowDown' ? amount : 0
        moveElements(selectedIds, dx, dy)
        return
      }

      // Zoom
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); return }
      if (mod && e.key === '-') { e.preventDefault(); zoomOut(); return }
      if (mod && e.key === '0') { e.preventDefault(); resetZoom(); return }

      // Tool shortcuts (single key, no modifier)
      if (!mod) {
        if (e.key === 'v' || e.key === 'V') { setActiveTool('select'); return }
        if (e.key === 'w' || e.key === 'W') { setActiveTool('wall'); return }
        if (e.key === 'g' || e.key === 'G') { toggleGrid(); return }
        if (e.key === 'p' || e.key === 'P') { setPresentationMode(!presentationMode); return }
        if (e.key === '?') { setShortcutsOverlayOpen(true); return }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    selectedIds, elements, presentationMode,
    clearSelection, removeElements, duplicateElements, moveElements,
    groupElements, ungroupElements, setActiveTool, toggleGrid,
    zoomIn, zoomOut, resetZoom, setPresentationMode, setShortcutsOverlayOpen,
    undo, redo,
  ])
}
```

- [ ] **Step 2: Create shortcuts overlay**

Create `src/components/editor/KeyboardShortcutsOverlay.tsx`:

```tsx
import { useUIStore } from '../../stores/uiStore'

const shortcuts = [
  { keys: 'Ctrl+Z', action: 'Undo' },
  { keys: 'Ctrl+Shift+Z', action: 'Redo' },
  { keys: 'Delete', action: 'Delete selected' },
  { keys: 'Ctrl+D', action: 'Duplicate' },
  { keys: 'Ctrl+A', action: 'Select all' },
  { keys: 'Ctrl+G', action: 'Group' },
  { keys: 'Ctrl+Shift+G', action: 'Ungroup' },
  { keys: 'Ctrl+L', action: 'Lock/Unlock' },
  { keys: 'Arrows', action: 'Nudge (Shift=10px)' },
  { keys: 'Ctrl++/-', action: 'Zoom in/out' },
  { keys: 'Ctrl+0', action: 'Reset zoom' },
  { keys: 'V', action: 'Select tool' },
  { keys: 'W', action: 'Wall tool' },
  { keys: 'G', action: 'Toggle grid' },
  { keys: 'P', action: 'Presentation mode' },
  { keys: 'Escape', action: 'Deselect / exit' },
  { keys: '?', action: 'Show shortcuts' },
]

export function KeyboardShortcutsOverlay() {
  const open = useUIStore((s) => s.shortcutsOverlayOpen)
  const setOpen = useUIStore((s) => s.setShortcutsOverlayOpen)

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Keyboard Shortcuts</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="grid grid-cols-2 gap-y-2 gap-x-4">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between col-span-2">
              <span className="text-sm text-gray-600">{s.action}</span>
              <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded text-xs font-mono text-gray-700">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire into EditorPage**

In `src/components/editor/EditorPage.tsx`, add imports and usage:

Add imports:
```tsx
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { KeyboardShortcutsOverlay } from './KeyboardShortcutsOverlay'
```

Add inside `EditorPage()` before the `if (presentationMode)`:
```tsx
useKeyboardShortcuts()
```

Add `<KeyboardShortcutsOverlay />` right before the closing `</div>` of the outer container.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Keyboard shortcuts work (V for select, W for wall, Ctrl+Z undo, etc.).

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat: add keyboard shortcuts and shortcuts overlay (?, Ctrl+Z, V, W, G, P, etc.)"
```

---

### Task 10: Context menu

**Files:**
- Create: `src/components/editor/ContextMenu.tsx`
- Modify: `src/components/editor/EditorPage.tsx`

- [ ] **Step 1: Create ContextMenu**

Create `src/components/editor/ContextMenu.tsx`:

```tsx
import { useUIStore } from '../../stores/uiStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useEffect, useRef } from 'react'

export function ContextMenu() {
  const contextMenu = useUIStore((s) => s.contextMenu)
  const setContextMenu = useUIStore((s) => s.setContextMenu)
  const selectedIds = useUIStore((s) => s.selectedIds)
  const setSelectedIds = useUIStore((s) => s.setSelectedIds)
  const setEditingLabelId = useUIStore((s) => s.setEditingLabelId)
  const { removeElements, duplicateElements, bringToFront, sendToBack, bringForward, sendBackward, groupElements, ungroupElements, updateElement } = useElementsStore()
  const elements = useElementsStore((s) => s.elements)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [setContextMenu])

  if (!contextMenu) return null

  const el = contextMenu.elementId ? elements[contextMenu.elementId] : null
  const isMulti = selectedIds.length > 1

  const items: { label: string; shortcut?: string; onClick: () => void; separator?: boolean; disabled?: boolean }[] = []

  if (el) {
    items.push({ label: 'Edit Label', onClick: () => { setEditingLabelId(el.id) } })
    items.push({ label: '', onClick: () => {}, separator: true })
    items.push({ label: 'Duplicate', shortcut: 'Ctrl+D', onClick: () => {
      const newIds = duplicateElements(selectedIds.length ? selectedIds : [el.id])
      setSelectedIds(newIds)
    }})
    items.push({ label: 'Delete', shortcut: 'Del', onClick: () => {
      removeElements(selectedIds.length ? selectedIds : [el.id])
      useUIStore.getState().clearSelection()
    }})
    items.push({ label: '', onClick: () => {}, separator: true })
    items.push({ label: 'Bring to Front', onClick: () => bringToFront(el.id) })
    items.push({ label: 'Bring Forward', onClick: () => bringForward(el.id) })
    items.push({ label: 'Send Backward', onClick: () => sendBackward(el.id) })
    items.push({ label: 'Send to Back', onClick: () => sendToBack(el.id) })
    items.push({ label: '', onClick: () => {}, separator: true })
    items.push({
      label: el.locked ? 'Unlock' : 'Lock',
      shortcut: 'Ctrl+L',
      onClick: () => updateElement(el.id, { locked: !el.locked }),
    })
    if (isMulti) {
      items.push({ label: 'Group', shortcut: 'Ctrl+G', onClick: () => groupElements(selectedIds) })
    }
    if (el.groupId) {
      items.push({ label: 'Ungroup', shortcut: 'Ctrl+Shift+G', onClick: () => ungroupElements(el.groupId!) })
    }
  } else {
    // Canvas context menu
    items.push({ label: 'Select All', shortcut: 'Ctrl+A', onClick: () => setSelectedIds(Object.keys(elements)) })
    items.push({ label: '', onClick: () => {}, separator: true })
    items.push({ label: 'Toggle Grid', shortcut: 'G', onClick: () => {
      const { toggleGrid } = require('../../stores/canvasStore').useCanvasStore.getState()
      toggleGrid()
    }})
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px]"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="h-px bg-gray-100 my-1" />
        ) : (
          <button
            key={i}
            onClick={() => { item.onClick(); setContextMenu(null) }}
            disabled={item.disabled}
            className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40"
          >
            <span>{item.label}</span>
            {item.shortcut && <span className="text-xs text-gray-400 ml-4">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into EditorPage**

In `src/components/editor/EditorPage.tsx`, add import and render `<ContextMenu />` next to the `KeyboardShortcutsOverlay`.

```tsx
import { ContextMenu } from './ContextMenu'
```

Add `<ContextMenu />` before `<KeyboardShortcutsOverlay />`.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Right-clicking elements shows context menu with appropriate actions.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: add right-click context menu with element and canvas actions"
```

---

## Phase 4: Seating System & Guest Management

### Task 11: Guest list panel with add, search, sort, CSV import

**Files:**
- Create: `src/components/editor/RightSidebar/GuestListPanel.tsx`, `src/components/editor/RightSidebar/CSVImportDialog.tsx`, `src/lib/csv.ts`
- Modify: `src/components/editor/RightSidebar/RightSidebar.tsx`

- [ ] **Step 1: Create CSV parser**

Create `src/lib/csv.ts`:

```typescript
import Papa from 'papaparse'
import type { GuestImportRow } from '../types/guests'

export interface CSVParseResult {
  headers: string[]
  rows: GuestImportRow[]
  errors: string[]
}

export function parseGuestCSV(text: string): CSVParseResult {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const headers = result.meta.fields || []
  const errors = result.errors.map((e) => `Row ${e.row}: ${e.message}`)

  const rows: GuestImportRow[] = result.data.map((row) => ({
    name: row.name || row.full_name || row.fullname || '',
    group: row.group || row.group_name || row.party || row.table_group || undefined,
    dietary: row.dietary || row.diet || row.dietary_restrictions || row.food || undefined,
    vip: row.vip === 'true' || row.vip === 'yes' || row.vip === '1' || false,
    ...row,
  }))

  return { headers, rows: rows.filter((r) => r.name.trim() !== ''), errors }
}

export function exportGuestsCSV(
  guests: Array<{
    name: string
    group: string
    table: string
    seat: string
    dietary: string
    vip: boolean
  }>
): string {
  return Papa.unparse(guests)
}
```

- [ ] **Step 2: Create GuestListPanel**

Create `src/components/editor/RightSidebar/GuestListPanel.tsx`:

```tsx
import { useSeatingStore } from '../../../stores/seatingStore'
import { useUIStore } from '../../../stores/uiStore'
import { useState } from 'react'
import { Search, Plus, Upload, Users, X } from 'lucide-react'

export function GuestListPanel() {
  const { searchQuery, setSearchQuery, sortBy, setSortBy, addGuest, removeGuest, getFilteredGuests, getAssignedCount } = useSeatingStore()
  const setCsvImportOpen = useUIStore((s) => s.setCsvImportOpen)
  const guests = getFilteredGuests()
  const totalGuests = Object.keys(useSeatingStore.getState().guests).length
  const assignedCount = getAssignedCount()

  const [newName, setNewName] = useState('')
  const [newGroup, setNewGroup] = useState('')

  const handleAddGuest = () => {
    if (!newName.trim()) return
    addGuest(newName.trim(), newGroup.trim() || undefined)
    setNewName('')
    setNewGroup('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Users size={14} className="text-gray-500" />
        <span className="text-sm font-medium text-gray-700">
          {assignedCount} of {totalGuests} assigned
        </span>
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
        <input
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          placeholder="Search guests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Sort + Import */}
      <div className="flex items-center gap-2 mb-3">
        <select
          className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 text-gray-600"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'group' | 'status')}
        >
          <option value="name">Sort by Name</option>
          <option value="group">Sort by Group</option>
          <option value="status">Sort by Status</option>
        </select>
        <button
          onClick={() => setCsvImportOpen(true)}
          className="flex items-center gap-1 px-2 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50"
        >
          <Upload size={12} />
          CSV
        </button>
      </div>

      {/* Add guest inline */}
      <div className="flex gap-1 mb-3">
        <input
          className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          placeholder="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddGuest() }}
        />
        <input
          className="w-20 text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          placeholder="Group"
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddGuest() }}
        />
        <button
          onClick={handleAddGuest}
          className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
          title="Add guest"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Guest list */}
      <div className="flex-1 overflow-y-auto -mx-3 px-3">
        {guests.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            No guests yet. Add manually or import CSV.
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {guests.map((guest) => (
              <div
                key={guest.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 group cursor-grab"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/guest-id', guest.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
              >
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    guest.seatElementId ? 'bg-green-500' : 'bg-red-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 truncate">{guest.name}</div>
                  {guest.groupName && (
                    <div className="text-[10px] text-gray-400 truncate">{guest.groupName}</div>
                  )}
                </div>
                {guest.vip && (
                  <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 rounded">VIP</span>
                )}
                <button
                  onClick={() => removeGuest(guest.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create CSVImportDialog**

Create `src/components/editor/RightSidebar/CSVImportDialog.tsx`:

```tsx
import { useUIStore } from '../../../stores/uiStore'
import { useSeatingStore } from '../../../stores/seatingStore'
import { parseGuestCSV } from '../../../lib/csv'
import { useState, useCallback } from 'react'

export function CSVImportDialog() {
  const open = useUIStore((s) => s.csvImportOpen)
  const setOpen = useUIStore((s) => s.setCsvImportOpen)
  const addGuests = useSeatingStore((s) => s.addGuests)

  const [csvText, setCsvText] = useState('')
  const [preview, setPreview] = useState<ReturnType<typeof parseGuestCSV> | null>(null)

  const handleParse = useCallback(() => {
    const result = parseGuestCSV(csvText)
    setPreview(result)
  }, [csvText])

  const handleImport = useCallback(() => {
    if (!preview) return
    addGuests(
      preview.rows.map((r) => ({
        name: r.name,
        groupName: r.group || null,
        dietary: r.dietary || null,
        vip: r.vip === true || r.vip === 'true',
        customAttributes: {},
      }))
    )
    setOpen(false)
    setCsvText('')
    setPreview(null)
  }, [preview, addGuests, setOpen])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string || '')
    }
    reader.readAsText(file)
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Import Guests from CSV</h2>

        <div className="mb-3">
          <label className="block text-sm text-gray-600 mb-1">Upload CSV file or paste below</label>
          <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="text-sm mb-2" />
          <textarea
            className="w-full h-32 border border-gray-200 rounded-lg p-3 text-sm font-mono focus:outline-none focus:border-blue-400"
            placeholder={`name,group,dietary,vip\nJane Smith,Bride's Family,Vegetarian,true\nJohn Doe,Groom's Friends,,false`}
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setPreview(null) }}
          />
        </div>

        {!preview ? (
          <button
            onClick={handleParse}
            disabled={!csvText.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            Preview
          </button>
        ) : (
          <>
            {preview.errors.length > 0 && (
              <div className="mb-3 p-2 bg-red-50 text-red-700 text-xs rounded">
                {preview.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            <div className="mb-3 max-h-40 overflow-y-auto border border-gray-200 rounded">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1 text-left">Name</th>
                    <th className="px-2 py-1 text-left">Group</th>
                    <th className="px-2 py-1 text-left">Dietary</th>
                    <th className="px-2 py-1 text-left">VIP</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1">{r.group || '—'}</td>
                      <td className="px-2 py-1">{r.dietary || '—'}</td>
                      <td className="px-2 py-1">{String(r.vip)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 10 && (
                <div className="px-2 py-1 text-gray-400 text-center">
                  ...and {preview.rows.length - 10} more
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Import {preview.rows.length} guests
              </button>
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-gray-600 text-sm hover:bg-gray-100 rounded-lg">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire GuestListPanel into RightSidebar**

Update `src/components/editor/RightSidebar/RightSidebar.tsx` to import and render the GuestListPanel:

```tsx
import { useUIStore } from '../../../stores/uiStore'
import { GuestListPanel } from './GuestListPanel'

export function RightSidebar() {
  const tab = useUIStore((s) => s.rightSidebarTab)
  const setTab = useUIStore((s) => s.setRightSidebarTab)

  const tabs = [
    { id: 'properties' as const, label: 'Properties' },
    { id: 'guests' as const, label: 'Guests' },
    { id: 'comments' as const, label: 'Comments' },
    { id: 'versions' as const, label: 'Versions' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-2.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? 'text-blue-700 border-b-2 border-blue-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'properties' && <div className="text-sm text-gray-400">Select an element to see its properties</div>}
        {tab === 'guests' && <GuestListPanel />}
        {tab === 'comments' && <div className="text-sm text-gray-400">Comments panel</div>}
        {tab === 'versions' && <div className="text-sm text-gray-400">Version history panel</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Add CSVImportDialog to EditorPage**

In `src/components/editor/EditorPage.tsx`, add:

```tsx
import { CSVImportDialog } from './RightSidebar/CSVImportDialog'
```

Render `<CSVImportDialog />` alongside the other overlays.

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Guest list panel renders in right sidebar with add, search, sort, CSV import functionality.

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "feat: add guest list panel with add, search, sort, and CSV import"
```

---

### Task 12: Properties panel for selected elements

**Files:**
- Create: `src/components/editor/RightSidebar/PropertiesPanel.tsx`
- Modify: `src/components/editor/RightSidebar/RightSidebar.tsx`

- [ ] **Step 1: Create PropertiesPanel**

Create `src/components/editor/RightSidebar/PropertiesPanel.tsx`:

```tsx
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { isTableElement } from '../../../types/elements'
import { computeSeatPositions } from '../../../lib/seatLayout'
import type { TableElement } from '../../../types/elements'

export function PropertiesPanel() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const elements = useElementsStore((s) => s.elements)
  const updateElement = useElementsStore((s) => s.updateElement)

  if (selectedIds.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">Select an element to see its properties</div>
  }

  if (selectedIds.length > 1) {
    return <div className="text-sm text-gray-500 text-center py-8">{selectedIds.length} elements selected</div>
  }

  const el = elements[selectedIds[0]]
  if (!el) return null

  const update = (updates: Record<string, unknown>) => updateElement(el.id, updates)

  return (
    <div className="flex flex-col gap-4">
      {/* Label */}
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Label</label>
        <input
          className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          value={el.label}
          onChange={(e) => update({ label: e.target.value })}
        />
      </div>

      {/* Position */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">X</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            value={Math.round(el.x)}
            onChange={(e) => update({ x: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Y</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            value={Math.round(el.y)}
            onChange={(e) => update({ y: Number(e.target.value) })}
          />
        </div>
      </div>

      {/* Size */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Width</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            value={Math.round(el.width)}
            onChange={(e) => update({ width: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Height</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            value={Math.round(el.height)}
            onChange={(e) => update({ height: Number(e.target.value) })}
          />
        </div>
      </div>

      {/* Rotation */}
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Rotation</label>
        <input
          type="number"
          className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          value={Math.round(el.rotation)}
          onChange={(e) => update({ rotation: Number(e.target.value) % 360 })}
          min={0}
          max={359}
        />
      </div>

      {/* Style */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Fill</label>
          <input
            type="color"
            className="w-full h-8 border border-gray-200 rounded cursor-pointer"
            value={el.style.fill}
            onChange={(e) => update({ style: { ...el.style, fill: e.target.value } })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Stroke</label>
          <input
            type="color"
            className="w-full h-8 border border-gray-200 rounded cursor-pointer"
            value={el.style.stroke}
            onChange={(e) => update({ style: { ...el.style, stroke: e.target.value } })}
          />
        </div>
      </div>

      {/* Table-specific: seat count */}
      {isTableElement(el) && (
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Seats</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            value={el.seatCount}
            min={1}
            max={30}
            onChange={(e) => {
              const count = Number(e.target.value)
              const seats = computeSeatPositions(el.type, count, el.seatLayout, el.width, el.height)
              update({ seatCount: count, seats } as Partial<TableElement>)
            }}
          />
        </div>
      )}

      {/* Locked toggle */}
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={el.locked}
          onChange={(e) => update({ locked: e.target.checked })}
          className="rounded"
        />
        Locked
      </label>
    </div>
  )
}
```

- [ ] **Step 2: Wire into RightSidebar**

Update the properties tab in `src/components/editor/RightSidebar/RightSidebar.tsx`:

```tsx
import { PropertiesPanel } from './PropertiesPanel'
```

Replace the properties placeholder:
```tsx
{tab === 'properties' && <PropertiesPanel />}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Selecting an element shows its properties in the right sidebar with editable fields.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: add properties panel for selected elements with position, size, rotation, style, seats"
```

---

## Phase 5: Export System

### Task 13: Export PNG, PDF, CSV, JSON

**Files:**
- Create: `src/lib/exportPng.ts`, `src/lib/exportPdf.ts`, `src/lib/exportJson.ts`, `src/components/editor/ExportDialog.tsx`
- Modify: `src/components/editor/EditorPage.tsx`

- [ ] **Step 1: Create PNG export**

Create `src/lib/exportPng.ts`:

```typescript
import type Konva from 'konva'

export function exportPng(stage: Konva.Stage, options: {
  pixelRatio?: number
  fileName?: string
}) {
  const { pixelRatio = 1, fileName = 'floorplan.png' } = options

  const dataUrl = stage.toDataURL({ pixelRatio })
  const link = document.createElement('a')
  link.download = fileName
  link.href = dataUrl
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
```

- [ ] **Step 2: Create PDF export**

Create `src/lib/exportPdf.ts`:

```typescript
import { jsPDF } from 'jspdf'
import type Konva from 'konva'

export function exportPdf(stage: Konva.Stage, options: {
  paperSize?: 'a4' | 'a3' | 'letter'
  orientation?: 'landscape' | 'portrait'
  dpi?: 150 | 300
  fileName?: string
  title?: string
}) {
  const {
    paperSize = 'a4',
    orientation = 'landscape',
    dpi = 150,
    fileName = 'floorplan.pdf',
    title,
  } = options

  const pixelRatio = dpi / 72
  const dataUrl = stage.toDataURL({ pixelRatio })

  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: paperSize,
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  if (title) {
    doc.setFontSize(16)
    doc.text(title, 20, 30)
  }

  const topMargin = title ? 50 : 20
  const imgWidth = pageWidth - 40
  const imgHeight = pageHeight - topMargin - 20

  doc.addImage(dataUrl, 'PNG', 20, topMargin, imgWidth, imgHeight)
  doc.save(fileName)
}
```

- [ ] **Step 3: Create JSON export**

Create `src/lib/exportJson.ts`:

```typescript
import type { CanvasElement } from '../types/elements'
import type { Guest } from '../types/guests'
import type { CanvasSettings } from '../types/project'

export interface FlooraftExport {
  version: string
  project: {
    name: string
    settings: CanvasSettings
  }
  elements: CanvasElement[]
  guests: Guest[]
  exportedAt: string
}

export function exportProjectJson(
  name: string,
  settings: CanvasSettings,
  elements: Record<string, CanvasElement>,
  guests: Record<string, Guest>,
  fileName?: string
) {
  const data: FlooraftExport = {
    version: '1.0',
    project: { name, settings },
    elements: Object.values(elements),
    guests: Object.values(guests),
    exportedAt: new Date().toISOString(),
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = fileName || `${name.replace(/\s+/g, '-').toLowerCase()}.json`
  link.href = url
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 4: Create ExportDialog**

Create `src/components/editor/ExportDialog.tsx`:

```tsx
import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useSeatingStore } from '../../stores/seatingStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { exportProjectJson } from '../../lib/exportJson'
import { exportGuestsCSV } from '../../lib/csv'
import { isTableElement } from '../../types/elements'
import { Image, FileText, Table, FileJson, X } from 'lucide-react'

export function ExportDialog() {
  const open = useUIStore((s) => s.exportDialogOpen)
  const setOpen = useUIStore((s) => s.setExportDialogOpen)
  const project = useProjectStore((s) => s.currentProject)
  const elements = useElementsStore((s) => s.elements)
  const guests = useSeatingStore((s) => s.guests)
  const settings = useCanvasStore((s) => s.settings)

  if (!open) return null

  const projectName = project?.name || 'floorplan'

  const handleExportJSON = () => {
    exportProjectJson(projectName, settings, elements, guests)
    setOpen(false)
  }

  const handleExportCSV = () => {
    const guestList = Object.values(guests).map((g) => {
      let tableName = ''
      let seatName = ''
      if (g.seatElementId) {
        for (const el of Object.values(elements)) {
          if (isTableElement(el)) {
            const seat = el.seats.find((s) => s.id === g.seatElementId)
            if (seat) {
              tableName = el.label
              seatName = `Seat ${el.seats.indexOf(seat) + 1}`
              break
            }
          }
        }
      }
      return {
        name: g.name,
        group: g.groupName || '',
        table: tableName,
        seat: seatName,
        dietary: g.dietary || '',
        vip: g.vip,
      }
    })
    const csv = exportGuestsCSV(guestList)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = `${projectName}-guests.csv`
    link.href = url
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  const exports = [
    { icon: <Image size={20} />, label: 'PNG Image', desc: 'Standard or high-res image', onClick: () => { /* Will wire to canvas ref */ setOpen(false) } },
    { icon: <FileText size={20} />, label: 'PDF Document', desc: 'Print-ready at 300dpi', onClick: () => { setOpen(false) } },
    { icon: <Table size={20} />, label: 'Guest List (CSV)', desc: 'Spreadsheet with assignments', onClick: handleExportCSV },
    { icon: <FileJson size={20} />, label: 'Project Backup (JSON)', desc: 'Full project data for import', onClick: handleExportJSON },
  ]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Export</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-2">
          {exports.map((exp) => (
            <button
              key={exp.label}
              onClick={exp.onClick}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 border border-gray-100 text-left transition-colors"
            >
              <div className="text-gray-500">{exp.icon}</div>
              <div>
                <div className="text-sm font-medium text-gray-800">{exp.label}</div>
                <div className="text-xs text-gray-400">{exp.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Wire into EditorPage**

In `src/components/editor/EditorPage.tsx`, add:

```tsx
import { ExportDialog } from './ExportDialog'
```

Render `<ExportDialog />` with the other overlays.

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Export dialog opens from TopBar, JSON and CSV exports work.

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "feat: add export system with PNG, PDF, CSV, and JSON export options"
```

---

## Phase 6: Templates

### Task 14: Template system with wedding, corporate, restaurant presets

**Files:**
- Create: `src/data/templates/index.ts`, `src/data/templates/wedding-reception.ts`, `src/data/templates/corporate-boardroom.ts`, `src/data/templates/fine-dining.ts`, `src/components/dashboard/NewProjectModal.tsx`

- [ ] **Step 1: Create wedding reception template**

Create `src/data/templates/wedding-reception.ts`:

```typescript
import { nanoid } from 'nanoid'
import type { CanvasElement, TableElement } from '../../types/elements'
import { computeSeatPositions } from '../../lib/seatLayout'

function makeTable(
  x: number, y: number, label: string,
  type: 'table-round' | 'table-rect' = 'table-round',
  seatCount = 8
): TableElement {
  const width = type === 'table-round' ? 80 : 120
  const height = type === 'table-round' ? 80 : 60
  const layout = type === 'table-round' ? 'around' as const : 'both-sides' as const
  return {
    id: nanoid(),
    type,
    x, y,
    width, height,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label,
    visible: true,
    style: { fill: '#F3F4F6', stroke: '#6B7280', strokeWidth: 2, opacity: 1 },
    seatCount,
    seatLayout: layout,
    seats: computeSeatPositions(type, seatCount, layout, width, height),
  }
}

export function createWeddingReceptionTemplate(): CanvasElement[] {
  const elements: CanvasElement[] = []

  // 10 round tables in two rows of 5
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      elements.push(makeTable(
        150 + col * 160,
        200 + row * 200,
        `Table ${row * 5 + col + 1}`
      ))
    }
  }

  // Head table (rectangular, 12 seats)
  elements.push(makeTable(470, 50, 'Head Table', 'table-rect', 12))

  // Dance floor
  elements.push({
    id: nanoid(), type: 'dance-floor',
    x: 470, y: 550, width: 200, height: 200, rotation: 0,
    locked: false, groupId: null, zIndex: 0,
    label: 'Dance Floor', visible: true,
    style: { fill: '#EDE9FE', stroke: '#7C3AED', strokeWidth: 2, opacity: 1 },
  })

  // Stage
  elements.push({
    id: nanoid(), type: 'stage',
    x: 470, y: 700, width: 240, height: 80, rotation: 0,
    locked: false, groupId: null, zIndex: 0,
    label: 'Stage', visible: true,
    style: { fill: '#FEE2E2', stroke: '#B91C1C', strokeWidth: 2, opacity: 1 },
  })

  // Bar
  elements.push({
    id: nanoid(), type: 'bar',
    x: 850, y: 400, width: 40, height: 160, rotation: 0,
    locked: false, groupId: null, zIndex: 0,
    label: 'Bar', visible: true,
    style: { fill: '#FED7AA', stroke: '#C2410C', strokeWidth: 2, opacity: 1 },
  })

  return elements
}
```

- [ ] **Step 2: Create corporate boardroom template**

Create `src/data/templates/corporate-boardroom.ts`:

```typescript
import { nanoid } from 'nanoid'
import type { CanvasElement, TableElement } from '../../types/elements'
import { computeSeatPositions } from '../../lib/seatLayout'

export function createCorporateBoardroomTemplate(): CanvasElement[] {
  const elements: CanvasElement[] = []

  // Conference table
  const confTable: TableElement = {
    id: nanoid(), type: 'table-conference',
    x: 400, y: 300, width: 240, height: 80, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Conference Table', visible: true,
    style: { fill: '#F3F4F6', stroke: '#6B7280', strokeWidth: 2, opacity: 1 },
    seatCount: 14,
    seatLayout: 'around',
    seats: computeSeatPositions('table-conference', 14, 'around', 240, 80),
  }
  elements.push(confTable)

  // Podium
  elements.push({
    id: nanoid(), type: 'podium',
    x: 400, y: 120, width: 36, height: 36, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Podium', visible: true,
    style: { fill: '#E0E7FF', stroke: '#4F46E5', strokeWidth: 2, opacity: 1 },
  })

  // Screen
  elements.push({
    id: nanoid(), type: 'custom-shape',
    x: 400, y: 60, width: 200, height: 20, rotation: 0,
    locked: false, groupId: null, zIndex: 0,
    label: 'Screen', visible: true,
    style: { fill: '#1F2937', stroke: '#111827', strokeWidth: 2, opacity: 1 },
  })

  return elements
}
```

- [ ] **Step 3: Create fine dining template**

Create `src/data/templates/fine-dining.ts`:

```typescript
import { nanoid } from 'nanoid'
import type { CanvasElement, TableElement } from '../../types/elements'
import { computeSeatPositions } from '../../lib/seatLayout'

function makeDiningTable(x: number, y: number, label: string, seats: number): TableElement {
  const isSmall = seats <= 4
  const width = isSmall ? 60 : 120
  const height = isSmall ? 60 : 60
  const type = isSmall ? 'table-round' as const : 'table-rect' as const
  const layout = isSmall ? 'around' as const : 'both-sides' as const
  return {
    id: nanoid(), type,
    x, y, width, height, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label, visible: true,
    style: { fill: '#FFFBEB', stroke: '#92400E', strokeWidth: 2, opacity: 1 },
    seatCount: seats,
    seatLayout: layout,
    seats: computeSeatPositions(type, seats, layout, width, height),
  }
}

export function createFineDiningTemplate(): CanvasElement[] {
  const elements: CanvasElement[] = []

  // 6 two-tops along the window
  for (let i = 0; i < 6; i++) {
    elements.push(makeDiningTable(100 + i * 120, 100, `Table ${i + 1}`, 2))
  }

  // 8 four-tops in the center
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      elements.push(makeDiningTable(
        130 + col * 160, 280 + row * 160,
        `Table ${7 + row * 4 + col}`, 4
      ))
    }
  }

  // Banquet table
  const banquet: TableElement = {
    id: nanoid(), type: 'table-banquet',
    x: 400, y: 580, width: 200, height: 60, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Banquet', visible: true,
    style: { fill: '#FFFBEB', stroke: '#92400E', strokeWidth: 2, opacity: 1 },
    seatCount: 12,
    seatLayout: 'both-sides',
    seats: computeSeatPositions('table-banquet', 12, 'both-sides', 200, 60),
  }
  elements.push(banquet)

  // Bar
  elements.push({
    id: nanoid(), type: 'bar',
    x: 750, y: 350, width: 40, height: 200, rotation: 0,
    locked: false, groupId: null, zIndex: 0,
    label: 'Bar', visible: true,
    style: { fill: '#FED7AA', stroke: '#C2410C', strokeWidth: 2, opacity: 1 },
  })

  // Hostess station
  elements.push({
    id: nanoid(), type: 'reception',
    x: 100, y: 30, width: 80, height: 30, rotation: 0,
    locked: false, groupId: null, zIndex: 0,
    label: 'Host', visible: true,
    style: { fill: '#D1FAE5', stroke: '#059669', strokeWidth: 2, opacity: 1 },
  })

  return elements
}
```

- [ ] **Step 4: Create template registry**

Create `src/data/templates/index.ts`:

```typescript
import type { CanvasElement } from '../../types/elements'
import type { CanvasSettings } from '../../types/project'
import { DEFAULT_CANVAS_SETTINGS } from '../../types/project'
import { createWeddingReceptionTemplate } from './wedding-reception'
import { createCorporateBoardroomTemplate } from './corporate-boardroom'
import { createFineDiningTemplate } from './fine-dining'

export interface Template {
  id: string
  name: string
  category: 'wedding' | 'corporate' | 'restaurant' | 'classroom' | 'concert'
  description: string
  createElements: () => CanvasElement[]
  canvasSettings: CanvasSettings
}

export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'Blank Canvas',
    category: 'wedding',
    description: 'Start from scratch',
    createElements: () => [],
    canvasSettings: DEFAULT_CANVAS_SETTINGS,
  },
  {
    id: 'wedding-reception',
    name: 'Wedding Reception',
    category: 'wedding',
    description: '10 round tables, head table, dance floor, stage, bar',
    createElements: createWeddingReceptionTemplate,
    canvasSettings: DEFAULT_CANVAS_SETTINGS,
  },
  {
    id: 'corporate-boardroom',
    name: 'Corporate Boardroom',
    category: 'corporate',
    description: 'Conference table for 14, podium, projection screen',
    createElements: createCorporateBoardroomTemplate,
    canvasSettings: DEFAULT_CANVAS_SETTINGS,
  },
  {
    id: 'fine-dining',
    name: 'Fine Dining',
    category: 'restaurant',
    description: '2-tops, 4-tops, banquet, bar, hostess station',
    createElements: createFineDiningTemplate,
    canvasSettings: DEFAULT_CANVAS_SETTINGS,
  },
]
```

- [ ] **Step 5: Create NewProjectModal (template picker)**

Create `src/components/dashboard/NewProjectModal.tsx`:

```tsx
import { useUIStore } from '../../stores/uiStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useProjectStore } from '../../stores/projectStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { TEMPLATES } from '../../data/templates'
import { X } from 'lucide-react'

export function NewProjectModal() {
  const open = useUIStore((s) => s.templatePickerOpen)
  const setOpen = useUIStore((s) => s.setTemplatePickerOpen)
  const setElements = useElementsStore((s) => s.setElements)
  const createNewProject = useProjectStore((s) => s.createNewProject)
  const setSettings = useCanvasStore((s) => s.setSettings)

  if (!open) return null

  const handleSelect = (templateId: string) => {
    const template = TEMPLATES.find((t) => t.id === templateId)
    if (!template) return

    createNewProject(template.name === 'Blank Canvas' ? undefined : template.name)
    setSettings(template.canvasSettings)

    const elements = template.createElements()
    const elementMap: Record<string, typeof elements[number]> = {}
    for (const el of elements) {
      elementMap[el.id] = el
    }
    setElements(elementMap)
    setOpen(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Project</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-gray-500 mb-4">Choose a template or start with a blank canvas</p>
        <div className="grid grid-cols-2 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelect(t.id)}
              className="flex flex-col items-start p-4 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors text-left"
            >
              <span className="text-[10px] uppercase font-semibold text-gray-400 mb-1">{t.category}</span>
              <span className="text-sm font-medium text-gray-800">{t.name}</span>
              <span className="text-xs text-gray-500 mt-1">{t.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Wire into EditorPage**

In `src/components/editor/EditorPage.tsx`, add:

```tsx
import { NewProjectModal } from '../dashboard/NewProjectModal'
```

Render `<NewProjectModal />` with the other overlays.

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Template picker opens and populates canvas with template elements.

- [ ] **Step 8: Commit**

```bash
git add src/
git commit -m "feat: add template system with wedding, corporate, and restaurant presets"
```

---

## Phase 7: Share Modal & Presentation Mode

### Task 15: Share modal and presentation mode

**Files:**
- Create: `src/components/editor/ShareModal.tsx`
- Modify: `src/components/editor/EditorPage.tsx`

- [ ] **Step 1: Create ShareModal**

Create `src/components/editor/ShareModal.tsx`:

```tsx
import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { X, Copy, Check } from 'lucide-react'
import { useState } from 'react'

export function ShareModal() {
  const open = useUIStore((s) => s.shareModalOpen)
  const setOpen = useUIStore((s) => s.setShareModalOpen)
  const project = useProjectStore((s) => s.currentProject)
  const updatePermission = useProjectStore((s) => s.updateSharePermission)
  const [copied, setCopied] = useState(false)

  if (!open || !project) return null

  const shareUrl = `${window.location.origin}/project/${project.slug}`
  const embedCode = `<iframe src="${shareUrl}/embed" width="800" height="600" frameborder="0"></iframe>`

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Share</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Permission */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-1 block">Anyone with the link can:</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={project.sharePermission}
            onChange={(e) => updatePermission(e.target.value as 'private' | 'view' | 'comment' | 'edit')}
          >
            <option value="private">No access (private)</option>
            <option value="view">View only</option>
            <option value="comment">View & comment</option>
            <option value="edit">Full edit access</option>
          </select>
        </div>

        {/* Share link */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-1 block">Share link</label>
          <div className="flex gap-2">
            <input
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-600"
              value={shareUrl}
              readOnly
            />
            <button
              onClick={() => handleCopy(shareUrl)}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span className="text-sm">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Embed code */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Embed code</label>
          <div className="flex gap-2">
            <input
              className="flex-1 text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-500"
              value={embedCode}
              readOnly
            />
            <button
              onClick={() => handleCopy(embedCode)}
              className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into EditorPage**

In `src/components/editor/EditorPage.tsx`, add:

```tsx
import { ShareModal } from './ShareModal'
```

Render `<ShareModal />` with other overlays. Also update the presentation mode block to handle Escape:

```tsx
if (presentationMode) {
  return (
    <div className="w-screen h-screen bg-white">
      <CanvasStage />
      <KeyboardShortcutsOverlay />
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Share modal opens with link, permission control, and embed code. Presentation mode (P key) shows fullscreen canvas.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: add share modal with link/embed and presentation mode"
```

---

## Phase 8: Minimap

### Task 16: Minimap with viewport indicator

**Files:**
- Create: `src/components/editor/Minimap.tsx`
- Modify: `src/components/editor/EditorPage.tsx`

- [ ] **Step 1: Create Minimap**

Create `src/components/editor/Minimap.tsx`:

```tsx
import { useElementsStore } from '../../stores/elementsStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useMemo, useCallback, useRef } from 'react'

const MINIMAP_WIDTH = 180
const MINIMAP_HEIGHT = 120

export function Minimap() {
  const elements = useElementsStore((s) => s.elements)
  const { stageX, stageY, stageScale, setStagePosition } = useCanvasStore()
  const ref = useRef<HTMLDivElement>(null)

  // Compute bounding box of all elements
  const bounds = useMemo(() => {
    const els = Object.values(elements)
    if (els.length === 0) return { x: 0, y: 0, width: 800, height: 600 }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const el of els) {
      minX = Math.min(minX, el.x - el.width / 2)
      minY = Math.min(minY, el.y - el.height / 2)
      maxX = Math.max(maxX, el.x + el.width / 2)
      maxY = Math.max(maxY, el.y + el.height / 2)
    }

    const padding = 100
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    }
  }, [elements])

  const scaleX = MINIMAP_WIDTH / bounds.width
  const scaleY = MINIMAP_HEIGHT / bounds.height
  const minimapScale = Math.min(scaleX, scaleY)

  // Viewport rectangle in minimap space
  const viewportX = (-stageX / stageScale - bounds.x) * minimapScale
  const viewportY = (-stageY / stageScale - bounds.y) * minimapScale
  const viewportW = (window.innerWidth / stageScale) * minimapScale
  const viewportH = (window.innerHeight / stageScale) * minimapScale

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top

      const canvasX = clickX / minimapScale + bounds.x
      const canvasY = clickY / minimapScale + bounds.y

      setStagePosition(
        -canvasX * stageScale + window.innerWidth / 2,
        -canvasY * stageScale + window.innerHeight / 2
      )
    },
    [minimapScale, bounds, stageScale, setStagePosition]
  )

  return (
    <div
      ref={ref}
      className="absolute bottom-10 right-4 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden cursor-pointer"
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
      onClick={handleClick}
    >
      <svg width={MINIMAP_WIDTH} height={MINIMAP_HEIGHT}>
        {/* Elements as small rectangles */}
        {Object.values(elements).map((el) => (
          <rect
            key={el.id}
            x={(el.x - el.width / 2 - bounds.x) * minimapScale}
            y={(el.y - el.height / 2 - bounds.y) * minimapScale}
            width={el.width * minimapScale}
            height={el.height * minimapScale}
            fill={el.style.fill}
            stroke={el.style.stroke}
            strokeWidth={0.5}
          />
        ))}

        {/* Viewport indicator */}
        <rect
          x={viewportX}
          y={viewportY}
          width={Math.max(viewportW, 10)}
          height={Math.max(viewportH, 8)}
          fill="rgba(59, 130, 246, 0.15)"
          stroke="#3B82F6"
          strokeWidth={1.5}
          rx={2}
        />
      </svg>
    </div>
  )
}
```

- [ ] **Step 2: Wire into EditorPage**

In `src/components/editor/EditorPage.tsx`, add:

```tsx
import { Minimap } from './Minimap'
```

Add `<Minimap />` inside the canvas container div, after `<StatusBar />`.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Minimap shows in bottom-right with viewport indicator. Clicking minimap pans canvas.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: add minimap with viewport indicator and click-to-pan"
```

---

## Phase 9: Auto-Save & Local Storage

### Task 17: Auto-save to localStorage

**Files:**
- Create: `src/hooks/useAutoSave.ts`
- Modify: `src/components/editor/EditorPage.tsx`

- [ ] **Step 1: Create auto-save hook**

Create `src/hooks/useAutoSave.ts`:

```typescript
import { useEffect, useRef } from 'react'
import { useElementsStore } from '../stores/elementsStore'
import { useSeatingStore } from '../stores/seatingStore'
import { useProjectStore } from '../stores/projectStore'
import { useCanvasStore } from '../stores/canvasStore'

const SAVE_KEY = 'floocraft-autosave'
const SAVE_DEBOUNCE = 2000

export function useAutoSave() {
  const elements = useElementsStore((s) => s.elements)
  const guests = useSeatingStore((s) => s.guests)
  const groupColors = useSeatingStore((s) => s.groupColors)
  const project = useProjectStore((s) => s.currentProject)
  const settings = useCanvasStore((s) => s.settings)
  const setLastSavedAt = useProjectStore((s) => s.setLastSavedAt)

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  // Save
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(() => {
      const data = {
        project,
        elements,
        guests,
        groupColors,
        settings,
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify(data))
      setLastSavedAt(data.savedAt)
    }, SAVE_DEBOUNCE)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [elements, guests, groupColors, project, settings, setLastSavedAt])
}

export function loadAutoSave(): {
  project: ReturnType<typeof useProjectStore.getState>['currentProject']
  elements: ReturnType<typeof useElementsStore.getState>['elements']
  guests: ReturnType<typeof useSeatingStore.getState>['guests']
  groupColors: ReturnType<typeof useSeatingStore.getState>['groupColors']
  settings: ReturnType<typeof useCanvasStore.getState>['settings']
} | null {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Wire into EditorPage**

In `src/components/editor/EditorPage.tsx`, add:

```tsx
import { useAutoSave, loadAutoSave } from '../../hooks/useAutoSave'
```

Inside the component, add `useAutoSave()` call and load saved data on mount:

```tsx
useAutoSave()

useEffect(() => {
  if (!currentProject) {
    const saved = loadAutoSave()
    if (saved && saved.project) {
      useProjectStore.getState().setCurrentProject(saved.project)
      useElementsStore.getState().setElements(saved.elements || {})
      useSeatingStore.getState().setGuests(saved.guests || {})
      if (saved.settings) useCanvasStore.getState().setSettings(saved.settings)
    } else {
      createNewProject()
    }
  }
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

Remove the previous `useEffect` that only called `createNewProject`.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Changes auto-save to localStorage every 2 seconds. Refreshing the page restores state.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: add auto-save to localStorage with 2-second debounce and restore on load"
```

---

## Phase 10: Final Assembly & Polish

### Task 18: Selection overlay with resize/rotation handles

**Files:**
- Create: `src/components/editor/Canvas/SelectionOverlay.tsx`
- Modify: `src/components/editor/Canvas/CanvasStage.tsx`

- [ ] **Step 1: Create SelectionOverlay**

Create `src/components/editor/Canvas/SelectionOverlay.tsx`:

```tsx
import { Layer, Rect, Circle, Group, Transformer } from 'react-konva'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useRef, useEffect } from 'react'
import type Konva from 'konva'

export function SelectionOverlay() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const elements = useElementsStore((s) => s.elements)
  const trRef = useRef<Konva.Transformer>(null)
  const nodesRef = useRef<Konva.Node[]>([])

  useEffect(() => {
    const stage = trRef.current?.getStage()
    if (!stage || !trRef.current) return

    const nodes: Konva.Node[] = []
    for (const id of selectedIds) {
      // Find node by name
      const node = stage.findOne(`#element-${id}`)
      if (node) nodes.push(node)
    }

    nodesRef.current = nodes
    trRef.current.nodes(nodes)
    trRef.current.getLayer()?.batchDraw()
  }, [selectedIds])

  if (selectedIds.length === 0) return null

  return (
    <Layer>
      <Transformer
        ref={trRef}
        rotateEnabled={selectedIds.length === 1}
        enabledAnchors={
          selectedIds.length === 1
            ? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']
            : []
        }
        borderStroke="#3B82F6"
        borderStrokeWidth={1.5}
        anchorFill="#ffffff"
        anchorStroke="#3B82F6"
        anchorSize={8}
        anchorCornerRadius={2}
        rotateAnchorOffset={20}
        padding={4}
      />
    </Layer>
  )
}
```

- [ ] **Step 2: Add element IDs to canvas nodes**

In `src/components/editor/Canvas/ElementRenderer.tsx`, update the outer `<Group>` to include an `id` prop for the Transformer to find:

Add `id={`element-${el.id}`}` to the draggable `<Group>` wrapper.

- [ ] **Step 3: Wire SelectionOverlay into CanvasStage**

In `src/components/editor/Canvas/CanvasStage.tsx`, add:

```tsx
import { SelectionOverlay } from './SelectionOverlay'
```

Add `<SelectionOverlay />` after `<ElementRenderer />` inside the `<Stage>`.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Selected elements show blue resize handles and rotation control.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat: add selection overlay with Konva Transformer for resize and rotation"
```

---

### Task 19: Alignment guides

**Files:**
- Create: `src/components/editor/Canvas/AlignmentGuides.tsx`
- Modify: `src/components/editor/Canvas/CanvasStage.tsx`

- [ ] **Step 1: Create AlignmentGuides component**

Create `src/components/editor/Canvas/AlignmentGuides.tsx`:

```tsx
import { Layer, Line } from 'react-konva'
import { ALIGNMENT_GUIDE_COLOR } from '../../../lib/constants'
import type { AlignmentGuide } from '../../../lib/geometry'

interface AlignmentGuidesProps {
  guides: AlignmentGuide[]
}

export function AlignmentGuides({ guides }: AlignmentGuidesProps) {
  if (guides.length === 0) return null

  return (
    <Layer listening={false}>
      {guides.map((guide, i) => (
        <Line
          key={i}
          points={
            guide.orientation === 'vertical'
              ? [guide.position, guide.start - 20, guide.position, guide.end + 20]
              : [guide.start - 20, guide.position, guide.end + 20, guide.position]
          }
          stroke={ALIGNMENT_GUIDE_COLOR}
          strokeWidth={1}
          dash={[4, 4]}
          listening={false}
        />
      ))}
    </Layer>
  )
}
```

- [ ] **Step 2: Wire into CanvasStage**

In `src/components/editor/Canvas/CanvasStage.tsx`, import and render with an empty guides array for now (guides will be populated when drag is wired up with alignment logic):

```tsx
import { AlignmentGuides } from './AlignmentGuides'
```

Add `<AlignmentGuides guides={[]} />` after `<SelectionOverlay />`.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: add alignment guides layer for smart snap visualization"
```

---

### Task 20: Wall drawing tool

**Files:**
- Create: `src/hooks/useWallDrawing.ts`, `src/components/editor/Canvas/WallRenderer.tsx`, `src/components/editor/Canvas/WallDrawingOverlay.tsx`
- Modify: `src/components/editor/Canvas/CanvasStage.tsx`, `src/components/editor/Canvas/ElementRenderer.tsx`

- [ ] **Step 1: Create wall drawing hook**

Create `src/hooks/useWallDrawing.ts`:

```typescript
import { useState, useCallback, useRef } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import { useElementsStore } from '../stores/elementsStore'
import { nanoid } from 'nanoid'
import type { WallElement } from '../types/elements'
import { snapToGrid, distanceBetween } from '../lib/geometry'
import { WALL_SNAP_THRESHOLD } from '../lib/constants'

interface WallDrawingState {
  isDrawing: boolean
  points: number[] // accumulated anchor points [x1,y1, x2,y2, ...]
  currentPoint: { x: number; y: number } | null // mouse position (live preview)
}

export function useWallDrawing() {
  const [state, setState] = useState<WallDrawingState>({
    isDrawing: false,
    points: [],
    currentPoint: null,
  })

  const activeTool = useCanvasStore((s) => s.activeTool)
  const gridSize = useCanvasStore((s) => s.settings.gridSize)
  const showGrid = useCanvasStore((s) => s.settings.showGrid)
  const addElement = useElementsStore((s) => s.addElement)
  const getMaxZIndex = useElementsStore((s) => s.getMaxZIndex)
  const stateRef = useRef(state)
  stateRef.current = state

  const snapPoint = useCallback(
    (x: number, y: number) => {
      if (showGrid) {
        return { x: snapToGrid(x, gridSize), y: snapToGrid(y, gridSize) }
      }
      return { x, y }
    },
    [gridSize, showGrid]
  )

  const handleCanvasClick = useCallback(
    (canvasX: number, canvasY: number) => {
      if (activeTool !== 'wall') return

      const snapped = snapPoint(canvasX, canvasY)

      setState((prev) => {
        if (!prev.isDrawing) {
          // Start new wall chain
          return {
            isDrawing: true,
            points: [snapped.x, snapped.y],
            currentPoint: snapped,
          }
        } else {
          // Add anchor point
          return {
            ...prev,
            points: [...prev.points, snapped.x, snapped.y],
          }
        }
      })
    },
    [activeTool, snapPoint]
  )

  const handleCanvasMouseMove = useCallback(
    (canvasX: number, canvasY: number) => {
      if (activeTool !== 'wall' || !stateRef.current.isDrawing) return
      const snapped = snapPoint(canvasX, canvasY)
      setState((prev) => ({ ...prev, currentPoint: snapped }))
    },
    [activeTool, snapPoint]
  )

  const handleCanvasDoubleClick = useCallback(() => {
    if (activeTool !== 'wall' || !stateRef.current.isDrawing) return

    const { points } = stateRef.current
    if (points.length >= 4) {
      // Create wall element from accumulated points
      const wall: WallElement = {
        id: nanoid(),
        type: 'wall',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        locked: false,
        groupId: null,
        zIndex: getMaxZIndex() + 1,
        label: 'Wall',
        visible: true,
        style: { fill: '#1F2937', stroke: '#111827', strokeWidth: 6, opacity: 1 },
        points,
        thickness: 6,
        connectedWallIds: [],
      }
      addElement(wall)
    }

    setState({ isDrawing: false, points: [], currentPoint: null })
  }, [activeTool, addElement, getMaxZIndex])

  const cancelDrawing = useCallback(() => {
    setState({ isDrawing: false, points: [], currentPoint: null })
  }, [])

  return {
    wallDrawingState: state,
    handleCanvasClick,
    handleCanvasMouseMove,
    handleCanvasDoubleClick,
    cancelDrawing,
  }
}
```

- [ ] **Step 2: Create WallRenderer**

Create `src/components/editor/Canvas/WallRenderer.tsx`:

```tsx
import { Group, Line } from 'react-konva'
import type { WallElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'

interface WallRendererProps {
  element: WallElement
}

export function WallRenderer({ element }: WallRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)

  return (
    <Group>
      <Line
        points={element.points}
        stroke={isSelected ? '#3B82F6' : element.style.stroke}
        strokeWidth={element.thickness}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={12}
      />
    </Group>
  )
}
```

- [ ] **Step 3: Create WallDrawingOverlay**

Create `src/components/editor/Canvas/WallDrawingOverlay.tsx`:

```tsx
import { Layer, Line, Circle, Text } from 'react-konva'
import { distanceBetween } from '../../../lib/geometry'
import { useCanvasStore } from '../../../stores/canvasStore'

interface WallDrawingOverlayProps {
  points: number[]
  currentPoint: { x: number; y: number } | null
  isDrawing: boolean
}

export function WallDrawingOverlay({ points, currentPoint, isDrawing }: WallDrawingOverlayProps) {
  const settings = useCanvasStore((s) => s.settings)

  if (!isDrawing || points.length === 0) return null

  const previewPoints = currentPoint
    ? [...points, currentPoint.x, currentPoint.y]
    : points

  // Calculate length of current segment for dimension label
  let dimensionLabel = ''
  if (currentPoint && points.length >= 2) {
    const lastX = points[points.length - 2]
    const lastY = points[points.length - 1]
    const dist = distanceBetween(
      { x: lastX, y: lastY },
      { x: currentPoint.x, y: currentPoint.y }
    )
    const scaledDist = dist * settings.scale
    dimensionLabel = `${scaledDist.toFixed(1)} ${settings.scaleUnit}`
  }

  return (
    <Layer listening={false}>
      {/* Completed segments */}
      <Line
        points={previewPoints}
        stroke="#3B82F6"
        strokeWidth={4}
        lineCap="round"
        lineJoin="round"
        dash={[8, 4]}
      />

      {/* Anchor points */}
      {Array.from({ length: points.length / 2 }, (_, i) => (
        <Circle
          key={i}
          x={points[i * 2]}
          y={points[i * 2 + 1]}
          radius={4}
          fill="#3B82F6"
          stroke="#ffffff"
          strokeWidth={2}
        />
      ))}

      {/* Dimension label */}
      {dimensionLabel && currentPoint && points.length >= 2 && (
        <Text
          x={(points[points.length - 2] + currentPoint.x) / 2 + 8}
          y={(points[points.length - 1] + currentPoint.y) / 2 - 16}
          text={dimensionLabel}
          fontSize={12}
          fill="#3B82F6"
          fontStyle="bold"
        />
      )}
    </Layer>
  )
}
```

- [ ] **Step 4: Wire wall rendering into ElementRenderer**

In `src/components/editor/Canvas/ElementRenderer.tsx`, add wall support:

Add import:
```tsx
import { isWallElement } from '../../../types/elements'
import { WallRenderer } from './WallRenderer'
```

In the render, update the condition:
```tsx
{isTableElement(el) ? (
  <TableRenderer element={el} />
) : isWallElement(el) ? (
  <WallRenderer element={el} />
) : (
  <FurnitureRenderer element={el} />
)}
```

- [ ] **Step 5: Wire wall drawing into CanvasStage**

In `src/components/editor/Canvas/CanvasStage.tsx`:

Add imports:
```tsx
import { useWallDrawing } from '../../../hooks/useWallDrawing'
import { WallDrawingOverlay } from './WallDrawingOverlay'
```

Inside the component, call the hook:
```tsx
const { wallDrawingState, handleCanvasClick, handleCanvasMouseMove, handleCanvasDoubleClick, cancelDrawing } = useWallDrawing()
```

Update `handleMouseDown` to call `handleCanvasClick` when wall tool is active:
```tsx
// After the pan check, add:
if (activeTool === 'wall' && e.evt.button === 0) {
  const stage = stageRef.current
  if (!stage) return
  const pointer = stage.getPointerPosition()
  if (!pointer) return
  const canvasX = (pointer.x - stageX) / stageScale
  const canvasY = (pointer.y - stageY) / stageScale
  handleCanvasClick(canvasX, canvasY)
  return
}
```

Update `handleMouseMove` to call `handleCanvasMouseMove`:
```tsx
// After the panning block:
if (activeTool === 'wall') {
  const stage = stageRef.current
  if (!stage) return
  const pointer = stage.getPointerPosition()
  if (!pointer) return
  const canvasX = (pointer.x - stageX) / stageScale
  const canvasY = (pointer.y - stageY) / stageScale
  handleCanvasMouseMove(canvasX, canvasY)
}
```

Handle double-click on the Stage:
```tsx
onDblClick={handleCanvasDoubleClick}
```

Add `<WallDrawingOverlay {...wallDrawingState} />` after `<AlignmentGuides>` inside the Stage.

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Wall tool (W key) allows drawing walls by clicking points, shows live preview with dimension labels, double-click to complete.

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "feat: add wall drawing tool with live preview, dimensions, and grid snap"
```

---

### Task 21: Landing page with template picker entry point

**Files:**
- Create: `src/components/landing/LandingPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create LandingPage**

Create `src/components/landing/LandingPage.tsx`:

```tsx
import { useNavigate } from 'react-router-dom'
import { TEMPLATES } from '../../data/templates'
import { useElementsStore } from '../../stores/elementsStore'
import { useProjectStore } from '../../stores/projectStore'
import { useCanvasStore } from '../../stores/canvasStore'

export function LandingPage() {
  const navigate = useNavigate()
  const setElements = useElementsStore((s) => s.setElements)
  const createNewProject = useProjectStore((s) => s.createNewProject)
  const setSettings = useCanvasStore((s) => s.setSettings)

  const handleStart = (templateId: string) => {
    const template = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0]
    const project = createNewProject(template.name === 'Blank Canvas' ? undefined : template.name)
    setSettings(template.canvasSettings)

    const elements = template.createElements()
    const elementMap: Record<string, (typeof elements)[number]> = {}
    for (const el of elements) elementMap[el.id] = el
    setElements(elementMap)

    navigate(`/project/${project.slug}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Floocraft
        </h1>
        <p className="text-xl text-gray-500 mb-8 max-w-2xl mx-auto">
          Design floor plans, arrange furniture, and assign seats — all in one interactive tool.
          Share with your team in real time.
        </p>
        <button
          onClick={() => handleStart('blank')}
          className="px-8 py-3 bg-blue-600 text-white text-lg font-medium rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
        >
          Create a Floor Plan
        </button>
      </div>

      {/* Templates */}
      <div className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Or start from a template</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATES.filter((t) => t.id !== 'blank').map((template) => (
            <button
              key={template.id}
              onClick={() => handleStart(template.id)}
              className="flex flex-col p-5 rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all text-left bg-white"
            >
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">{template.category}</span>
              <span className="text-base font-semibold text-gray-800 mt-1">{template.name}</span>
              <span className="text-sm text-gray-500 mt-1">{template.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 py-6 text-center text-sm text-gray-400">
        Floocraft — Interactive floor plans & seating charts
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update App.tsx routes**

Replace `src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { EditorPage } from './components/editor/EditorPage'
import { LandingPage } from './components/landing/LandingPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/project/:slug" element={<EditorPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Landing page shows hero + template grid. Clicking a template navigates to editor with that layout loaded.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: add landing page with hero and template picker"
```

---

### Task 22: Final build verification and type check

- [ ] **Step 1: Run type check**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Test dev server**

```bash
npm run dev
```

Verify in browser:
1. Landing page loads at `/`
2. Clicking "Create a Floor Plan" navigates to editor
3. Template picker loads elements onto canvas
4. Canvas pans (middle mouse) and zooms (scroll)
5. Elements are draggable with grid snap
6. Sidebar element library adds elements on click
7. Properties panel shows on element select
8. Guest list panel: add guests, search, sort
9. CSV import dialog works
10. Keyboard shortcuts work (V, W, G, P, Ctrl+Z, Delete, arrows)
11. Context menu shows on right-click
12. Share modal and export dialog open
13. Minimap shows element positions
14. Wall drawing tool works with dimension preview
15. Auto-save persists on reload
16. Presentation mode (P) goes fullscreen

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: final build verification — all core features operational"
```

---

## Summary

This plan implements **22 tasks across 10 phases**:

| Phase | Tasks | What it builds |
|-------|-------|---------------|
| 1. Scaffolding | 1-3 | Vite + React + TypeScript project, all types, utility libraries |
| 2. State | 4-5 | All 6 Zustand stores (elements, canvas, UI, seating, project, collaboration) |
| 3. Canvas Engine | 6-8 | Editor layout, Konva canvas with grid/pan/zoom, element rendering with drag/snap |
| 4. Interactivity | 9-10 | Keyboard shortcuts, context menu |
| 5. Seating | 11-12 | Guest list panel, CSV import, properties panel |
| 6. Export | 13 | PNG, PDF, CSV, JSON export |
| 7. Templates | 14 | Wedding, corporate, restaurant template presets |
| 8. Sharing | 15 | Share modal with permissions and embed code, presentation mode |
| 9. Navigation | 16-17 | Minimap, auto-save to localStorage |
| 10. Polish | 18-22 | Selection handles, alignment guides, wall drawing tool, landing page, final verification |

**Not covered in this plan (need separate plans):**
- Supabase integration (auth, database, storage, RLS policies)
- Real-time collaboration (Yjs + Supabase Realtime + Presence)
- Comments system
- Version history with restore
- Dashboard with project management
- Door/window rendering on walls
- Background image upload and tracing
