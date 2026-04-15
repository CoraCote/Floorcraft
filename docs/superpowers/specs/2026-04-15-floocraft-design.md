# Floocraft — Product Requirements & Technical Design Spec

## 1. Product Overview

### 1.1 What Is Floocraft

Floocraft is a browser-based interactive floor plan and seating chart application. Users design rooms, arrange furniture, assign seats to people, and share layouts with collaborators in real time.

### 1.2 Target Users

- Event planners (weddings, galas, corporate events)
- Office managers (desk assignments, space planning)
- Teachers (classroom layouts, student seating)
- Restaurant owners (table arrangements, reservation planning)
- Conference organizers (session rooms, theater layouts)

### 1.3 Core Value Proposition

A single tool that combines spatial design with people management. Most floor plan tools ignore seating assignment; most seating chart tools have primitive spatial layouts. Floocraft unifies both with real-time collaboration.

### 1.4 Success Criteria

- A non-technical user can create a floor plan, assign 50+ guests to seats, and share the result within 15 minutes of first visit
- Two collaborators can edit the same layout simultaneously without conflicts
- Exported PDFs are print-ready at 300dpi with legible labels

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | React 18 + TypeScript + Vite | Type safety, fast builds, ecosystem |
| Canvas | Konva.js / react-konva | Best React integration for 2D canvas, built-in transforms/events/hit detection |
| State | Zustand + zundo (undo/redo) | Lightweight, sliceable, temporal middleware gives 50-step undo for free |
| Styling | TailwindCSS + Radix UI | Utility-first CSS + accessible headless primitives for modals, dropdowns, popovers |
| Auth & DB | Supabase (Auth, PostgreSQL, Realtime, Storage) | Single service for auth, database, real-time channels, file uploads |
| Collaboration | Yjs + y-supabase provider | CRDT-based conflict-free sync over Supabase Realtime channels |
| Routing | React Router v7 | Standard SPA routing |
| Export | Konva stage export (PNG), jsPDF (PDF), Papa Parse (CSV) | Mature libraries, no server-side rendering needed |
| Deploy | Netlify (frontend) + Supabase hosted (backend) | Zero server management |

---

## 3. Information Architecture

### 3.1 Route Map

```
/                          → Landing page (redirect to /dashboard if authed)
/dashboard                 → Project grid (authenticated users)
/project/:slug             → Editor (main application)
/project/:slug/present     → Presentation mode (fullscreen, no toolbars)
/project/:slug/embed       → Embed view (read-only, iframe-friendly)
/auth/callback             → OAuth callback handler
```

### 3.2 Editor Layout

```
┌──────────────────────────────────────────────────────────┐
│  TopBar                                                  │
│  [ProjectName] [Undo][Redo] [Zoom -][100%][+] [Share][Export]│
├────────┬─────────────────────────────────┬───────────────┤
│ Left   │                                 │ Right         │
│ Sidebar│        Canvas                   │ Sidebar       │
│        │                                 │ (collapsible) │
│ Tools  │   ┌─────────────────────┐       │               │
│ ──────── │   │  Floor Plan +       │       │ Properties    │
│ Select │   │  Seating Layer      │       │ ────────────  │
│ Pan    │   │                     │       │ Guest List    │
│ Wall   │   │                     │       │ ────────────  │
│ Door   │   │                     │       │ Table View    │
│ Window │   └─────────────────────┘       │ ────────────  │
│ ──────── │                                 │ Comments      │
│ Furniture│              [Minimap]         │ ────────────  │
│ Library│              [StatusBar]        │ Versions      │
│        │                                 │               │
└────────┴─────────────────────────────────┴───────────────┘
```

- **Left Sidebar** (fixed, 260px): Tool selector + draggable element library
- **Canvas** (fluid, fills remaining space): Konva Stage, infinite pan/zoom
- **Right Sidebar** (collapsible, 320px): Context-sensitive panels
- **TopBar** (fixed, 56px): Project controls
- **StatusBar** (bottom overlay): Total seats / assigned / unassigned
- **Minimap** (bottom-right overlay, 180x120px): Viewport indicator

---

## 4. Data Model

### 4.1 Database Schema (Supabase PostgreSQL)

