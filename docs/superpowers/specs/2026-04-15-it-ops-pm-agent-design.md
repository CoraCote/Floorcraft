# Floocraft IT Ops PM Agent — Design Spec

## 1. Overview

### 1.1 What Is It

A proactive insights dashboard embedded as a dedicated tab ("Insights") in the Floocraft editor's right sidebar. It continuously analyzes floor plan state, employee data, and (eventually) external tool data to surface actionable recommendations for office managers and IT operations teams.

### 1.2 Architecture

Hybrid two-layer system:

1. **Rules Engine (client-side)** — Pure TypeScript analyzer functions that run in the browser, react to store changes, and produce typed insight cards. Always available, zero dependencies.
2. **AI Enrichment (optional, progressive)** — An opt-in Claude API layer that enhances rule-based insights with richer narratives and cross-domain recommendations. Degrades gracefully when unavailable.

### 1.3 Design Principles

- **Proactive, not reactive** — The agent surfaces issues before the user asks
- **Action-oriented** — Every insight has at least one actionable button
- **Progressive enhancement** — Works fully offline with rules; gets smarter with AI
- **Integration-ready** — External data sources plug in without architectural changes
- **Non-blocking** — The agent never interferes with the core editing experience

---

## 2. Data Model

### 2.1 Enhanced Employee Model

The existing `Guest` type is extended into a full `Employee` model. The `guests` Supabase table gains new nullable columns — fully backward compatible.

```typescript
interface Employee {
  // Existing guest fields
  id: string
  project_id: string
  name: string
  group_name: string              // repurposed as "department"
  dietary: string                 // kept for backward compat
  seat_element_id: string | null
  custom_attributes: Record<string, unknown>

  // New fields
  email: string | null
  role: string | null                              // job title
  manager_id: string | null                        // references another Employee.id
  start_date: string | null                        // ISO date — onboarding detection
  end_date: string | null                          // ISO date — offboarding detection
  work_mode: 'in-office' | 'hybrid' | 'remote'
  equipment_needs: string[]                        // e.g., ['monitor', 'standing-desk', 'docking-station']
  equipment_status: 'pending' | 'provisioned' | 'not-needed'
  tags: string[]                                   // flexible labels: 'vip', 'intern', 'contractor'
}
```

- `group_name` is reinterpreted as "department" in the office context
- The `vip` boolean from Guest is folded into `tags`
- All new fields are nullable/defaulted — no migration breaks

### 2.2 Zone Field on Canvas Elements

A `zone` field is added to `BaseElement` so the agent can reason about spatial groupings.

```typescript
// Added to BaseElement
zone?: string   // e.g., "Floor 2", "Wing A", "Kitchen Area"
```

This is optional free-text. Elements without a zone are treated as "Unzoned."

---

## 3. Rules Engine

### 3.1 Core Types

```typescript
type InsightCategory = 'utilization' | 'proximity' | 'onboarding' | 'moves' | 'equipment' | 'trends'
type Severity = 'critical' | 'warning' | 'info'

interface Insight {
  id: string                             // deterministic hash of category + key data
  category: InsightCategory
  severity: Severity
  title: string                          // e.g., "3 new hires starting Monday with no desk"
  narrative: string                      // 2-3 sentence explanation
  relatedElementIds: string[]            // canvas elements to highlight
  relatedEmployeeIds: string[]           // employees involved
  actions: InsightAction[]               // action buttons on the card
  timestamp: number                      // when this insight was generated
  dismissed: boolean                     // user dismissed this insight
}

interface InsightAction {
  label: string                          // e.g., "Auto-assign", "View on map"
  type: 'navigate' | 'assign' | 'highlight' | 'external' | 'dismiss'
  payload: Record<string, unknown>       // action-specific data
}

// All analyzers share this signature
type Analyzer = (state: AnalyzerInput) => Insight[]

interface AnalyzerInput {
  elements: CanvasElement[]
  employees: Employee[]
  assignments: Map<string, string>       // seatId -> employeeId
  history?: StateSnapshot[]              // for trend analysis (optional)
  externalData?: {                       // future integration hook
    tickets?: ExternalTicket[]
    calendarEvents?: ExternalEvent[]
    slackChannels?: ExternalChannel[]
  }
}
```

### 3.2 Built-In Analyzers

