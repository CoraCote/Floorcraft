import { useState } from 'react'
import {
  History,
  Armchair,
  DoorOpen,
  Square,
  Minus,
  Box,
  Coffee,
  LayoutGrid,
  MousePointer2,
  Lock,
  Unlock,
  Move,
  Maximize2,
  RotateCw,
  Type as TypeIcon,
  Image as ImageIcon,
  Sofa,
  Pencil,
  Slash,
  ArrowRight,
  Circle,
  Wifi,
  Tv,
  ShieldCheck,
  Plug,
  Network,
  Video,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useVisibleEmployees } from '../../../hooks/useVisibleEmployees'
import { useNeighborhoodStore } from '../../../stores/neighborhoodStore'
import { NeighborhoodPropertiesPanel } from './NeighborhoodPropertiesPanel'
import { PanelSection } from './PanelSection'
import { PanelEmptyState } from './PanelEmptyState'
import { unassignEmployee, deleteElements } from '../../../lib/seatAssignment'
import { alignElements, distributeElements } from '../../../lib/alignment'
import { validateDeskId } from '../../../lib/deskIdValidation'
import { useCan } from '../../../hooks/useCan'
import { SeatHistoryDrawer } from '../SeatHistoryDrawer'
import {
  EMPLOYEE_STATUS_PILL_CLASSES,
  type Employee,
  type EmployeeStatus,
} from '../../../types/employee'
import {
  isTableElement,
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
  isConferenceRoomElement,
  isCommonAreaElement,
  isWallElement,
  isDoorElement,
  isWindowElement,
  isDecorElement,
  isFreeTextElement,
  isLineShapeElement,
  isArrowElement,
  isRectShapeElement,
  isEllipseElement,
  isCustomSvgElement,
  isAccessPointElement,
  isNetworkJackElement,
  isDisplayElement,
  isVideoBarElement,
  isBadgeReaderElement,
  isOutletElement,
  WALL_TYPES,
} from '../../../types/elements'
import { computeSeatPositions } from '../../../lib/seatLayout'
import type {
  CanvasElement,
  TableElement,
  WorkstationElement,
  ConferenceRoomElement,
  CommonAreaElement,
  WallElement,
  DeskElement,
  PrivateOfficeElement,
  DoorElement,
  WindowElement,
  FreeTextElement,
  WallType,
  AccessPointElement,
  NetworkJackElement,
  DisplayElement,
  VideoBarElement,
  BadgeReaderElement,
  OutletElement,
} from '../../../types/elements'
import { SEAT_STATUS_OVERRIDES, type SeatStatus } from '../../../types/seatAssignment'

/**
 * Wave-19B audit — per-type Properties variants
 * ============================================
 *
 * Goal: every element type renders the SAME visual rhythm
 *
 *   PanelHeader  (icon + name + Lock toggle)
 *   ┌─ Identity        — type label (read-only) + Label
 *   ├─ Layout          — X/Y, Width/Height, Rotation
 *   ├─ Appearance      — Fill (where meaningful) + Stroke
 *   ├─ {type-specific} — only the section that varies between types
 *   └─ More            — Locked checkbox, History, Delete
 *
 * Pre-Wave-19B audit findings (the inconsistencies we are fixing):
 *
 *   wall              — had thickness/dashStyle/wallType in a "Wall details"
 *                       section AFTER Appearance. Stroke-only Appearance is
 *                       correct (walls don't fill).
 *   door              — NO type-specific section; only Layout + Appearance
 *                       rendered, hiding parentWallId / positionOnWall /
 *                       swingDirection / openAngle. Now: "Door details".
 *   window            — same as door. Now: "Window details".
 *   desk / hot-desk   — already polished by PR #90; renders the EmployeeDetailCard
 *                       inside a "Seat" section.
 *   workstation       — Seat section with Positions stepper + per-occupant rows
 *                       (sparse-aware filter for nulls).
 *   private-office    — Seat section, dense occupant array.
 *   conference-room   — "Room" section with roomName + capacity.
 *   common-area       — "Area" section with areaName.
 *   table-*           — "Table seats" section with seatCount stepper.
 *   decor             — NO type-specific section; shape was hidden. Now reads
 *                       out the shape value as read-only.
 *   free-text         — NO type-specific section; the body text + fontSize
 *                       were uneditable from the panel. Now: "Text" section.
 *   custom-svg        — NO controls; we surface a small "SVG source" hint.
 *   rect/ellipse/
 *   line/arrow        — Appearance-only is correct; line + arrow get an
 *                       extra dashStyle pickup mirrored from walls.
 *   neighborhood      — handled by NeighborhoodPropertiesPanel (separate file).
 *
 * Standardized header
 *   - Sticky bar with icon + type label + entity-specific subtitle.
 *   - Right side: a Lock/Unlock toggle button so the affordance lives in the
 *     header and not buried in the More section.
 *
 * Standardized empty state
 *   - PanelEmptyState with MousePointer2 + "Nothing selected" + body copy
 *     hinting at marquee select.
 *
 * Standardized multi-select
 *   - Header reads "{N} elements selected".
 *   - "Common properties" Layout section: when X/Y/W/H/rotation is identical
 *     across the selection, the value renders; mixed values show "—".
 *     Editing pushes to ALL selected ids.
 *   - "Common appearance" stroke colour fans out to the whole selection.
 *   - When all selected items share a type, the type-specific section
 *     renders too (seeded by the first element, broadcast on edit).
 *   - Align + Distribute toolbar + bulk Delete sit at the bottom.
 *
 * Locked treatment
 *   - element.locked === true: all editable fields gain `disabled` + the
 *     LOCKED indicator next to the header. Identity / Layout / Appearance /
 *     type-specific sections still render so the user can READ values.
 *   - "Unlock to edit" CTA at the top of the form clears the lock when the
 *     viewer has editMap permission.
 *
 * Reusable primitives (Wave 17D)
 *   - PanelSection — uppercase header + optional subtitle + content.
 *   - PanelEmptyState — tinted-circle empty state used here for the
 *     nothing-selected branch.
 *   - PanelHeader — used by other tabs; the Properties tab keeps its
 *     ElementHeader because it needs the type icon + Lock toggle that
 *     PanelHeader doesn't model.
 */

const WALL_TYPE_LABELS: Record<WallType, string> = {
  solid: 'Solid (drywall)',
  glass: 'Glass partition',
  'half-height': 'Half-height',
  demountable: 'Demountable',
}

/**
 * Shared input + label class strings. Defined once so the desk / wall / table
 * etc. sections can't drift in spacing or focus styling.
 */
const LABEL_CLASS = 'text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block'
const INPUT_CLASS =
  'w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500 bg-white dark:bg-gray-900'

/**
 * Section helper — thin wrapper around the shared `PanelSection` primitive
 * (Wave 17D). Forces every Properties section to use the same tracking,
 * colour, and spacing rhythm as Reports / Insights. The inner `gap-3`
 * mirrors the previous local Section so per-field spacing doesn't change.
 */
function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <PanelSection title={title} subtitle={subtitle} ariaLabel={title}>
      <div className="flex flex-col gap-3">{children}</div>
    </PanelSection>
  )
}

/**
 * Compute initials + a department-derived color for an employee. Pulled out so
 * `EmployeeDetailCard` and the workstation/private-office assignee rows share
 * the same avatar derivation rather than duplicating the slice/uppercase logic.
 */
function useEmployeeAvatar(employee: Pick<Employee, 'name' | 'department'> | undefined) {
  const getDepartmentColor = useEmployeeStore((s) => s.getDepartmentColor)
  if (!employee) return { initials: '?', deptColor: '#9CA3AF' }
  const initials = employee.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const deptColor = employee.department
    ? getDepartmentColor(employee.department)
    : '#9CA3AF'
  return { initials: initials || '?', deptColor }
}

/**
 * Map every CanvasElement type to a (Icon, type-label) tuple. Pulled out so
 * the lookup is testable and so the read-only "Type" row inside the
 * Identity section reuses the same icons as the panel header.
 *
 * Subtitle is element-specific: a desk shows its desk ID, a conference room
 * shows its name, a free-text element shows its first line, and so on.
 */