```sql
-- Projects
create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null default 'Untitled Floor Plan',
  slug text unique not null,
  share_permission text not null default 'private'
    check (share_permission in ('private', 'view', 'comment', 'edit')),
  canvas_data jsonb not null default '{}',
  canvas_settings jsonb not null default '{"gridSize": 12, "scale": 1, "scaleUnit": "ft", "showGrid": true}',
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Version history
create table project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text,  -- null for auto-saves, user-provided for named versions
  canvas_data jsonb not null,
  guest_data jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- Guest/attendee list
create table guests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  group_name text,
  dietary text,
  vip boolean not null default false,
  custom_attributes jsonb not null default '{}',
  seat_element_id text,  -- references canvas element ID
  created_at timestamptz not null default now()
);

-- Comments (pinned to canvas)
create table comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  x float not null,
  y float not null,
  target_element_id text,
  body text not null,
  parent_id uuid references comments(id) on delete cascade,
  resolved boolean not null default false,
  reactions jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Collaborator access
create table project_collaborators (
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('viewer', 'commenter', 'editor')),
  primary key (project_id, user_id)
);

-- Indexes
create index idx_projects_owner on projects(owner_id);
create index idx_projects_slug on projects(slug);
create index idx_guests_project on guests(project_id);
create index idx_guests_seat on guests(project_id, seat_element_id);
create index idx_comments_project on comments(project_id);
create index idx_versions_project on project_versions(project_id, created_at desc);
```

### 4.2 Row-Level Security Policies

```sql
-- Projects: owner can do everything; collaborators based on role; share_permission for link access
alter table projects enable row level security;

create policy "Owner full access" on projects
  for all using (auth.uid() = owner_id);

create policy "Collaborator read" on projects
  for select using (
    exists (
      select 1 from project_collaborators
      where project_id = projects.id and user_id = auth.uid()
    )
  );

create policy "Public view" on projects
  for select using (share_permission in ('view', 'comment', 'edit'));

-- Guests: edit-permission users can modify
alter table guests enable row level security;

create policy "Owner full access" on guests
  for all using (
    exists (select 1 from projects where id = guests.project_id and owner_id = auth.uid())
  );

create policy "Editor access" on guests
  for all using (
    exists (
      select 1 from project_collaborators
      where project_id = guests.project_id and user_id = auth.uid() and role = 'editor'
    )
  );

create policy "Public edit access" on guests
  for select using (
    exists (select 1 from projects where id = guests.project_id and share_permission = 'edit')
  );

-- Comments: comment+ permission users can insert
alter table comments enable row level security;

create policy "Owner full access" on comments
  for all using (
    exists (select 1 from projects where id = comments.project_id and owner_id = auth.uid())
  );

create policy "Commenter insert" on comments
  for insert with check (
    exists (
      select 1 from projects
      where id = comments.project_id and share_permission in ('comment', 'edit')
    )
    or exists (
      select 1 from project_collaborators
      where project_id = comments.project_id and user_id = auth.uid() and role in ('commenter', 'editor')
    )
  );

create policy "Comment read" on comments
  for select using (
    exists (
      select 1 from projects
      where id = comments.project_id and share_permission in ('view', 'comment', 'edit')
    )
  );

-- Versions: same read access as project
alter table project_versions enable row level security;

create policy "Owner full access" on project_versions
  for all using (
    exists (select 1 from projects where id = project_versions.project_id and owner_id = auth.uid())
  );

create policy "Version read" on project_versions
  for select using (
    exists (
      select 1 from projects
      where id = project_versions.project_id
        and (owner_id = auth.uid() or share_permission in ('view', 'comment', 'edit'))
    )
  );
```

### 4.3 Canvas Element Schema (In-Memory / JSON)

All canvas elements live in the Zustand store and sync via Yjs. They serialize to the `projects.canvas_data` JSONB column.