| Analyzer | Category | Detects | Severity Logic | Example Insight |
|----------|----------|---------|----------------|-----------------|
| `analyzeUtilization` | utilization | Empty desks, overcrowded zones, capacity ratios | Critical: zone < 20% or > 95% utilized. Warning: < 40% or > 85%. Info: everything else. | "Zone B has 12 desks with only 3 assigned (25% utilization)" |
| `analyzeTeamProximity` | proximity | Departments split across multiple zones, isolated members | Warning: team split across 2+ zones. Info: single member isolated from team. | "Marketing team is split: 4 in Zone A, 6 in Zone C" |
| `analyzeOnboarding` | onboarding | Employees with future start_date + no seat, past end_date + still assigned | Critical: start_date within 7 days + no seat. Warning: within 30 days. Info: end_date passed + seat still assigned. | "2 new hires start April 21 with no desk assigned" |
| `analyzeMoves` | moves | Elements tagged with pending-move, conflict detection | Warning: move would displace assigned employee. Info: move scheduled. | "Moving desk 14 would displace Jane — assign her first" |
| `analyzeEquipment` | equipment | Employees with pending equipment_status, unprovisioned needs | Warning: equipment pending for seated employee. Info: equipment needs noted but employee unassigned. | "5 employees need monitors that haven't been provisioned" |
| `analyzeTrends` | trends | Utilization changes over time (requires history snapshots) | Warning: significant drop/spike (>20% change over 30 days). Info: gradual trends. | "Zone A utilization dropped from 80% to 45% over 30 days" |

### 3.3 Engine Coordinator

A `runAllAnalyzers` function:

1. Gathers current state from `elementsStore`, `seatingStore`, and the enhanced employee data
2. Runs all 6 analyzers
3. Deduplicates insights by `id` (deterministic hash prevents duplicate cards for the same issue)
4. Sorts by severity (critical → warning → info), then by timestamp (newest first within tier)
5. Merges with previously dismissed insight IDs
6. Pushes results into `insightsStore`

**Reactivity:** A debounced Zustand subscription (500ms) triggers re-analysis when elements or employee data change. This avoids thrashing during drag operations while staying responsive.

---

## 4. Insights Store

```typescript
// insightsStore.ts
interface InsightsState {
  insights: Insight[]
  filter: {
    categories: Set<InsightCategory>     // which categories to show (all by default)
    severities: Set<Severity>            // which severities to show (all by default)
    showDismissed: boolean               // false by default
  }
  lastAnalyzedAt: number | null
  isAnalyzing: boolean

  // Actions
  runAnalysis: () => void
  dismissInsight: (id: string) => void
  restoreInsight: (id: string) => void
  setFilter: (filter: Partial<InsightsState['filter']>) => void
  executeAction: (insightId: string, actionIndex: number) => void
}
```

### 4.1 Action Execution

`executeAction` dispatches based on the action's `type`:

| Action Type | Behavior |
|-------------|----------|
| `navigate` | Pans/zooms the canvas to center on `relatedElementIds`, applies a brief pulse highlight |
| `assign` | Opens the seat assignment popover pre-filtered to the suggested employee and seat |
| `highlight` | Pulses `relatedElementIds` on canvas using the existing group highlight effect |
| `external` | Placeholder — logs to console now, wired to integrations later |
| `dismiss` | Marks the insight as dismissed |

### 4.2 Persistence

- **Dismissed insight IDs** are saved to `localStorage` per project (key: `floocraft-dismissed-{projectId}`) so they survive page reloads
- **Insights themselves** are always recomputed from current state — never stale
- **History snapshots** for trend analysis are saved to `localStorage` as periodic state summaries (one per day, rolling 90-day window)

---

## 5. UI Design

The agent UI lives as a new **"Insights"** tab in the existing `RightSidebar.tsx`, alongside Properties, Guest List, and Comments.

**The UI will be built using the `frontend-design` skill during implementation** to ensure production-grade, distinctive visual design.

### 5.1 Layout Structure

```
┌─────────────────────────────┐
│ Severity Summary Bar        │  counts per tier with color dots
├─────────────────────────────┤
│ Filter Controls             │  category dropdown + severity toggle chips
├─────────────────────────────┤
│                             │
│ ┌─ CRITICAL ──────────────┐ │  section header (red)
│ │ Insight Card            │ │
│ │  Title (bold)           │ │
│ │  Narrative (2-3 lines)  │ │
│ │  [Action 1] [Action 2]  │ │
│ │                    [✕]  │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─ WARNING ───────────────┐ │  section header (yellow)
│ │ Insight Card            │ │
│ │  ...                    │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─ INFO ──────────────────┐ │  section header (blue)
│ │ Insight Card            │ │
│ │  ...                    │ │
│ └─────────────────────────┘ │
│                             │
│ ▸ Dismissed (3)             │  collapsible section
│                             │
├─────────────────────────────┤
│ Last analyzed: just now  🔄 │  footer with manual refresh + AI toggle
│ [AI-enhanced insights: off] │
└─────────────────────────────┘
```