function getElementIdentity(el: CanvasElement): {
  Icon: LucideIcon
  typeLabel: string
  subtitle: string | null
} {
  if (isDeskElement(el)) {
    return { Icon: Armchair, typeLabel: el.type === 'hot-desk' ? 'Hot desk' : 'Desk', subtitle: el.deskId || el.label || null }
  }
  if (isWorkstationElement(el)) {
    return { Icon: Armchair, typeLabel: 'Workstation', subtitle: el.deskId || el.label || null }
  }
  if (isPrivateOfficeElement(el)) {
    return { Icon: DoorOpen, typeLabel: 'Private office', subtitle: el.deskId || el.label || null }
  }
  if (isTableElement(el)) {
    const lbl =
      el.type === 'table-round'
        ? 'Round table'
        : el.type === 'table-oval'
          ? 'Oval table'
          : el.type === 'table-conference'
            ? 'Conference table'
            : 'Table'
    return { Icon: Square, typeLabel: lbl, subtitle: el.label || null }
  }
  if (isWallElement(el)) {
    return { Icon: Minus, typeLabel: 'Wall', subtitle: el.label || null }
  }
  if (isDoorElement(el)) {
    return { Icon: DoorOpen, typeLabel: 'Door', subtitle: el.label || null }
  }
  if (isWindowElement(el)) {
    return { Icon: Square, typeLabel: 'Window', subtitle: el.label || null }
  }
  if (isConferenceRoomElement(el)) {
    return { Icon: Box, typeLabel: 'Conference room', subtitle: el.roomName || el.label || null }
  }
  if (isCommonAreaElement(el)) {
    return { Icon: Coffee, typeLabel: 'Common area', subtitle: el.areaName || el.label || null }
  }
  if (isDecorElement(el)) {
    // `shape` is a literal union (always truthy); fall back to label only
    // when the renderer wants the user-supplied label for clarity.
    return { Icon: Sofa, typeLabel: 'Decor', subtitle: el.label || el.shape }
  }
  if (isFreeTextElement(el)) {
    const firstLine = (el.text || '').split('\n')[0]?.slice(0, 40) ?? null
    return { Icon: TypeIcon, typeLabel: 'Text', subtitle: firstLine || el.label || null }
  }
  if (isLineShapeElement(el)) {
    return { Icon: Slash, typeLabel: 'Line', subtitle: el.label || null }
  }
  if (isArrowElement(el)) {
    return { Icon: ArrowRight, typeLabel: 'Arrow', subtitle: el.label || null }
  }
  if (isRectShapeElement(el)) {
    return { Icon: Square, typeLabel: 'Rectangle', subtitle: el.label || null }
  }
  if (isEllipseElement(el)) {
    return { Icon: Circle, typeLabel: 'Ellipse', subtitle: el.label || null }
  }
  if (isCustomSvgElement(el)) {
    return { Icon: ImageIcon, typeLabel: 'Custom shape', subtitle: el.label || null }
  }
  // Furniture catalog
  if (el.type === 'sofa') return { Icon: Sofa, typeLabel: 'Sofa', subtitle: el.label || null }
  if (el.type === 'plant') return { Icon: Sofa, typeLabel: 'Plant', subtitle: el.label || null }
  if (el.type === 'printer') return { Icon: Box, typeLabel: 'Printer', subtitle: el.label || null }
  if (el.type === 'whiteboard') return { Icon: Pencil, typeLabel: 'Whiteboard', subtitle: el.label || null }
  if (el.type === 'phone-booth') return { Icon: Box, typeLabel: 'Phone booth', subtitle: el.label || null }
  if (el.type === 'background-image') return { Icon: ImageIcon, typeLabel: 'Background image', subtitle: el.label || null }
  // IT/AV/Network/Power layer (M2). Subtitle prefers `model`/`jackId` etc.
  // — the most user-actionable identifier per type — falling back to the
  // generic label so a freshly-dropped device still shows something.
  if (isAccessPointElement(el)) return { Icon: Wifi, typeLabel: 'Access point', subtitle: el.model || el.label || null }
  if (isNetworkJackElement(el)) return { Icon: Network, typeLabel: 'Network jack', subtitle: el.jackId || el.label || null }
  if (isDisplayElement(el)) return { Icon: Tv, typeLabel: 'Display', subtitle: el.model || el.label || null }
  if (isVideoBarElement(el)) return { Icon: Video, typeLabel: 'Video bar', subtitle: el.model || el.label || null }
  if (isBadgeReaderElement(el)) return { Icon: ShieldCheck, typeLabel: 'Badge reader', subtitle: el.controlsDoorLabel || el.label || null }
  if (isOutletElement(el)) return { Icon: Plug, typeLabel: 'Outlet', subtitle: el.circuit || el.label || null }
  return { Icon: LayoutGrid, typeLabel: 'Element', subtitle: el.label || null }
}

/**
 * Header rendered at the top of the single-select branch. Sticks to the top
 * of the scrolling sidebar so the user always knows what they're editing.
 *
 * Right side carries the lock toggle button — moving the affordance OUT of
 * the More section so it's reachable in one click, like Figma's lock icon
 * in the layer header.
 */