```typescript
// Base element — all canvas objects extend this
interface BaseElement {
  id: string                    // nanoid
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number              // degrees, 0-359
  locked: boolean
  groupId: string | null        // for grouped elements
  zIndex: number
  label: string
  visible: boolean
  style: ElementStyle
}

interface ElementStyle {
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
}

type ElementType =
  | 'wall' | 'room' | 'door' | 'window'
  | 'table-round' | 'table-rect' | 'table-banquet' | 'table-conference'
  | 'chair' | 'sofa' | 'desk' | 'counter'
  | 'stage' | 'bar' | 'reception'
  | 'custom-shape' | 'text-label' | 'background-image'

// Wall-specific
interface WallElement extends BaseElement {
  type: 'wall'
  points: number[]              // [x1,y1, x2,y2, ...] polyline
  thickness: number
  connectedWallIds: string[]
}

// Door/Window — attached to a wall segment
interface DoorElement extends BaseElement {
  type: 'door'
  parentWallId: string
  positionOnWall: number        // 0-1, percentage along wall
  swingDirection: 'left' | 'right' | 'both'
  openAngle: number             // for hover animation
}

interface WindowElement extends BaseElement {
  type: 'window'
  parentWallId: string
  positionOnWall: number
}

// Table types
interface TableElement extends BaseElement {
  type: 'table-round' | 'table-rect' | 'table-banquet' | 'table-conference'
  seatCount: number
  seatLayout: 'around' | 'one-side' | 'both-sides' | 'u-shape'
  seats: SeatPosition[]         // computed positions relative to table
}

interface SeatPosition {
  id: string                    // globally unique seat ID
  offsetX: number               // relative to table center
  offsetY: number
  rotation: number
  assignedGuestId: string | null
}

// Background image reference
interface BackgroundImageElement extends BaseElement {
  type: 'background-image'
  storageUrl: string
  originalWidth: number
  originalHeight: number
  opacity: number               // 0-1, for tracing
  locked: boolean               // default true
}
```

---

## 5. Feature Specifications

### 5.1 Canvas & Floor Plan Engine

#### 5.1.1 Canvas Fundamentals

- **Rendering:** Konva Stage with multiple Konva Layers (grid, background, walls, furniture, labels, UI overlays). Each layer renders independently for performance.
- **Pan:** Space+drag or middle-mouse-drag. Touch: two-finger pan.
- **Zoom:** Scroll wheel or pinch. Range: 10% to 400%. Zoom targets cursor position. Zoom controls in TopBar show percentage with +/- buttons.
- **Grid:** Configurable size (default 12px). Toggle on/off. Elements snap to grid when within 6px threshold. Hold Alt to temporarily disable snap.
- **Scale:** User sets canvas scale in settings (e.g., 1 grid square = 1 foot). All dimension labels display in the chosen unit.
- **Infinite canvas:** No fixed bounds. Stage position tracks offset; minimap shows extent of all elements.

#### 5.1.2 Drawing Walls

1. User activates wall tool (W key or sidebar click)
2. Click on canvas to place first point
3. Mouse move shows a live wall segment with:
   - Dimension label updating in real time (e.g., "12.5 ft")
   - Snap indicators when aligned to existing walls (horizontal/vertical)
4. Click to anchor the endpoint and start a new segment from that point
5. If endpoint is within 8px of an existing wall endpoint, auto-connect (corner joint)
6. Double-click or press Escape to end the wall chain
7. Walls render as thick lines (default 6px stroke) with fill

#### 5.1.3 Doors & Windows

- Selected from sidebar, then clicked onto an existing wall
- Door: renders as an arc indicating swing direction. On hover, animates open (30-degree arc sweep) to show clearance
- Window: renders as a dashed gap in the wall with parallel lines
- Both snap to wall position. Drag along wall to reposition
- Properties panel exposes: width, swing direction (doors), position on wall

#### 5.1.4 Furniture & Elements

Each element in the sidebar library:

| Category | Elements |
|----------|----------|
| **Tables** | Round (4/6/8/10 seat), Rectangular (4/6/8), Banquet (12/16/20), Conference (10/14/20) |
| **Seating** | Chair, Sofa (2-seat, 3-seat), Stool |
| **Work** | Desk, Counter, Podium, Lectern |
| **Venue** | Stage, Bar, Reception desk, Dance floor |
| **Zones** | Custom rectangle (labeled area), Divider, Planter |

**Placement:** Drag from sidebar onto canvas, or click to place at viewport center. Elements render as styled SVG shapes inside Konva — not photorealistic, but clearly recognizable at any zoom level.

**Manipulation:**
- Drag to move (snaps to grid)
- Corner handles to resize (maintains aspect ratio with Shift)
- Rotation handle above element. Default rotation snaps to 45-degree increments; hold Alt for free 1-degree rotation.
- Lock (Ctrl+L) prevents movement/resize/rotation
- Properties panel: precise x/y/width/height/rotation inputs, fill/stroke pickers

**Grouping:**
- Select multiple elements → Ctrl+G to group
- Grouped elements move/rotate/scale as a unit
- Double-click a group to enter "edit group" mode (edit individual elements within)
- Ctrl+Shift+G to ungroup

#### 5.1.5 Alignment & Distribution

When dragging an element, smart alignment guides appear when:
- Element center aligns with another element's center (horizontal or vertical)
- Element edge aligns with another element's edge
- Element has equal spacing to two adjacent elements