### 5.2 Card Design

- **Left border:** Color-coded by severity (red `#EF4444` / yellow `#F59E0B` / blue `#3B82F6`)
- **Title:** Bold, single line, descriptive headline
- **Narrative:** 2-3 sentences in regular weight, explains the issue and suggests a path forward
- **Actions:** 1-2 small outlined buttons aligned left at card bottom
- **Dismiss:** Small `×` button in bottom-right corner
- **Click behavior:** Clicking the card body (not buttons) highlights related elements on canvas

### 5.3 Interactions

- **Virtualized list** using `@tanstack/react-virtual` (already in project) for performance with many insights
- **"View on map"** action pans/zooms canvas to related elements, pulses them
- **"Auto-assign"** opens seat assignment popover pre-populated with suggested seat + employee
- **Dismissed cards** move to collapsible "Dismissed" section at bottom
- **Filter dropdown** focuses on one category at a time or shows all
- **Severity chips** toggle which tiers are visible (all on by default)
- **Manual refresh** button in footer forces immediate re-analysis
- **AI toggle** in footer enables/disables AI enrichment (off by default)

### 5.4 Empty State

When no insights are found: a friendly illustration with "All clear — no issues detected. Your office layout looks good." and a subtle "Last analyzed" timestamp.

### 5.5 Badge on Tab

The Insights tab in the sidebar tab bar shows a badge count of unread critical + warning insights (e.g., "Insights (3)"). The badge clears as the user views the tab.

---

## 6. AI Enrichment Layer

### 6.1 How It Works

- An `AIEnricher` service wraps the rules engine output
- When enabled, it batches raw insights + a floor plan state summary
- Sends to a Claude API endpoint (proxied through a Supabase Edge Function or direct client call)
- Claude returns enhanced narratives and may suggest additional actions
- Enhanced cards replace rule-based narratives but keep the same `Insight` structure

### 6.2 Boundaries

- Rules engine always runs first — source of truth for detection
- AI layer only enhances narratives and may suggest additional actions
- AI never creates insights from scratch (no hallucinated alerts)
- If AI enrichment fails or is unavailable, rule-based cards display as-is
- AI calls are debounced more aggressively (5 seconds) to limit API costs

### 6.3 Configuration

- Toggle in Insights tab footer: "AI-enhanced insights" on/off
- API key configured in project settings (stored in Supabase, encrypted)
- No AI calls happen without explicit user opt-in

### 6.4 Deferred

The full AI enrichment implementation (prompt engineering, API proxy, response parsing) is deferred. The rules engine ships first. The architecture supports AI enrichment without changes — it's a decorator over the existing insight pipeline.

---

## 7. Future Integration Hooks

### 7.1 External Data Interface

The `AnalyzerInput` type includes an optional `externalData` field:

```typescript
externalData?: {
  mondayItems?: ExternalMondayItem[]         // Monday.com boards/items
  jiraIssues?: ExternalJiraIssue[]           // Jira tickets
  calendarEvents?: ExternalCalendarEvent[]   // Google Calendar events
  driveFiles?: ExternalDriveFile[]           // Google Drive documents
  slackChannels?: ExternalSlackChannel[]     // Slack channels & membership
  slackMessages?: ExternalSlackMessage[]     // Slack relevant messages
}
```

The `External*` types are intentionally left undefined — they will be specified when each integration is built. The `externalData` field exists now as an architectural seam.

### 7.2 Target Integrations

Each integration is a **data provider** — a function that fetches and normalizes external data into the typed interfaces above. Data providers are registered in a provider registry and called before analysis. Analyzers that understand external data produce richer insights; others ignore the field. Auth/connection configuration is deferred — the architectural seam is ready.