function ElementHeader({
  el,
  canEdit,
  onToggleLock,
}: {
  el: CanvasElement
  canEdit: boolean
  onToggleLock: () => void
}) {
  const { Icon, typeLabel, subtitle } = getElementIdentity(el)
  const locked = el.locked

  return (
    <div
      data-testid="properties-panel-header"
      className="sticky top-0 z-10 -mx-3 px-3 py-2.5 bg-white/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-100 dark:border-gray-800 mb-1 flex items-center gap-2.5"
    >
      <div className="w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center flex-shrink-0">
        <Icon size={16} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{typeLabel}</div>
          {locked && (
            <span
              data-testid="properties-locked-badge"
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-[10px] font-medium text-amber-700 dark:text-amber-300"
              title="This element is locked. Click the lock icon to unlock."
            >
              <Lock size={9} aria-hidden="true" /> Locked
            </span>
          )}
        </div>
        {subtitle ? (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate" title={subtitle}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={locked ? 'Unlock element' : 'Lock element'}
        title={locked ? 'Unlock element' : 'Lock element'}
        data-testid="properties-lock-toggle"
        onClick={onToggleLock}
        disabled={!canEdit}
        className="p-1.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
      >
        {locked ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}
      </button>
    </div>
  )
}

/**
 * Controlled desk-id editor with on-blur uniqueness validation.
 *
 * Why local state: committing every keystroke lets collisions briefly
 * exist in the store, which would trip `assignEmployee` lookups and make
 * undo/redo noisy. Local state lets the user type freely; we only commit
 * on blur once the value passes `validateDeskId`. Invalid values stay
 * visible with a red error message so the user knows why the field didn't
 * save, and a `blur` without correction reverts to the stored value.
 */
function DeskIdInput({
  elementId,
  value,
  disabled,
}: {
  elementId: string
  value: string
  disabled?: boolean
}) {
  const updateElement = useElementsStore((s) => s.updateElement)
  const elements = useElementsStore((s) => s.elements)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  // Track prior props so we can reset local draft state when the store
  // value changes out from under us (undo/redo, selection swap). React's
  // recommended pattern for deriving state from props, per
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders —
  // avoids the "setState in an effect" anti-pattern the linter flags.
  const [prevValue, setPrevValue] = useState(value)
  const [prevElementId, setPrevElementId] = useState(elementId)
  if (prevValue !== value || prevElementId !== elementId) {
    setPrevValue(value)
    setPrevElementId(elementId)
    setDraft(value)
    setError(null)
  }

  return (
    <div>
      <label className={LABEL_CLASS}>Desk ID</label>
      <input
        className={`${INPUT_CLASS} ${error ? 'border-red-300 dark:border-red-700' : ''}`}
        value={draft}
        disabled={disabled}
        onChange={(e) => {
          setDraft(e.target.value)
          // Live-validate so the user sees the warning before blurring.
          setError(validateDeskId(e.target.value, elementId, elements))
        }}
        onBlur={() => {
          const problem = validateDeskId(draft, elementId, elements)
          if (problem) {
            // Revert the visible draft to the last-known-good store value
            // so the user doesn't think their typo silently saved.
            setDraft(value)
            setError(null)
            return
          }
          const trimmed = draft.trim()
          if (trimmed !== value) {
            updateElement(elementId, { deskId: trimmed })
          }
          setError(null)
        }}
      />
      {error && <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">{error}</div>}
    </div>
  )
}

/**
 * Opt-in override for a seat's status. The default (`assigned` when someone
 * is on it, `unassigned` otherwise) is derived from the assignment and
 * isn't offered here — picking one of those in a dropdown and then
 * assigning/clearing somebody would desync the two truths. Only the three
 * real overrides (`reserved`, `hot-desk`, `decommissioned`) plus "none" are
 * surfaced.
 */
function SeatStatusOverridePicker({
  elementId,
  value,
  disabled,
}: {
  elementId: string
  value: SeatStatus | undefined
  disabled?: boolean
}) {
  const updateElement = useElementsStore((s) => s.updateElement)
  return (
    <div>
      <label className={LABEL_CLASS}>Seat status override</label>
      <select
        className={INPUT_CLASS}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value
          // `undefined` (cleared) removes the key so the derivation kicks
          // back in. Setting `null` would persist an explicit null through
          // autosave, which is noisier than absence.
          updateElement(elementId, {
            seatStatus: v ? (v as SeatStatus) : undefined,
          } as Partial<DeskElement | WorkstationElement | PrivateOfficeElement>)
        }}
      >
        <option value="">None (derive from assignment)</option>
        {SEAT_STATUS_OVERRIDES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  )
}

/**
 * IT device — generic text field.
 *
 * Why a wrapper rather than inlining six near-identical `<input>`s per
 * device type: the IT-device family has a wide field surface (model,
 * serial, MAC, IP, vendor, jackId, switch port, …) and every field is a
 * trim-on-blur, persist-null-on-empty text input. Centralising that
 * "type-as-you-go but only commit on blur" idiom in one component keeps
 * the per-device sections readable and stops a "did this field commit
 * empty as null or empty-string?" drift between sibling inputs.
 *
 * Persistence policy: an empty string saves as `null`, mirroring the
 * `field?: string | null` shape of every IT-device interface (see
 * `types/elements.ts`). This matters for autosave round-trips and the
 * future CSV export — `null` reads as "not set", `""` reads as "set to
 * the empty string", which would be a different signal in a report.
 *
 * `field` is the keyof-targeted string field on the device. We keep it
 * loose (`string`) rather than narrowing per-component because each
 * device type has a different set of fields and a discriminated-union
 * type would force a generic that doesn't carry its weight here — every
 * call site picks the right field name explicitly.
 */
type ITDeviceWithStringFields =
  | AccessPointElement
  | NetworkJackElement
  | DisplayElement
  | VideoBarElement
  | BadgeReaderElement
  | OutletElement

function ITDeviceTextField({
  label,
  elementId,
  value,
  field,
  placeholder,
  disabled,
}: {
  label: string
  elementId: string
  value: string | null | undefined
  field: string
  placeholder?: string
  disabled?: boolean
}) {
  const updateElement = useElementsStore((s) => s.updateElement)
  // Local draft state so the user can type freely; we only commit on
  // blur. Tracking prior props lets us reset the draft when the store
  // changes out from under us (undo/redo, selection swap), matching
  // the established `DeskIdInput` idiom above. Avoids the
  // setState-in-effect anti-pattern the linter flags.
  const [draft, setDraft] = useState(value ?? '')
  const [prevValue, setPrevValue] = useState<string | null | undefined>(value)
  const [prevElementId, setPrevElementId] = useState(elementId)
  if (prevValue !== value || prevElementId !== elementId) {
    setPrevValue(value)
    setPrevElementId(elementId)
    setDraft(value ?? '')
  }

  return (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      <input
        className={INPUT_CLASS}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = draft.trim()
          // Empty string → null so the persisted shape matches the
          // `field?: string | null` type (see rationale above).
          const next = trimmed === '' ? null : trimmed
          if (next !== (value ?? null)) {
            updateElement(elementId, { [field]: next } as unknown as Partial<ITDeviceWithStringFields>)
          }
        }}
      />
    </div>
  )
}

/**
 * IT device — install-date field. Native `<input type="date">` so the
 * user gets the platform's calendar picker; the stored value is always
 * an ISO yyyy-mm-dd string (or null when cleared) so it sorts
 * lexicographically and round-trips through CSV cleanly.
 */
function ITDeviceDateField({
  elementId,
  value,
  disabled,
}: {
  elementId: string
  value: string | null | undefined
  disabled?: boolean
}) {
  const updateElement = useElementsStore((s) => s.updateElement)
  return (
    <div>
      <label className={LABEL_CLASS}>Install date</label>
      <input
        type="date"
        className={INPUT_CLASS}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) =>
          updateElement(elementId, {
            installDate: e.target.value === '' ? null : e.target.value,
          } as Partial<ITDeviceWithStringFields>)
        }
      />
    </div>
  )
}

/**
 * IT device — operational-status select. Five canonical states match
 * the `deviceStatus` literal union on every IT-device interface. The
 * select commits immediately on change because there's no "draft" mode
 * that makes sense for an enum.
 */
const IT_DEVICE_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'installed', label: 'Installed' },
  { value: 'live', label: 'Live' },
  { value: 'decommissioned', label: 'Decommissioned' },
  { value: 'broken', label: 'Broken' },
] as const

type ITDeviceStatus = (typeof IT_DEVICE_STATUSES)[number]['value']

function ITDeviceStatusField({
  elementId,
  value,
  disabled,
}: {
  elementId: string
  value: ITDeviceStatus | null | undefined
  disabled?: boolean
}) {
  const updateElement = useElementsStore((s) => s.updateElement)
  return (
    <div>
      <label className={LABEL_CLASS}>Status</label>
      <select
        aria-label="Status"
        className={INPUT_CLASS}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) =>
          updateElement(elementId, {
            deviceStatus: (e.target.value || null) as ITDeviceStatus | null,
          } as Partial<ITDeviceWithStringFields>)
        }
      >
        <option value="">—</option>
        {IT_DEVICE_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * Short status labels used inside the employee detail card chip. Kept
 * local so the file has no non-component exports (which would trip the
 * `react-refresh/only-export-components` lint rule).
 */
const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  active: 'Active',
  'on-leave': 'On leave',
  departed: 'Departed',
  'parental-leave': 'Parental leave',
  sabbatical: 'Sabbatical',
  contractor: 'Contractor',
  intern: 'Intern',
}

/**
 * Compact employee profile block rendered at the top of the desk /
 * hot-desk properties branch whenever the selected seat has an assigned
 * employee. Replaces the earlier canvas-overlay popover — surfacing the
 * same avatar, chips, and actions inside the 320px sidebar so the canvas
 * stays clear for editing.
 *
 * Redaction: when the viewer lacks `viewPII`, `useVisibleEmployees`
 * already projects the store through `redactEmployee`, so we can trust
 * the passed `employee` record. We still show explicit
 * "— (redacted)" placeholders for the email + manager rows so the viewer
 * knows the field was withheld (vs. missing).
 */