Guides render as thin colored lines (magenta, #FF00FF) with distance labels.

**Explicit alignment** (via toolbar or context menu on multi-selection):
- Align left / center / right / top / middle / bottom
- Distribute horizontally / vertically with equal spacing

#### 5.1.6 Background Image

- Upload via right sidebar or drag-and-drop onto canvas
- Stored in Supabase Storage, referenced by URL
- Renders on the background layer (below all elements)
- Controls: opacity slider (10%–100%), lock toggle, visible toggle
- Use case: upload a blueprint photo, set to 40% opacity, trace walls over it

---

### 5.2 Seating Chart Layer

#### 5.2.1 Seat Model

Each table element auto-generates seat positions based on its `seatCount` and `seatLayout`. Seats are computed child positions, not independent canvas elements — they move with the table.

- Round tables: seats evenly distributed around circumference
- Rectangular tables: seats distributed along edges per layout mode
- Banquet tables: seats along both long sides
- Conference tables: seats around all sides

Each seat has a unique ID and can be independently assigned to a guest.

#### 5.2.2 Guest List Management

The Guest List panel in the right sidebar:

- **Add manually:** Name field + optional group, dietary, VIP checkbox
- **CSV import:** Upload or paste. Expected columns: `name`, `group`, `dietary`, `vip`, plus any extra columns become `custom_attributes`. Papa Parse handles parsing. Preview step shows column mapping before import.
- **Search:** Real-time filter by name or group
- **Sort:** By name (A-Z), by group, by assignment status (unassigned first)
- **Bulk actions:** Select multiple guests → assign to group, mark VIP, delete
- **Count display:** "47 of 120 guests assigned" always visible at panel top

#### 5.2.3 Seat Assignment

Three methods:

1. **Drag & drop:** Drag a guest name from the list panel onto a seat on the canvas. Drop zone highlights the nearest empty seat within 20px. On drop, seat is assigned and label appears.

2. **Click-to-assign:** Click an empty seat → popover appears with searchable guest dropdown. Select a guest to assign.

3. **Table view:** Click any table → right panel switches to table view showing all seats as a list. Drag to reorder within the table. Click an empty slot → same searchable dropdown.

#### 5.2.4 Visual Feedback

- **Assigned seats:** Solid fill, guest name label above/beside (font scales with zoom, min 8px, max 14px rendered). Fill color determined by group.
- **Unassigned seats:** Dashed border, muted gray fill (#E5E7EB)
- **Group coloring:** Each group auto-assigned a color from a 12-color palette. Legend auto-generates in bottom-left overlay. Legend is editable (rename groups, change colors).
- **Conflict indicator:** If the same guest is assigned to multiple seats, both seats show a red warning badge with a tooltip explaining the conflict.
- **Group highlight:** Click any assigned seat → all other seats in the same group pulse briefly with a glow effect.

#### 5.2.5 Status Bar

Fixed bottom overlay showing:
```
Total Seats: 120  |  Assigned: 87  |  Unassigned: 33  |  Guests Without Seats: 15
```
Updates in real time as assignments change.

---

### 5.3 Interactivity & Editing

#### 5.3.1 Selection

- **Single select:** Click an element
- **Multi-select:** Click and drag a selection box (marching ants rectangle), or Shift+click to add/remove from selection
- **Select all:** Ctrl+A
- Locked elements are not included in box select (but can be Shift+clicked directly)
- Selected elements show resize handles (corners + edges) and rotation handle

#### 5.3.2 Undo/Redo

- Zustand + zundo middleware provides temporal state tracking
- 50-step history depth
- Each discrete user action is one undo step:
  - Move/resize/rotate an element (coalesced: dragging is one step, not one per pixel)
  - Add/delete element
  - Assign/unassign seat
  - Change element property
  - Group/ungroup
- Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts
- Undo/redo buttons in TopBar with disabled state when at stack boundary

#### 5.3.3 Context Menu

Right-click any element shows:

```
Edit Label          (inline text edit)
─────────────────
Duplicate           Ctrl+D
Delete              Del
─────────────────
Bring to Front
Bring Forward
Send Backward
Send to Back
─────────────────
Lock / Unlock       Ctrl+L
Group               Ctrl+G      (if multi-selected)
Ungroup             Ctrl+Shift+G (if group selected)
─────────────────
Assign Seat →       (submenu with guest search, only for seat elements)
```

Right-click on empty canvas:
```
Paste               Ctrl+V
Select All          Ctrl+A
─────────────────
Canvas Settings
Toggle Grid
Reset View
```

#### 5.3.4 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z | Redo |
| Delete / Backspace | Delete selected |
| Escape | Deselect all / exit current tool / close modal |
| Arrow keys | Nudge selected 1px (1 grid unit if snapping on) |
| Shift+Arrow | Nudge 10px |
| Ctrl/Cmd+A | Select all |
| Ctrl/Cmd+C | Copy selected |
| Ctrl/Cmd+V | Paste |
| Ctrl/Cmd+D | Duplicate (paste at offset) |
| Ctrl/Cmd+G | Group |
| Ctrl/Cmd+Shift+G | Ungroup |
| Ctrl/Cmd+L | Lock/Unlock |
| Space+drag | Pan canvas |
| Ctrl/Cmd+= / Ctrl/Cmd+- | Zoom in/out |
| Ctrl/Cmd+0 | Reset zoom to 100% |
| F | Zoom to fit all elements |
| V | Select tool |
| W | Wall drawing tool |
| P | Toggle presentation mode |
| G | Toggle grid |
| ? | Show keyboard shortcuts overlay |

#### 5.3.5 Minimap

- Position: bottom-right corner, 180x120px
- Shows bird's-eye view of entire canvas content
- Current viewport indicated by a semi-transparent rectangle
- Drag the viewport rectangle to pan the main canvas
- Click anywhere on minimap to jump to that position
- Collapses to an icon when canvas content fits in viewport

#### 5.3.6 Presentation Mode

- Activated via P key or TopBar button
- Hides all sidebars, toolbar, and overlays
- Canvas fills entire browser window
- Escape key exits presentation mode
- Mouse cursor hidden after 3s of inactivity, reappears on move
- Optional: cycle through tables with left/right arrow keys, zooming to each

---

### 5.4 Templates

Bundled as JSON fixtures in `src/data/templates/`. Each template provides:

```typescript
interface Template {
  id: string
  name: string
  category: 'wedding' | 'corporate' | 'restaurant' | 'classroom' | 'concert'
  description: string
  thumbnail: string             // static image path
  elements: CanvasElement[]
  canvasSettings: CanvasSettings
  sampleGuests?: Guest[]        // optional sample data
}
```

#### Template Library

| Template | Category | Elements |
|----------|----------|----------|
| **Wedding Reception** | Wedding | 10 round 8-top tables, 1 head table (12), dance floor, stage, bar, 2 cocktail standing areas |
| **Wedding Ceremony** | Wedding | Rows of chairs (100), aisle, altar/arch area, 2 entry points |
| **Corporate Boardroom** | Corporate | 1 conference table (20), podium, screen/projector area, side credenza |
| **Classroom Rows** | Corporate | 6 rows x 5 classroom desks, instructor desk, whiteboard wall |
| **Theater Style** | Corporate | 10 rows x 12 chairs, stage, podium, 2 aisles |
| **Fine Dining** | Restaurant | Mix of 2-tops (6), 4-tops (8), 1 banquet (12), bar with 8 stools, hostess station |
| **Casual Cafe** | Restaurant | Mix of 2-tops (4), 4-tops (6), communal table (10), counter with 6 stools, outdoor area |
| **Standard Classroom** | Classroom | 5x6 desk grid, teacher desk, reading corner, supply station |
| **Group Pods** | Classroom | 6 table clusters of 4 desks each, teacher desk, presentation area |
| **Concert Venue** | Concert | Stage, GA standing zone (capacity 200), VIP section (40 reserved seats), sound booth, 2 bars |

Accessed via New Project modal or template browser in dashboard.

---

### 5.5 Sharing & Collaboration

#### 5.5.1 Share Links

Every project has a unique URL: `/project/:slug`. The owner controls access:

- **Private:** Only owner and explicit collaborators
- **View Only:** Anyone with link can view (no editing, no assignment changes)
- **Comment Only:** Anyone with link can view + pin comments
- **Edit:** Anyone with link can make changes (full collaborator)

Share modal shows the link, permission dropdown, and a "Copy Link" button.

#### 5.5.2 Collaborator Management

Owner can invite specific users by email. Invited users get `project_collaborators` row with their role. They see the project in their dashboard.

#### 5.5.3 Real-Time Sync

Architecture:
1. On editor mount, create a Yjs `Y.Doc` and connect via `y-supabase` provider to a Supabase Realtime channel keyed to the project ID
2. The Yjs document contains a `Y.Map` for elements (keyed by element ID), a `Y.Array` for layer ordering, and a `Y.Map` for canvas settings
3. Local Zustand store observes the Yjs document. Zustand dispatches update Yjs, and Yjs remote changes update Zustand.
4. Supabase Presence API broadcasts each user's cursor position, name, and avatar color. Rendered as labeled cursor icons on the canvas.
5. Changes merge via Yjs CRDT — no conflicts possible at the data layer.

#### 5.5.4 Comments

- Any user with comment+ permission can click the canvas to pin a comment
- Comment appears as a small icon on the canvas. Click to expand.
- Comments panel in right sidebar shows all comments as a thread list
- Each comment supports:
  - Replies (threaded)
  - Emoji reactions (stored in `reactions` jsonb as `{ "emoji": count }`)
  - Mark as resolved (collapsed by default, toggle to show)
- Optionally attached to a specific element (if pinned on one). Moving the element moves the comment.

#### 5.5.5 Version History

- **Auto-save:** Debounced write to `projects.canvas_data` every 2 seconds after last change
- **Version snapshots:** Created automatically every 2 minutes of active editing AND on major actions (bulk delete, CSV import, template change). Also created on-demand by the user ("Save Version" button with optional name).
- **Version panel** in right sidebar lists all versions (newest first) with timestamp and name
- Click a version to preview it (read-only overlay on canvas)
- "Restore" button replaces current state with the selected version (creates a new version snapshot of the current state first, so the restore is reversible)

#### 5.5.6 Embed

- Route: `/project/:slug/embed`
- Read-only canvas view with no sidebars or toolbars
- Minimal UI: zoom controls, legend, seat labels
- Share modal generates embed snippet: `<iframe src="{DEPLOY_URL}/project/:slug/embed" width="800" height="600" frameborder="0"></iframe>` (deploy URL injected from environment)

---

### 5.6 Export

#### 5.6.1 Image Export (PNG)

- Uses `stage.toDataURL({ pixelRatio: 1 })` for standard, `pixelRatio: 4` for high-res
- Options dialog:
  - Include/exclude: grid, guest labels, legend, background image
  - Size: fit to content (auto) or fixed dimensions
- Downloads as `{project-name}.png`

#### 5.6.2 PDF Export

- Uses jsPDF with the canvas raster from Konva
- Options:
  - Paper size: Letter, A4, A3, custom
  - Orientation: landscape/portrait (auto-detected from layout aspect ratio)
  - DPI: 150 (standard) or 300 (print-ready)
  - Include/exclude: grid, labels, legend, title block with project name and date
- Multi-page: if layout exceeds one page at chosen scale, tiles across pages with crop marks

#### 5.6.3 Seating List Export (CSV)

Serialized from `guests` table:

```csv
Name,Group,Table,Seat,Dietary,VIP,Custom1,Custom2
"Jane Smith","Bride's Family","Table 3","Seat 4","Vegetarian",true,...
"John Doe","Groom's Friends","Table 7","Seat 2","",false,...
"Unassigned Guest","","","","Gluten-free",false,...
```

Tables and seats labeled by their canvas label or auto-numbered.

#### 5.6.4 Seating List Export (PDF)

Formatted report generated with jsPDF:
- **Table-by-table view:** Each table as a section header with its assigned guests listed below
- **Name badge layout:** Grid of name cards (8 per page) with name, table number, and dietary info — ready for print-and-cut

#### 5.6.5 Project Backup (JSON)

Full export:
```json
{
  "version": "1.0",
  "project": { "name": "...", "settings": {...} },
  "elements": [...],
  "guests": [...],
  "exportedAt": "2026-04-15T..."
}
```
Can be imported via File → Import to create a new project from backup.

---

### 5.7 Authentication & Project Management

#### 5.7.1 Auth Flow

1. **Anonymous access:** Full editor works without an account. Canvas state stored in `localStorage` under a session key.
2. **Sign-up prompt:** Triggered after 30 minutes of work OR when user clicks Share/Export. Non-blocking modal — can dismiss and continue.
3. **Sign-up options:** Email/password or Google OAuth, handled by Supabase Auth.
4. **Migration:** On sign-up, the anonymous session's `localStorage` project is saved to the database under the new user's account.
5. **Session:** Supabase manages JWT tokens. Auth state in React context. Protected routes redirect to login.

#### 5.7.2 Dashboard

Grid of project cards showing:
- Thumbnail (auto-generated from canvas state on save)
- Project name
- Last edited timestamp (relative: "2 hours ago")
- Quick actions (hover): Duplicate, Share, Delete, Rename

**Actions:**
- "New Project" button opens template picker modal
- Search/filter projects by name
- Sort by last edited (default) or name

#### 5.7.3 Project Lifecycle

- **Create:** From template or blank canvas. Generates a random slug.
- **Rename:** Inline edit in TopBar (debounced save) or from dashboard
- **Duplicate:** Deep copy of all elements, guests, and settings. New slug. "[Original Name] (Copy)"
- **Delete:** Soft confirmation dialog. Cascades to versions, guests, comments, collaborators.

---

## 6. Component Architecture

```
src/
├── main.tsx                          # Entry point
├── App.tsx                           # Router + providers
├── components/
│   ├── auth/
│   │   ├── AuthProvider.tsx          # Supabase session context
│   │   ├── LoginModal.tsx
│   │   └── SignUpPrompt.tsx          # 30-min nudge
│   ├── dashboard/
│   │   ├── DashboardPage.tsx
│   │   ├── ProjectCard.tsx
│   │   └── NewProjectModal.tsx       # Template picker
│   ├── editor/
│   │   ├── EditorPage.tsx            # Main editor layout
│   │   ├── TopBar.tsx
│   │   ├── LeftSidebar/
│   │   │   ├── ToolSelector.tsx      # Tool radio buttons
│   │   │   └── ElementLibrary.tsx    # Draggable furniture list
│   │   ├── Canvas/
│   │   │   ├── CanvasStage.tsx       # Konva Stage wrapper
│   │   │   ├── GridLayer.tsx
│   │   │   ├── BackgroundLayer.tsx
│   │   │   ├── WallsLayer.tsx
│   │   │   ├── FurnitureLayer.tsx
│   │   │   ├── SeatingLabelsLayer.tsx
│   │   │   ├── SelectionBox.tsx
│   │   │   ├── AlignmentGuides.tsx
│   │   │   ├── DimensionOverlay.tsx
│   │   │   ├── CursorsLayer.tsx      # Collaborator cursors
│   │   │   └── CommentsLayer.tsx
│   │   ├── RightSidebar/
│   │   │   ├── PropertiesPanel.tsx
│   │   │   ├── GuestListPanel.tsx
│   │   │   ├── CSVImportDialog.tsx
│   │   │   ├── TableViewPanel.tsx
│   │   │   ├── CommentsPanel.tsx
│   │   │   └── VersionHistoryPanel.tsx
│   │   ├── Minimap.tsx
│   │   ├── StatusBar.tsx
│   │   ├── ContextMenu.tsx
│   │   ├── ShareModal.tsx
│   │   ├── ExportDialog.tsx
│   │   └── KeyboardShortcuts.tsx     # Shortcut handler + overlay
│   ├── presentation/
│   │   └── PresentationMode.tsx
│   └── embed/
│       └── EmbedView.tsx
├── stores/
│   ├── canvasStore.ts                # Zoom, pan, grid, active tool
│   ├── elementsStore.ts              # All canvas elements (Yjs-backed)
│   ├── seatingStore.ts               # Guests, assignments
│   ├── projectStore.ts               # Project metadata, versions
│   ├── collaborationStore.ts         # Presence, cursors, comments
│   └── uiStore.ts                    # Panel state, modals, selection
├── hooks/
│   ├── useCanvasInteraction.ts       # Pan, zoom, drag handlers
│   ├── useWallDrawing.ts             # Wall tool state machine
│   ├── useElementDrag.ts             # Drag + snap + alignment
│   ├── useKeyboardShortcuts.ts
│   ├── useAutoSave.ts
│   ├── useYjsSync.ts                # Yjs ↔ Zustand bridge
│   └── usePresence.ts               # Supabase Presence
├── lib/
│   ├── supabase.ts                   # Supabase client init
│   ├── yjs.ts                        # Yjs doc + provider setup
│   ├── geometry.ts                   # Snap, align, distance, intersection
│   ├── export.ts                     # PNG/PDF/CSV/JSON export functions
│   ├── csv.ts                        # Guest CSV parsing
│   ├── slug.ts                       # Random slug generation
│   └── constants.ts                  # Colors, grid defaults, limits
├── data/
│   └── templates/
│       ├── index.ts                  # Template registry
│       ├── wedding-reception.json
│       ├── wedding-ceremony.json
│       ├── corporate-boardroom.json
│       ├── classroom-rows.json
│       ├── theater-style.json
│       ├── fine-dining.json
│       ├── casual-cafe.json
│       ├── standard-classroom.json
│       ├── group-pods.json
│       └── concert-venue.json
└── types/
    ├── elements.ts                   # CanvasElement types
    ├── guests.ts                     # Guest, SeatAssignment
    ├── project.ts                    # Project, Version
    └── collaboration.ts              # Cursor, Comment, Presence
```

---

## 7. Key Interaction Flows (Detailed)

### 7.1 New User First Visit

1. User lands on `/` → sees landing page with "Create a Floor Plan" CTA
2. Click CTA → template picker modal (or "Blank Canvas")
3. Select template → redirected to `/project/:slug` with editor loaded
4. No auth required — project stored in `localStorage`
5. At 30 minutes, a non-blocking banner appears: "Sign up to save your work and share it"
6. On Share/Export click, if not authed, sign-up modal appears (can dismiss to continue editing, but sharing requires auth)

### 7.2 Wall Drawing Complete Flow

1. User presses W or clicks wall tool in sidebar
2. Cursor changes to crosshair
3. Click on canvas: first point placed, shown as a small circle
4. Move mouse: live wall segment follows cursor. Dimension label floats beside the wall showing length in scale units. If near horizontal/vertical alignment with another wall, snaps and shows a guide line.
5. Click: anchor the wall endpoint. New segment starts from this point.
6. Move near an existing wall endpoint (within 8px): snap indicator appears. Click to connect walls.
7. Double-click or Escape: end wall chain. Wall tool remains active for next chain.
8. Switch to Select tool (V) to move/adjust walls. Wall endpoints are draggable.

### 7.3 Seat Assignment Complete Flow

1. User imports 80 guests via CSV in Guest List panel
2. Preview dialog shows mapped columns — user confirms
3. Guests appear in the list panel, all marked "Unassigned" (red dot)
4. User drags "Jane Smith" from list → hovers over Table 3 on canvas → empty seats highlight in blue as drop targets → drops on Seat 4
5. Seat 4 now shows "Jane Smith" label. Guest list entry updates to show "Table 3, Seat 4" with a green checkmark.
6. Status bar updates: "Assigned: 1 / 80"
7. User clicks an empty seat on Table 5 → popover appears with search field → types "John" → selects "John Doe" → seat assigned
8. User accidentally assigns "Jane Smith" to another seat → conflict badge appears on both seats → tooltip: "Jane Smith is assigned to Table 3 Seat 4 and Table 5 Seat 2"

### 7.4 Real-Time Collaboration Flow

1. User A shares project link with Edit permission
2. User B opens the link → Yjs provider connects to Supabase Realtime channel
3. User B's cursor appears on User A's canvas (labeled "User B", colored dot)
4. User A moves Table 3 → User B sees Table 3 move in real time (Yjs sync)
5. Both users simultaneously move different tables → no conflict (CRDT merge)
6. Both users try to assign different guests to the same seat → last write wins at the seat level, but the UI shows a brief highlight indicating the change was overwritten
7. User B pins a comment on Table 7: "Should we add more seats here?" → comment icon appears on both canvases → User A sees notification badge on Comments panel

---

## 8. Performance Considerations

- **Canvas rendering:** Konva layers are independently cacheable. Static layers (grid, background) cache until zoom/pan changes. Only the active element layer re-renders on edit.
- **Large guest lists:** Guest list panel virtualizes rows (react-virtual) for lists > 100 guests.
- **Yjs document size:** For layouts with 500+ elements, Yjs updates are incremental (only changed fields sync). Full document snapshots only on save-to-DB.
- **Auto-save debouncing:** 2-second debounce prevents save storms during rapid editing.
- **Image uploads:** Background images resized client-side to max 4096px before upload to limit storage and rendering cost.
- **Export:** Large canvas exports (>4000px) render off-screen to avoid UI jank. Show progress indicator.

---

## 9. Scope Boundaries

### Included (v1)

Everything described in sections 1–8.

### Excluded (v2+)

- Mobile-optimized touch interface (responsive viewing only, not editing)
- Offline mode / PWA with local sync
- Custom furniture icon uploads
- AI-assisted seating (auto-assign based on constraints)
- Floor plan auto-detection from uploaded blueprint images
- 3D view toggle
- Billing / paid tiers
- White-label / custom branding
- Email notifications for comments
- Slack/calendar integrations

---

## 10. Open Decisions

None. All architectural and feature decisions are specified above. Implementation proceeds from this spec.