| Platform | Data Provider | What It Feeds | Example Insight |
|----------|--------------|---------------|-----------------|
| **Monday.com** | Boards, items, statuses, assignees | Onboarding tasks, equipment procurement, move tracking, IT tickets | "Jane's onboarding ticket in Monday is marked 'Blocked' — equipment not ordered yet" |
| **Jira** | Issues, statuses, assignees, labels | Facilities tickets, maintenance requests, IT provisioning | "3 open Jira facilities tickets are linked to desks in Zone A — possible maintenance issue" |
| **Google Calendar** | Room bookings, meeting events | Room utilization, scheduling conflicts, move date tracking | "Conference room B is booked 90% of the time but seats only 4 — consider a larger room" |
| **Google Drive** | Floor plan documents, org charts, policy docs | Document references in insight narratives, org structure | "Updated org chart in Drive shows 4 new hires in Engineering not yet reflected in Floocraft" |
| **Slack** | Channel membership, team channels, relevant messages | Team structure, communication patterns, notifications | "The #marketing Slack channel has 12 members but only 8 have desks assigned" |
| **Claude AI** | See Section 6 — AI Enrichment Layer | Enhanced narratives, cross-domain pattern detection, smart recommendations | "Based on team reporting structure, co-locating Sarah near her manager in Zone A would reduce her commute between meetings by ~15 min/day" |

### 7.3 Provider Architecture

```typescript
// Each integration implements this interface
interface DataProvider<T> {
  id: string                              // e.g., 'monday', 'jira', 'google-calendar'
  name: string                            // display name
  isConnected: () => boolean              // auth status check
  fetch: () => Promise<T>                 // fetch and normalize external data
}

// Registry manages all providers
interface ProviderRegistry {
  register: (provider: DataProvider<unknown>) => void
  unregister: (id: string) => void
  fetchAll: () => Promise<ExternalData>   // calls all connected providers
  getConnected: () => DataProvider<unknown>[]
}
```

The registry is called by the engine coordinator before running analyzers. Only connected providers are called. Failed fetches are caught and logged — they never block the rules engine.

---

## 8. File Structure

New and modified files:

```
src/
├── types/
│   ├── employees.ts                     # NEW — Employee interface (extends Guest)
│   └── insights.ts                      # NEW — Insight, InsightAction, Analyzer types
├── stores/
│   └── insightsStore.ts                 # NEW — Insights state, filters, actions
├── lib/
│   └── analyzers/
│       ├── index.ts                     # NEW — runAllAnalyzers coordinator
│       ├── utilization.ts               # NEW — analyzeUtilization
│       ├── proximity.ts                 # NEW — analyzeTeamProximity
│       ├── onboarding.ts               # NEW — analyzeOnboarding
│       ├── moves.ts                     # NEW — analyzeMoves
│       ├── equipment.ts                 # NEW — analyzeEquipment
│       └── trends.ts                    # NEW — analyzeTrends
├── components/
│   └── editor/
│       └── RightSidebar/
│           ├── InsightsPanel.tsx         # NEW — main insights tab component
│           ├── InsightCard.tsx           # NEW — individual insight card
│           ├── InsightFilters.tsx        # NEW — filter controls
│           └── SeveritySummary.tsx       # NEW — severity count bar
├── types/
│   └── elements.ts                      # MODIFIED — add zone? to BaseElement
├── stores/
│   └── seatingStore.ts                  # MODIFIED — extend Guest → Employee fields
└── components/
    └── editor/
        └── RightSidebar/
            └── RightSidebar.tsx          # MODIFIED — add Insights tab
```

---

## 9. Scope

### Included (v1)

- Enhanced Employee model with all new fields
- Zone field on BaseElement
- All 6 analyzers with rule-based detection
- Insights store with filtering, dismissal, action execution
- Insights tab UI in right sidebar (built with frontend-design skill)
- Canvas integration (navigate, highlight, auto-assign actions)
- localStorage persistence for dismissed insights and history snapshots
- Badge count on tab

### Deferred (v2+)

- **Claude AI enrichment** — prompt engineering, API proxy (Supabase Edge Function), response parsing, cost controls
- **Monday.com integration** — board sync, item status tracking, onboarding/equipment board templates
- **Jira integration** — facilities/IT issue sync, status updates, linked desk annotations
- **Google Calendar integration** — room booking analysis, move date tracking, meeting pattern insights
- **Google Drive integration** — org chart sync, floor plan document linking, policy references
- **Slack integration** — team channel membership for org structure, notification delivery, message context
- Integration auth/connection UI (OAuth flows, settings panel per provider)
- Provider registry UI (connect/disconnect/status per integration)
- Trend history persistence in Supabase (currently localStorage only)
- Notification preferences (email/Slack alerts for critical insights)
- Custom analyzer API (user-defined rules)
- Bulk actions on insights (dismiss all info, etc.)