function EmployeeDetailCard({
  employee,
  canViewPII,
  canEditRoster,
}: {
  employee: Employee
  canViewPII: boolean
  canEditRoster: boolean
}) {
  const navigate = useNavigate()
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  const rawEmployees = useEmployeeStore((s) => s.employees)
  const { initials, deptColor } = useEmployeeAvatar(employee)

  // Manager lookup: redaction blanks `managerId`, so when `viewPII=false`
  // this naturally skips the real manager and we render the redacted
  // placeholder instead. Under `viewPII=true`, we still need the raw
  // store (not the redacted projection) to fetch the manager's name.
  const manager =
    canViewPII && employee.managerId && rawEmployees[employee.managerId]
      ? rawEmployees[employee.managerId]
      : null

  const handleUnassign = () => {
    unassignEmployee(employee.id)
  }

  const handleViewProfile = () => {
    if (teamSlug && officeSlug) {
      navigate(`/t/${teamSlug}/o/${officeSlug}/roster?focus=${employee.id}`)
    }
  }

  const infoRow = (label: string, value: string, title: string) => (
    <div className="flex justify-between items-center gap-3 text-xs">
      <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 flex-shrink-0">
        {label}
      </span>
      <span
        className="text-gray-800 dark:text-gray-100 truncate text-right"
        title={title}
      >
        {value}
      </span>
    </div>
  )

  return (
    <div
      data-testid="employee-detail-card"
      className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"
    >
      {/* Header: avatar + name + title */}
      <div className="flex items-center gap-3 min-w-0">
        {employee.photoUrl ? (
          <img
            src={employee.photoUrl}
            alt=""
            width={44}
            height={44}
            className="w-11 h-11 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div
            aria-hidden
            className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
            style={{ background: deptColor }}
          >
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate"
            title={employee.name}
          >
            {employee.name || '—'}
          </div>
          {employee.title && (
            <div
              className="text-xs text-gray-500 dark:text-gray-400 truncate"
              title={employee.title}
            >
              {employee.title}
            </div>
          )}
        </div>
      </div>

      {/* Chips: department + status */}
      <div className="flex gap-2 flex-wrap mt-3">
        {employee.department && (
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
            style={{ background: deptColor }}
          >
            {employee.department}
          </span>
        )}
        <span
          data-testid="status-chip"
          className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${EMPLOYEE_STATUS_PILL_CLASSES[employee.status]}`}
        >
          {EMPLOYEE_STATUS_LABEL[employee.status]}
        </span>
      </div>

      {/* Info rows — definition list, label/value per row, separator above */}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-2.5 mt-3 flex flex-col gap-1.5">
        {infoRow('Team', employee.team || '—', employee.team || '—')}
        {infoRow(
          'Manager',
          canViewPII ? manager?.name || '—' : '— (redacted)',
          canViewPII ? manager?.name || '—' : '— (redacted)',
        )}
        {infoRow(
          'Email',
          canViewPII ? employee.email || '—' : '— (redacted)',
          canViewPII ? employee.email || '—' : '— (redacted)',
        )}
      </div>

      {/* Actions — full-width 2-column grid, danger styling on Unassign */}
      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
        {canEditRoster ? (
          <button
            type="button"
            onClick={handleUnassign}
            data-testid="employee-detail-unassign"
            className="px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900/50 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            Unassign
          </button>
        ) : (
          // Spacer so the View profile button still spans the right column
          // when the viewer lacks edit-roster permission.
          <div />
        )}
        <button
          type="button"
          onClick={handleViewProfile}
          data-testid="employee-detail-view-profile"
          className="px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50"
        >
          View profile
        </button>
      </div>
    </div>
  )
}

/**
 * Single-line assignee row used inside workstation + private-office Seat
 * sections. Pulled out so both call sites share the avatar + truncate +
 * Clear-button layout.
 */
function AssigneeRow({
  employee,
  fallbackId,
  canEdit,
  onClear,
}: {
  employee: Employee | undefined
  fallbackId: string
  canEdit: boolean
  onClear: () => void
}) {
  const { initials, deptColor } = useEmployeeAvatar(employee)
  const name = employee?.name || fallbackId
  return (
    <div className="flex items-center justify-between gap-2 text-sm border border-gray-200 dark:border-gray-800 rounded-md px-2.5 py-1.5 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div
          aria-hidden
          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
          style={{ background: deptColor }}
        >
          {initials}
        </div>
        <span className="text-gray-800 dark:text-gray-100 truncate" title={name}>
          {name}
        </span>
      </div>
      {canEdit && (
        <button
          onClick={onClear}
          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 flex-shrink-0"
        >
          Clear
        </button>
      )}
    </div>
  )
}

export function PropertiesPanel() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const elements = useElementsStore((s) => s.elements)
  const updateElement = useElementsStore((s) => s.updateElement)
  // Display-layer read — the assigned-employee name preview in the Desk
  // section should go through redaction when the viewer lacks `viewPII`.
  const employees = useVisibleEmployees()
  const neighborhoods = useNeighborhoodStore((s) => s.neighborhoods)
  const canEdit = useCan('editMap')
  const canViewHistory = useCan('viewSeatHistory')
  // Read these unconditionally at the top so the hook call order is
  // stable — combining them with `||` would short-circuit the second
  // call and violate rules-of-hooks on re-render.
  const canViewPII = useCan('viewPII')
  const canEditRoster = useCan('editRoster')
  const inputDisabled = !canEdit
  // Locally owned drawer target — the panel unmounts on selection change
  // (key'd by element id higher up), which cleans this up automatically.
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null)

  // If the single selected id belongs to a neighborhood (not an element),
  // delegate to the dedicated neighborhood panel. Neighborhoods live in
  // their own store, so `elements[id]` will be undefined — we can't rely
  // on the existing fall-through code to render them.
  if (selectedIds.length === 1 && neighborhoods[selectedIds[0]]) {
    return <NeighborhoodPropertiesPanel id={selectedIds[0]} />
  }

  if (selectedIds.length === 0) {
    // Use the shared `PanelEmptyState` so this branch matches the empty
    // states in Insights / Reports / Annotations rather than rolling its
    // own. Body copy doubles as a marquee-select hint — most users
    // discover shift-drag through the tip rather than docs.
    return (
      <PanelEmptyState
        icon={MousePointer2}
        title="Nothing selected"
        body={
          <>
            Click any element on the canvas to see its properties.
            <br />
            Shift-drag to select multiple elements.
          </>
        }
      />
    )
  }

  if (selectedIds.length > 1) {
    const selectedEls = selectedIds
      .map((id) => elements[id])
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
    const allWalls = selectedEls.length > 0 && selectedEls.every(isWallElement)
    // For the shared controls we seed the inputs from the first wall; edits
    // always broadcast to the full selection so a mixed-value display is an
    // acceptable simplification (common in pro editors like Figma).
    const firstWall = allWalls ? (selectedEls[0] as WallElement) : null
    const first = selectedEls[0]
    const allLocked = selectedEls.length > 0 && selectedEls.every((e) => e.locked)
    const someLocked = selectedEls.some((e) => e.locked)
    // The "common properties" header treats locked elements as read-only:
    // we don't want the user to bulk-shrink a frozen reference shape, but
    // they should still SEE the shared values. The Layout fields disable
    // when ANY selected element is locked (matches Figma).
    const sharedDisabled = inputDisabled || someLocked

    /**
     * Return the shared rounded value when every selected element matches,
     * or empty string when they diverge. We pair an empty value with a
     * placeholder of "—" on the input — type="number" inputs reject the
     * literal "—" string, so the placeholder is the only way to render
     * the mixed-value sentinel for users.
     */
    const sharedNumber = (pick: (e: CanvasElement) => number): string => {
      if (selectedEls.length === 0) return ''
      const v = Math.round(pick(selectedEls[0]))
      const all = selectedEls.every((e) => Math.round(pick(e)) === v)
      return all ? String(v) : ''
    }
    const broadcastNumber = (key: 'x' | 'y' | 'width' | 'height' | 'rotation', raw: string) => {
      const n = Number(raw)
      if (!Number.isFinite(n)) return
      for (const id of selectedIds) updateElement(id, { [key]: n })
    }

    const alignBtn = (label: string, onClick: () => void, Icon: typeof AlignHorizontalJustifyStart) => (
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        disabled={inputDisabled}
        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon size={16} />
      </button>
    )

    return (
      <div className="flex flex-col gap-5" data-testid="properties-multi-select">
        {/* Header row mirrors the single-select header so the visual
            rhythm doesn't shift when the user changes selection size. */}
        <div className="sticky top-0 z-10 -mx-3 px-3 py-2.5 bg-white/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-100 dark:border-gray-800 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center flex-shrink-0">
            <LayoutGrid size={16} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {selectedIds.length} elements selected
            </div>
            {someLocked && (
              <div className="text-[11px] text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                <Lock size={10} aria-hidden="true" />
                {allLocked ? 'All locked' : 'Some locked'}
              </div>
            )}
          </div>
        </div>

        {/* Common Layout properties — Figma-style mixed-value placeholder.
            Editing broadcasts to every selected id even when the displayed
            value reads "—" because the user wants an explicit override. */}
        {first && (
          <Section title="Common properties" subtitle="Edits apply to all selected">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLASS}>X</label>
                <input
                  type="number"
                  className={`${INPUT_CLASS} tabular-nums`}
                  value={sharedNumber((e) => e.x)}
                  placeholder="—"
                  disabled={sharedDisabled}
                  onChange={(e) => broadcastNumber('x', e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Y</label>
                <input
                  type="number"
                  className={`${INPUT_CLASS} tabular-nums`}
                  value={sharedNumber((e) => e.y)}
                  placeholder="—"
                  disabled={sharedDisabled}
                  onChange={(e) => broadcastNumber('y', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLASS}>Width</label>
                <input
                  type="number"
                  className={`${INPUT_CLASS} tabular-nums`}
                  value={sharedNumber((e) => e.width)}
                  placeholder="—"
                  disabled={sharedDisabled}
                  onChange={(e) => broadcastNumber('width', e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Height</label>
                <input
                  type="number"
                  className={`${INPUT_CLASS} tabular-nums`}
                  value={sharedNumber((e) => e.height)}
                  placeholder="—"
                  disabled={sharedDisabled}
                  onChange={(e) => broadcastNumber('height', e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={LABEL_CLASS}>Rotation</label>
              <input
                type="number"
                className={`${INPUT_CLASS} tabular-nums`}
                value={sharedNumber((e) => e.rotation)}
                placeholder="—"
                disabled={sharedDisabled}
                min={0}
                max={359}
                onChange={(e) => broadcastNumber('rotation', e.target.value)}
              />
            </div>
          </Section>
        )}

        {/* Alignment + distribution. Distribution needs ≥3 elements, so the
            distribution buttons disable below that count but stay visible
            so the toolbar layout doesn't jump. */}
        <Section title="Arrange">
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Align</div>
            <div className="flex items-center gap-1 flex-wrap">
              {alignBtn('Align left', () => alignElements(selectedIds, 'left'), AlignHorizontalJustifyStart)}
              {alignBtn('Align horizontal center', () => alignElements(selectedIds, 'h-center'), AlignHorizontalJustifyCenter)}
              {alignBtn('Align right', () => alignElements(selectedIds, 'right'), AlignHorizontalJustifyEnd)}
              {alignBtn('Align top', () => alignElements(selectedIds, 'top'), AlignVerticalJustifyStart)}
              {alignBtn('Align vertical center', () => alignElements(selectedIds, 'v-center'), AlignVerticalJustifyCenter)}
              {alignBtn('Align bottom', () => alignElements(selectedIds, 'bottom'), AlignVerticalJustifyEnd)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Distribute</div>
            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                aria-label="Distribute horizontally"
                title="Distribute horizontally"
                onClick={() => distributeElements(selectedIds, 'horizontal')}
                disabled={selectedIds.length < 3 || inputDisabled}
                className="p-1.5 rounded text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <AlignHorizontalSpaceAround size={16} />
              </button>
              <button
                type="button"
                aria-label="Distribute vertically"
                title="Distribute vertically"
                onClick={() => distributeElements(selectedIds, 'vertical')}
                disabled={selectedIds.length < 3 || inputDisabled}
                className="p-1.5 rounded text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <AlignVerticalSpaceAround size={16} />
              </button>
            </div>
          </div>
        </Section>

        {allWalls && firstWall && (
          <Section title="Wall details" subtitle="Same fields as single-select">
            <div>
              <label className={LABEL_CLASS}>Thickness</label>
              <input
                type="number"
                min={2}
                max={20}
                step={1}
                className={`${INPUT_CLASS} tabular-nums`}
                value={firstWall.thickness}
                disabled={sharedDisabled}
                onChange={(e) => {
                  const t = Number(e.target.value)
                  for (const id of selectedIds) updateElement(id, { thickness: t } as Partial<WallElement>)
                }}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Line style</label>
              <select
                aria-label="Line style"
                className={INPUT_CLASS}
                value={firstWall.dashStyle ?? 'solid'}
                disabled={sharedDisabled}
                onChange={(e) => {
                  const v = e.target.value as 'solid' | 'dashed' | 'dotted'
                  for (const id of selectedIds) updateElement(id, { dashStyle: v } as Partial<WallElement>)
                }}
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Wall type</label>
              <select
                aria-label="Wall type"
                className={INPUT_CLASS}
                value={firstWall.wallType ?? 'solid'}
                disabled={sharedDisabled}
                onChange={(e) => {
                  const v = e.target.value as WallType
                  for (const id of selectedIds) updateElement(id, { wallType: v } as Partial<WallElement>)
                }}
              >
                {WALL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {WALL_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Stroke</label>
              <input
                type="color"
                className="w-full h-8 border border-gray-200 dark:border-gray-800 rounded cursor-pointer disabled:opacity-50"
                value={firstWall.style.stroke}
                disabled={sharedDisabled}
                onChange={(e) => {
                  for (const id of selectedIds) {
                    const el = elements[id]
                    if (!el) continue
                    updateElement(id, { style: { ...el.style, stroke: e.target.value } })
                  }
                }}
              />
            </div>
          </Section>
        )}

        <Section title="Actions">
          {canEdit && someLocked && (
            <button
              type="button"
              onClick={() => {
                for (const id of selectedIds) updateElement(id, { locked: !allLocked })
              }}
              className="w-full px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50 inline-flex items-center justify-center gap-1.5"
            >
              {allLocked ? <Unlock size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
              {allLocked ? 'Unlock all' : 'Lock remaining'}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                deleteElements(selectedIds)
                useUIStore.getState().clearSelection()
              }}
              className="w-full px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            >
              Delete {selectedIds.length} elements
            </button>
          )}
        </Section>
      </div>
    )
  }

  const el = elements[selectedIds[0]]
  if (!el) return null

  const update = (updates: Record<string, unknown>) => updateElement(el.id, updates)
  // Locked element: every field below disables (matches Figma's lock
  // behaviour). The viewer can still READ values; only writes get
  // suppressed. The "Unlock to edit" button at the top toggles `locked`.
  const lockedDisabled = inputDisabled || el.locked
  const identity = getElementIdentity(el)

  // Derive which "details" section to render after Appearance based on type.
  // Walls / tables / conference rooms / common areas have their own custom
  // controls; desk / workstation / private office share the Seat section.
  const isSeatHolder = isDeskElement(el) || isWorkstationElement(el) || isPrivateOfficeElement(el)

  return (
    <div className="flex flex-col gap-5">
      <ElementHeader
        el={el}
        canEdit={canEdit}
        onToggleLock={() => update({ locked: !el.locked })}
      />

      {/* Locked banner: when the viewer can edit but the element is locked,
          surface the unlock CTA at the top so the user doesn't have to
          scroll to the More section to find it. Hidden when the user lacks
          editMap (the toggle would no-op anyway). */}
      {el.locked && canEdit && (
        <div
          data-testid="properties-locked-banner"
          className="flex items-center gap-2 rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
        >
          <Lock size={12} aria-hidden="true" className="flex-shrink-0" />
          <span className="flex-1">This element is locked. Unlock to edit its fields.</span>
          <button
            type="button"
            onClick={() => update({ locked: false })}
            className="px-2 py-1 rounded text-xs font-medium text-amber-800 dark:text-amber-200 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50 inline-flex items-center gap-1"
          >
            <Unlock size={10} aria-hidden="true" /> Unlock to edit
          </button>
        </div>
      )}

      <Section title="Identity">
        {/* Read-only Type row — shows the same icon as the header so the
            user can confirm at a glance what kind of element this is.
            Helpful when the element has no label or a generic label. */}
        <div>
          <label className={LABEL_CLASS}>Type</label>
          <div
            data-testid="properties-type-row"
            className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 bg-gray-50/60 dark:bg-gray-900/40"
          >
            <identity.Icon size={14} aria-hidden="true" className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
            <span className="truncate">{identity.typeLabel}</span>
          </div>
        </div>
        <div>
          <label className={LABEL_CLASS}>Label</label>
          <input
            className={INPUT_CLASS}
            value={el.label}
            disabled={lockedDisabled}
            onChange={(e) => update({ label: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
          <input
            type="checkbox"
            checked={el.visible !== false}
            disabled={lockedDisabled}
            onChange={(e) => update({ visible: e.target.checked })}
            className="rounded"
          />
          Visible on canvas
        </label>
      </Section>

      <Section title="Layout">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={`${LABEL_CLASS} inline-flex items-center gap-1`}>
              <Move size={10} aria-hidden="true" /> X
            </label>
            <input
              type="number"
              className={`${INPUT_CLASS} tabular-nums`}
              value={Math.round(el.x)}
              disabled={lockedDisabled}
              onChange={(e) => update({ x: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={`${LABEL_CLASS} inline-flex items-center gap-1`}>
              <Move size={10} aria-hidden="true" /> Y
            </label>
            <input
              type="number"
              className={`${INPUT_CLASS} tabular-nums`}
              value={Math.round(el.y)}
              disabled={lockedDisabled}
              onChange={(e) => update({ y: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={`${LABEL_CLASS} inline-flex items-center gap-1`}>
              <Maximize2 size={10} aria-hidden="true" /> Width
            </label>
            <input
              type="number"
              className={`${INPUT_CLASS} tabular-nums`}
              value={Math.round(el.width)}
              disabled={lockedDisabled}
              onChange={(e) => update({ width: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={`${LABEL_CLASS} inline-flex items-center gap-1`}>
              <Maximize2 size={10} aria-hidden="true" /> Height
            </label>
            <input
              type="number"
              className={`${INPUT_CLASS} tabular-nums`}
              value={Math.round(el.height)}
              disabled={lockedDisabled}
              onChange={(e) => update({ height: Number(e.target.value) })}
            />
          </div>
        </div>

        <div>
          <label className={`${LABEL_CLASS} inline-flex items-center gap-1`}>
            <RotateCw size={10} aria-hidden="true" /> Rotation (°)
          </label>
          <input
            type="number"
            className={`${INPUT_CLASS} tabular-nums`}
            value={Math.round(el.rotation)}
            disabled={lockedDisabled}
            onChange={(e) => update({ rotation: Number(e.target.value) % 360 })}
            min={0}
            max={359}
          />
        </div>
      </Section>

      <Section title="Appearance">
        {/* Walls + lines + arrows are stroke-only — Fill has no visual
            effect on a polyline so we hide it. Everything else gets the
            full Fill + Stroke pair. */}
        {isWallElement(el) || isLineShapeElement(el) || isArrowElement(el) ? (
          <div>
            <label className={LABEL_CLASS}>Stroke</label>
            <input
              type="color"
              className="w-full h-8 border border-gray-200 dark:border-gray-800 rounded cursor-pointer disabled:opacity-50"
              value={el.style.stroke}
              disabled={lockedDisabled}
              onChange={(e) => update({ style: { ...el.style, stroke: e.target.value } })}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL_CLASS}>Fill</label>
              <input
                type="color"
                className="w-full h-8 border border-gray-200 dark:border-gray-800 rounded cursor-pointer disabled:opacity-50"
                value={el.style.fill}
                disabled={lockedDisabled}
                onChange={(e) => update({ style: { ...el.style, fill: e.target.value } })}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Stroke</label>
              <input
                type="color"
                className="w-full h-8 border border-gray-200 dark:border-gray-800 rounded cursor-pointer disabled:opacity-50"
                value={el.style.stroke}
                disabled={lockedDisabled}
                onChange={(e) => update({ style: { ...el.style, stroke: e.target.value } })}
              />
            </div>
          </div>
        )}
        <div>
          <label className={LABEL_CLASS}>Stroke width</label>
          <input
            type="number"
            min={0}
            max={20}
            step={0.5}
            className={`${INPUT_CLASS} tabular-nums`}
            value={el.style.strokeWidth}
            disabled={lockedDisabled}
            onChange={(e) =>
              update({ style: { ...el.style, strokeWidth: Number(e.target.value) } })
            }
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Opacity</label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              className="flex-1"
              value={el.style.opacity}
              disabled={lockedDisabled}
              onChange={(e) =>
                update({ style: { ...el.style, opacity: Number(e.target.value) } })
              }
            />
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums w-10 text-right">
              {Math.round((el.style.opacity ?? 1) * 100)}%
            </span>
          </div>
        </div>
      </Section>

      {/* Wall-specific controls: thickness + dash pattern + semantic type. */}
      {isWallElement(el) && (
        <Section title="Wall details">
          <div>
            <label className={LABEL_CLASS}>Thickness</label>
            <input
              type="number"
              min={2}
              max={20}
              step={1}
              className={`${INPUT_CLASS} tabular-nums`}
              value={el.thickness}
              disabled={lockedDisabled}
              onChange={(e) => update({ thickness: Number(e.target.value) } as Partial<WallElement>)}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Line style</label>
            <select
              aria-label="Line style"
              className={INPUT_CLASS}
              value={el.dashStyle ?? 'solid'}
              disabled={lockedDisabled}
              onChange={(e) =>
                update({ dashStyle: e.target.value as 'solid' | 'dashed' | 'dotted' } as Partial<WallElement>)
              }
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Wall type</label>
            <select
              aria-label="Wall type"
              className={INPUT_CLASS}
              value={el.wallType ?? 'solid'}
              disabled={lockedDisabled}
              onChange={(e) =>
                update({ wallType: e.target.value as WallType } as Partial<WallElement>)
              }
            >
              {WALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {WALL_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </Section>
      )}

      {/* Door details — parent wall is read-only; doors are repositioned by
          dragging on the canvas, so we just surface the linkage so the user
          can confirm WHICH wall the door belongs to. positionOnWall /
          swingDirection / openAngle are surfaced here for the first time. */}
      {isDoorElement(el) && (
        <Section title="Door details">
          <div>
            <label className={LABEL_CLASS}>Attached to wall</label>
            <div className="text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 bg-gray-50/60 dark:bg-gray-900/40 truncate font-mono">
              {el.parentWallId || '— (orphan)'}
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>Position on wall</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                className="flex-1"
                value={el.positionOnWall}
                disabled={lockedDisabled}
                onChange={(e) =>
                  update({ positionOnWall: Number(e.target.value) } as Partial<DoorElement>)
                }
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums w-10 text-right">
                {Math.round((el.positionOnWall ?? 0) * 100)}%
              </span>
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>Swing direction</label>
            <select
              aria-label="Swing direction"
              className={INPUT_CLASS}
              value={el.swingDirection}
              disabled={lockedDisabled}
              onChange={(e) =>
                update({ swingDirection: e.target.value as 'left' | 'right' | 'both' } as Partial<DoorElement>)
              }
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="both">Both (double door)</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Open angle (°)</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={180}
                step={5}
                className="flex-1"
                value={el.openAngle}
                disabled={lockedDisabled}
                onChange={(e) =>
                  update({ openAngle: Number(e.target.value) } as Partial<DoorElement>)
                }
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums w-10 text-right">
                {Math.round(el.openAngle ?? 0)}°
              </span>
            </div>
          </div>
        </Section>
      )}

      {/* Window details — like doors, but no swing/angle. */}
      {isWindowElement(el) && (
        <Section title="Window details">
          <div>
            <label className={LABEL_CLASS}>Attached to wall</label>
            <div className="text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 bg-gray-50/60 dark:bg-gray-900/40 truncate font-mono">
              {el.parentWallId || '— (orphan)'}
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>Position on wall</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                className="flex-1"
                value={el.positionOnWall}
                disabled={lockedDisabled}
                onChange={(e) =>
                  update({ positionOnWall: Number(e.target.value) } as Partial<WindowElement>)
                }
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums w-10 text-right">
                {Math.round((el.positionOnWall ?? 0) * 100)}%
              </span>
            </div>
          </div>
        </Section>
      )}

      {isTableElement(el) && (
        <Section title="Table seats">
          <div>
            <label className={LABEL_CLASS}>Seats</label>
            <input
              type="number"
              className={`${INPUT_CLASS} tabular-nums`}
              value={el.seatCount}
              min={1}
              max={30}
              disabled={lockedDisabled}
              onChange={(e) => {
                const count = Number(e.target.value)
                const seats = computeSeatPositions(el.type, count, el.seatLayout, el.width, el.height)
                update({ seatCount: count, seats } as Partial<TableElement>)
              }}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Seat layout</label>
            <select
              aria-label="Seat layout"
              className={INPUT_CLASS}
              value={el.seatLayout}
              disabled={lockedDisabled}
              onChange={(e) => {
                const layout = e.target.value as TableElement['seatLayout']
                const seats = computeSeatPositions(el.type, el.seatCount, layout, el.width, el.height)
                update({ seatLayout: layout, seats } as Partial<TableElement>)
              }}
            >
              <option value="around">Around</option>
              <option value="one-side">One side</option>
              <option value="both-sides">Both sides</option>
              <option value="u-shape">U-shape</option>
            </select>
          </div>
        </Section>
      )}

      {/* Decor — shape is fixed at creation; surface as read-only so the
          user knows what kind of decor item is selected without having to
          read the canvas. */}
      {isDecorElement(el) && (
        <Section title="Decor">
          <div>
            <label className={LABEL_CLASS}>Shape</label>
            <div className="text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 bg-gray-50/60 dark:bg-gray-900/40 truncate capitalize">
              {el.shape}
            </div>
          </div>
        </Section>
      )}

      {/* Free-text — body + font size. Multi-line via textarea so newlines
          survive into the canvas renderer. */}
      {isFreeTextElement(el) && (
        <Section title="Text">
          <div>
            <label className={LABEL_CLASS}>Body</label>
            <textarea
              rows={3}
              className={INPUT_CLASS}
              value={el.text}
              disabled={lockedDisabled}
              onChange={(e) => update({ text: e.target.value } as Partial<FreeTextElement>)}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Font size</label>
            <input
              type="number"
              min={6}
              max={120}
              step={1}
              className={`${INPUT_CLASS} tabular-nums`}
              value={el.fontSize}
              disabled={lockedDisabled}
              onChange={(e) => update({ fontSize: Number(e.target.value) } as Partial<FreeTextElement>)}
            />
          </div>
        </Section>
      )}

      {/* Line + arrow get the same dashStyle picker as walls so the visual
          grammar of polylines stays consistent across the editor. */}
      {(isLineShapeElement(el) || isArrowElement(el)) && (
        <Section title={isArrowElement(el) ? 'Arrow details' : 'Line details'}>
          <div>
            <label className={LABEL_CLASS}>Line style</label>
            <select
              aria-label="Line style"
              className={INPUT_CLASS}
              value={el.dashStyle ?? 'solid'}
              disabled={lockedDisabled}
              onChange={(e) =>
                update({ dashStyle: e.target.value as 'solid' | 'dashed' | 'dotted' })
              }
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>
        </Section>
      )}

      {/* Seat: shared section for desk / workstation / private-office.
          All seat metadata (assignee block, deskId, status override,
          empty-state hint) lives here so the user reads it as one group. */}
      {isSeatHolder && (
        <Section title="Seat">
          {isDeskElement(el) && el.assignedEmployeeId && employees[el.assignedEmployeeId] ? (
            <EmployeeDetailCard
              employee={employees[el.assignedEmployeeId]}
              canViewPII={canViewPII}
              canEditRoster={canEditRoster}
            />
          ) : null}

          {isWorkstationElement(el) && (
            <div>
              <label className={LABEL_CLASS}>Positions</label>
              <input
                type="number"
                className={`${INPUT_CLASS} tabular-nums`}
                value={el.positions}
                min={1}
                max={20}
                disabled={lockedDisabled}
                onChange={(e) => {
                  const newCount = Number(e.target.value)
                  if (!Number.isFinite(newCount) || newCount < 1) return
                  // Workstation `assignedEmployeeIds` is a SPARSE
                  // positional array (length === positions, nulls for
                  // empty slots). Resizing means:
                  //   - shrinking → unassign anyone in the tail slots,
                  //     then truncate the array.
                  //   - growing → right-pad with nulls so the renderer
                  //     can still iterate `0..positions` safely.
                  // The `update()` call below only sets `positions`; we
                  // also need to send a fresh `assignedEmployeeIds`
                  // when the length is changing.
                  const current = el.assignedEmployeeIds
                  if (newCount < current.length) {
                    const tail = current.slice(newCount)
                    tail.forEach((empId) => {
                      if (empId) unassignEmployee(empId)
                    })
                    // Re-read after the unassign cascade — store mutations
                    // are synchronous, so the latest snapshot has the
                    // already-tail-cleared array. Truncate to newCount.
                    update({
                      positions: newCount,
                      assignedEmployeeIds: current.slice(0, newCount),
                    } as Partial<WorkstationElement>)
                  } else if (newCount > current.length) {
                    const padded: Array<string | null> = [
                      ...current,
                      ...Array.from({ length: newCount - current.length }, () => null),
                    ]
                    update({
                      positions: newCount,
                      assignedEmployeeIds: padded,
                    } as Partial<WorkstationElement>)
                  } else {
                    update({ positions: newCount } as Partial<WorkstationElement>)
                  }
                }}
              />
            </div>
          )}

          {(isWorkstationElement(el) || isPrivateOfficeElement(el)) && (() => {
            // Workstations store a sparse `(string|null)[]`; private
            // offices still store a dense `string[]`. Filter out nulls
            // for both display count and the AssigneeRow loop so the
            // panel doesn't render an empty row per empty slot. The
            // explicit cast through `Array<string | null>` is needed
            // because the discriminated-union type for the workstation
            // arm widens the element-array type, so the `.filter`
            // predicate alone doesn't narrow the resulting array
            // element type to `string`.
            const occupants: string[] = (
              el.assignedEmployeeIds as Array<string | null>
            ).filter((id): id is string => !!id)
            const capacity = isWorkstationElement(el) ? el.positions : el.capacity
            return (
              <div>
                <label className={LABEL_CLASS}>
                  Assigned ({occupants.length} / {capacity})
                </label>
                {occupants.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {occupants.map((empId) => (
                      <AssigneeRow
                        key={empId}
                        employee={employees[empId]}
                        fallbackId={empId}
                        canEdit={canEdit}
                        onClear={() => unassignEmployee(empId)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5">
                    No one assigned
                  </div>
                )}
              </div>
            )
          })()}

          <DeskIdInput elementId={el.id} value={el.deskId} disabled={lockedDisabled} />
          <SeatStatusOverridePicker elementId={el.id} value={el.seatStatus} disabled={lockedDisabled} />

          {isDeskElement(el) && !el.assignedEmployeeId && (
            <div>
              <label className={LABEL_CLASS}>Assigned To</label>
              <div className="text-sm text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5">
                No one assigned
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Conference room properties */}
      {isConferenceRoomElement(el) && (
        <Section title="Room">
          <div>
            <label className={LABEL_CLASS}>Room name</label>
            <input
              className={INPUT_CLASS}
              value={el.roomName}
              disabled={lockedDisabled}
              onChange={(e) => update({ roomName: e.target.value } as Partial<ConferenceRoomElement>)}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Capacity</label>
            <input
              type="number"
              className={`${INPUT_CLASS} tabular-nums`}
              value={el.capacity}
              min={1}
              max={100}
              disabled={lockedDisabled}
              onChange={(e) => update({ capacity: Number(e.target.value) } as Partial<ConferenceRoomElement>)}
            />
          </div>
        </Section>
      )}

      {/* Common area properties */}
      {isCommonAreaElement(el) && (
        <Section title="Area">
          <div>
            <label className={LABEL_CLASS}>Area name</label>
            <input
              className={INPUT_CLASS}
              value={el.areaName}
              disabled={lockedDisabled}
              onChange={(e) => update({ areaName: e.target.value } as Partial<CommonAreaElement>)}
            />
          </div>
        </Section>
      )}

      {/* IT/AV/Network/Power layer (M2).
          Each device type renders its own section in the type-specific
          slot of the standardised layout. The Identity / Layout /
          Appearance / Actions wrappers are shared with every other
          element type — only the fields between them vary. Field
          ordering is intentional: physical-identity (model, serial,
          MAC, IP, vendor) → operational (install date, status). The
          status select uses the same five options for every device so
          a future "show all broken devices" report has a single
          discriminant to filter on. */}
      {isAccessPointElement(el) && (
        <Section title="Access point" subtitle="Network device">
          <ITDeviceTextField label="Model" elementId={el.id} value={el.model} field="model" disabled={lockedDisabled} />
          <ITDeviceTextField label="Serial number" elementId={el.id} value={el.serialNumber} field="serialNumber" disabled={lockedDisabled} />
          <ITDeviceTextField label="MAC address" elementId={el.id} value={el.macAddress} field="macAddress" placeholder="aa:bb:cc:dd:ee:ff" disabled={lockedDisabled} />
          <ITDeviceTextField label="IP address" elementId={el.id} value={el.ipAddress} field="ipAddress" placeholder="10.0.0.1" disabled={lockedDisabled} />
          <ITDeviceTextField label="Vendor" elementId={el.id} value={el.vendor} field="vendor" disabled={lockedDisabled} />
          <ITDeviceDateField elementId={el.id} value={el.installDate} disabled={lockedDisabled} />
          <ITDeviceStatusField elementId={el.id} value={el.deviceStatus} disabled={lockedDisabled} />
        </Section>
      )}

      {isNetworkJackElement(el) && (
        <Section title="Network jack" subtitle="Network device">
          <ITDeviceTextField label="Jack ID" elementId={el.id} value={el.jackId} field="jackId" placeholder="J-101" disabled={lockedDisabled} />
          <div>
            <label className={LABEL_CLASS}>Cable category</label>
            <select
              aria-label="Cable category"
              className={INPUT_CLASS}
              value={el.cableCategory ?? ''}
              disabled={lockedDisabled}
              onChange={(e) =>
                update({ cableCategory: (e.target.value || null) as NetworkJackElement['cableCategory'] } as Partial<NetworkJackElement>)
              }
            >
              <option value="">—</option>
              <option value="cat5e">Cat5e</option>
              <option value="cat6">Cat6</option>
              <option value="cat6a">Cat6a</option>
              <option value="cat7">Cat7</option>
              <option value="fiber">Fiber</option>
            </select>
          </div>
          <ITDeviceTextField label="Upstream switch" elementId={el.id} value={el.upstreamSwitchLabel} field="upstreamSwitchLabel" placeholder="Switch-1F-A" disabled={lockedDisabled} />
          <ITDeviceTextField label="Switch port" elementId={el.id} value={el.upstreamSwitchPort} field="upstreamSwitchPort" placeholder="Gi1/0/12" disabled={lockedDisabled} />
          <ITDeviceTextField label="Serial number" elementId={el.id} value={el.serialNumber} field="serialNumber" disabled={lockedDisabled} />
          <ITDeviceDateField elementId={el.id} value={el.installDate} disabled={lockedDisabled} />
          <ITDeviceStatusField elementId={el.id} value={el.deviceStatus} disabled={lockedDisabled} />
        </Section>
      )}

      {isDisplayElement(el) && (
        <Section title="Display" subtitle="AV device">
          <ITDeviceTextField label="Model" elementId={el.id} value={el.model} field="model" disabled={lockedDisabled} />
          <ITDeviceTextField label="Serial number" elementId={el.id} value={el.serialNumber} field="serialNumber" disabled={lockedDisabled} />
          <ITDeviceTextField label="IP address" elementId={el.id} value={el.ipAddress} field="ipAddress" placeholder="10.0.0.1" disabled={lockedDisabled} />
          <ITDeviceTextField label="Vendor" elementId={el.id} value={el.vendor} field="vendor" disabled={lockedDisabled} />
          <div>
            <label className={LABEL_CLASS}>Screen size (in)</label>
            <input
              type="number"
              min={10}
              max={120}
              step={1}
              className={`${INPUT_CLASS} tabular-nums`}
              value={el.screenSizeInches ?? ''}
              disabled={lockedDisabled}
              onChange={(e) => {
                const raw = e.target.value
                const num = raw === '' ? null : Number(raw)
                update({
                  screenSizeInches: num === null || Number.isNaN(num) ? null : num,
                } as Partial<DisplayElement>)
              }}
            />
          </div>
          <ITDeviceTextField label="Connected device" elementId={el.id} value={el.connectedDevice} field="connectedDevice" placeholder="MTR Logitech Rally" disabled={lockedDisabled} />
          <ITDeviceDateField elementId={el.id} value={el.installDate} disabled={lockedDisabled} />
          <ITDeviceStatusField elementId={el.id} value={el.deviceStatus} disabled={lockedDisabled} />
        </Section>
      )}

      {isVideoBarElement(el) && (
        <Section title="Video bar" subtitle="AV device">
          <ITDeviceTextField label="Model" elementId={el.id} value={el.model} field="model" disabled={lockedDisabled} />
          <ITDeviceTextField label="Serial number" elementId={el.id} value={el.serialNumber} field="serialNumber" disabled={lockedDisabled} />
          <ITDeviceTextField label="MAC address" elementId={el.id} value={el.macAddress} field="macAddress" placeholder="aa:bb:cc:dd:ee:ff" disabled={lockedDisabled} />
          <ITDeviceTextField label="IP address" elementId={el.id} value={el.ipAddress} field="ipAddress" placeholder="10.0.0.1" disabled={lockedDisabled} />
          <ITDeviceTextField label="Vendor" elementId={el.id} value={el.vendor} field="vendor" disabled={lockedDisabled} />
          <div>
            <label className={LABEL_CLASS}>Platform</label>
            <select
              aria-label="Platform"
              className={INPUT_CLASS}
              value={el.platform ?? ''}
              disabled={lockedDisabled}
              onChange={(e) =>
                update({ platform: (e.target.value || null) as VideoBarElement['platform'] } as Partial<VideoBarElement>)
              }
            >
              <option value="">—</option>
              <option value="teams">Microsoft Teams</option>
              <option value="zoom">Zoom</option>
              <option value="meet">Google Meet</option>
              <option value="webex">Webex</option>
              <option value="other">Other</option>
            </select>
          </div>
          <ITDeviceDateField elementId={el.id} value={el.installDate} disabled={lockedDisabled} />
          <ITDeviceStatusField elementId={el.id} value={el.deviceStatus} disabled={lockedDisabled} />
        </Section>
      )}

      {isBadgeReaderElement(el) && (
        <Section title="Badge reader" subtitle="Security device">
          <ITDeviceTextField label="Model" elementId={el.id} value={el.model} field="model" disabled={lockedDisabled} />
          <ITDeviceTextField label="Serial number" elementId={el.id} value={el.serialNumber} field="serialNumber" disabled={lockedDisabled} />
          <ITDeviceTextField label="IP address" elementId={el.id} value={el.ipAddress} field="ipAddress" placeholder="10.0.0.1" disabled={lockedDisabled} />
          <ITDeviceTextField label="Vendor" elementId={el.id} value={el.vendor} field="vendor" disabled={lockedDisabled} />
          <ITDeviceTextField label="Controls door" elementId={el.id} value={el.controlsDoorLabel} field="controlsDoorLabel" placeholder="Main entrance" disabled={lockedDisabled} />
          <ITDeviceDateField elementId={el.id} value={el.installDate} disabled={lockedDisabled} />
          <ITDeviceStatusField elementId={el.id} value={el.deviceStatus} disabled={lockedDisabled} />
        </Section>
      )}

      {isOutletElement(el) && (
        <Section title="Outlet" subtitle="Power device">
          <div>
            <label className={LABEL_CLASS}>Outlet type</label>
            <select
              aria-label="Outlet type"
              className={INPUT_CLASS}
              value={el.outletType ?? ''}
              disabled={lockedDisabled}
              onChange={(e) =>
                update({ outletType: (e.target.value || null) as OutletElement['outletType'] } as Partial<OutletElement>)
              }
            >
              <option value="">—</option>
              <option value="duplex">Duplex</option>
              <option value="quad">Quad</option>
              <option value="usb-combo">USB combo</option>
              <option value="floor-box">Floor box</option>
              <option value="poke-through">Poke-through</option>
              <option value="l5-20">L5-20 (20A)</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Voltage (V)</label>
            <input
              type="number"
              min={0}
              max={600}
              step={1}
              className={`${INPUT_CLASS} tabular-nums`}
              value={el.voltage ?? ''}
              disabled={lockedDisabled}
              onChange={(e) => {
                const raw = e.target.value
                const num = raw === '' ? null : Number(raw)
                update({
                  voltage: num === null || Number.isNaN(num) ? null : num,
                } as Partial<OutletElement>)
              }}
            />
          </div>
          <ITDeviceTextField label="Circuit" elementId={el.id} value={el.circuit} field="circuit" placeholder="Panel A · Breaker 12" disabled={lockedDisabled} />
          <ITDeviceDateField elementId={el.id} value={el.installDate} disabled={lockedDisabled} />
          <ITDeviceStatusField elementId={el.id} value={el.deviceStatus} disabled={lockedDisabled} />
        </Section>
      )}

      <Section title="Actions">
        {/* Lock toggle is also in the header; keeping it here too means the
            user doesn't need to scroll-to-top to flip it after editing. */}
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
          <input
            type="checkbox"
            checked={el.locked}
            disabled={inputDisabled}
            onChange={(e) => update({ locked: e.target.checked })}
            className="rounded"
          />
          Locked
        </label>

        {canViewHistory &&
          (isDeskElement(el) || isWorkstationElement(el) || isPrivateOfficeElement(el)) && (
            <button
              type="button"
              onClick={() => setHistoryTargetId(el.id)}
              className="w-full px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors inline-flex items-center justify-center gap-1.5"
              data-testid="properties-history-button"
            >
              <History size={14} aria-hidden="true" /> History
            </button>
          )}

        {canEdit && selectedIds.length >= 1 && (
          <button
            type="button"
            onClick={() => {
              deleteElements(selectedIds)
              useUIStore.getState().clearSelection()
            }}
            className="w-full px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
          >
            {selectedIds.length === 1 ? 'Delete element' : `Delete ${selectedIds.length} elements`}
          </button>
        )}
      </Section>

      {historyTargetId && (
        <SeatHistoryDrawer
          target={{ kind: 'seat', seatId: historyTargetId }}
          onClose={() => setHistoryTargetId(null)}
        />
      )}
    </div>
  )
}
