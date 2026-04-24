import { useEffect, useRef, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { useAnnotationsStore } from '../../../stores/annotationsStore'
import { useCan } from '../../../hooks/useCan'
import { useProjectStore } from '../../../stores/projectStore'
import { useSession } from '../../../lib/auth/session'
import { ANNOTATION_BODY_MAX, type Annotation } from '../../../types/annotations'

/**
 * DOM overlay (not Konva) that handles both:
 *   - "view / resolve / edit" an existing annotation (when
 *     `activeAnnotationId` is set), and
 *   - "create a new annotation" (when `draft` is set, typically from a
 *     pin-tool click on empty canvas).
 *
 * Only one of those is ever open at a time — we reflect that by
 * splitting into two small inner bodies that each assume their own
 * opened-state precondition. That also sidesteps the lint rule against
 * setState-in-effect by letting each body own its own local text state,
 * unconditionally initialised from props at mount.
 *
 * Wave 11C — visual polish to match the JSON-Crack/Linear aesthetic used
 * by FileMenu, ContextMenu, and PropertiesPanel: thin sticky header with
 * a type icon and close affordance, uppercase section labels, shared
 * input/button idioms, dark-mode classes, focus trap, and Esc/Enter
 * keyboard polish.
 */
interface Props {
  /** Canvas container (same ref CanvasStage uses) for screen-space math. */
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function AnnotationPopover({ containerRef }: Props) {
  const activeAnnotationId = useAnnotationsStore((s) => s.activeAnnotationId)
  const draft = useAnnotationsStore((s) => s.draft)
  // Read both permissions unconditionally so the hook call order stays
  // stable — `useCan('a') || useCan('b')` would short-circuit the second
  // call and violate the rules-of-hooks.
  const canEditRoster = useCan('editRoster')
  const canEditMap = useCan('editMap')
  const canEdit = canEditRoster || canEditMap

  if (draft) {
    return (
      <CreatePopover
        containerRef={containerRef}
        canEdit={canEdit}
        // key forces a fresh body state whenever the draft changes.
        key={`draft-${draft.screenX}-${draft.screenY}`}
      />
    )
  }
  if (activeAnnotationId) {
    return (
      <ViewPopover
        containerRef={containerRef}
        canEdit={canEdit}
        key={`view-${activeAnnotationId}`}
      />
    )
  }
  return null
}

/**
 * Utility: derive a human display name from the session email. We don't
 * have a user-directory field on `AuthUser`, so fall back to the local
 * part of the email ("jane.doe" from "jane.doe@example.com"). When the
 * user is unauthenticated (share-link viewer), we use "Anonymous" —
 * viewers can't actually create annotations, so this is a safety default.
 */
function useAuthorName(): string {
  const session = useSession()
  const impersonated = useProjectStore((s) => s.impersonatedRole)
  if (session.status !== 'authenticated') return 'Anonymous'
  const email = session.user.email || ''
  const local = email.includes('@') ? email.slice(0, email.indexOf('@')) : email
  // If the owner is previewing as a lower role, mark the author so the
  // audit trail reflects intent.
  return impersonated ? `${local} (as ${impersonated})` : local || 'Unknown'
}

/**
 * Shared screen-space anchor math. Works in CSS pixels relative to the
 * viewport so the popover can render `position: fixed`.
 *
 * We read the container rect during render rather than from a
 * `useEffect` — React Compiler's `set-state-in-effect` rule forbids the
 * effect-based version, and the container div is mounted by the parent
 * before the popover is ever rendered, so the ref is populated when this
 * hook runs. If the ref is somehow null we fall back to (0,0), which
 * renders off-screen but avoids crashes.
 */
function usePopoverPosition(
  containerRef: React.RefObject<HTMLDivElement | null>,
  screenX: number,
  screenY: number,
): { left: number; top: number } {
  // Reading the canvas container rect during render is the simplest path
  // — the container is always mounted before any popover opens, and the
  // popover itself is keyed on a stable change (draft anchor / active
  // annotation id) so it re-measures when we want it to.
  // eslint-disable-next-line react-hooks/refs
  const rect = containerRef.current?.getBoundingClientRect()
  if (!rect) return { left: 0, top: 0 }
  // Shift the popover slightly down-right of the anchor so the pin
  // itself remains visible under the open popover edge.
  return { left: rect.left + screenX + 12, top: rect.top + screenY + 12 }
}

interface InnerProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  canEdit: boolean
}

/**
 * Shared visual constants — kept aligned with PropertiesPanel's idiom so
 * the popover slots into the editor chrome without drifting. We don't
 * import PropertiesPanel's local constants (they aren't exported); we
 * just match the visual rhythm.
 */
const SECTION_LABEL_CLASS =
  'text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400'
const TEXTAREA_CLASS =
  'w-full text-xs border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 ' +
  'focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 ' +
  'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-y'
const PRIMARY_BTN_CLASS =
  'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed ' +
  'text-white px-3 py-1.5 text-xs rounded focus:outline-none focus:ring-2 focus:ring-blue-400'
const SECONDARY_BTN_CLASS =
  'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 ' +
  'text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 ' +
  'px-3 py-1.5 text-xs rounded focus:outline-none focus:ring-2 focus:ring-blue-400'
const DELETE_BTN_CLASS =
  'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 ' +
  'px-3 py-1.5 text-xs rounded focus:outline-none focus:ring-2 focus:ring-red-400'
const POPOVER_SHELL_CLASS =
  'rounded-lg shadow-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-xs'

/**
 * Trap focus inside the popover while it's open so Tab cycles through
 * inputs and buttons rather than escaping into the canvas behind it.
 * Returns nothing — wires up a keydown listener scoped to the popover
 * root via the supplied ref.
 */
function useFocusTrap(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const node = rootRef.current
      if (!node) return
      const focusables = node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (active === first || !node.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    root.addEventListener('keydown', onKey)
    return () => root.removeEventListener('keydown', onKey)
  }, [rootRef])
}

/**
 * Sticky header used by both Create and View popovers. Type icon +
 * uppercase type-name label + close button, hairline divider below.
 */
function PopoverHeader({
  titleId,
  label,
  onClose,
}: {
  titleId: string
  label: string
  onClose: () => void
}) {
  return (
    <div className="sticky top-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-t-lg">
      <MessageCircle
        size={14}
        aria-hidden="true"
        className="text-gray-500 dark:text-gray-400 flex-shrink-0"
      />
      <span id={titleId} className={`${SECTION_LABEL_CLASS} flex-1 truncate`}>
        {label}
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close annotation editor"
        className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

function CreatePopover({ containerRef, canEdit }: InnerProps) {
  const draft = useAnnotationsStore((s) => s.draft)
  const addAnnotation = useAnnotationsStore((s) => s.addAnnotation)
  const setDraft = useAnnotationsStore((s) => s.setDraft)
  const authorName = useAuthorName()
  const pos = usePopoverPosition(
    containerRef,
    draft?.screenX ?? 0,
    draft?.screenY ?? 0,
  )
  const [body, setBody] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const titleId = 'annotation-popover-title-create'

  useEffect(() => {
    const raf = requestAnimationFrame(() => textareaRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [])

  useFocusTrap(rootRef)

  if (!draft) return null
  if (!canEdit) {
    // Shouldn't happen — CanvasStage gates the pin-tool click on
    // editMap||editRoster — but fail closed anyway so a test harness
    // that poked at the store directly can't bypass permissions.
    return null
  }

  const save = () => {
    const trimmed = body.trim()
    if (!trimmed) {
      setDraft(null)
      return
    }
    addAnnotation({
      body: trimmed,
      authorName,
      anchor: draft.anchor,
    })
    setDraft(null)
  }
  const cancel = () => setDraft(null)

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={POPOVER_SHELL_CLASS}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: 280,
        zIndex: 30,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          cancel()
        }
      }}
    >
      <PopoverHeader titleId={titleId} label="New annotation" onClose={cancel} />
      <div className="flex flex-col gap-3 px-3 py-3">
        <section className="flex flex-col gap-1.5">
          <h3 className={SECTION_LABEL_CLASS}>Content</h3>
          <textarea
            ref={textareaRef}
            value={body}
            maxLength={ANNOTATION_BODY_MAX}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                cancel()
              } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                save()
              }
            }}
            placeholder="Add a note (max 280 chars)…"
            className={`${TEXTAREA_CLASS} min-h-[72px]`}
          />
          <div className="flex justify-end">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
              {body.length}/{ANNOTATION_BODY_MAX}
            </span>
          </div>
        </section>
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
          <div />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancel}
              className={SECONDARY_BTN_CLASS}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={body.trim().length === 0}
              className={PRIMARY_BTN_CLASS}
            >
              Save
            </button>
          </div>
        </div>
        <div className="text-[10px] text-gray-400 dark:text-gray-500 -mt-1">
          Esc to close · Enter to save · Shift+Enter for newline
        </div>
      </div>
    </div>
  )
}

function ViewPopover({ containerRef, canEdit }: InnerProps) {
  const activeId = useAnnotationsStore((s) => s.activeAnnotationId)
  const entry = useAnnotationsStore((s) =>
    activeId ? s.annotations[activeId] : null,
  )

  if (!entry) return null

  // Mount a fresh body keyed on the entry id so `draftBody` can initialize
  // from `entry.body` directly (via a `useState` initializer) instead of
  // syncing via an effect — React Compiler rejects set-state-in-effect.
  return (
    <ViewPopoverBody
      key={entry.id}
      entry={entry}
      containerRef={containerRef}
      canEdit={canEdit}
    />
  )
}

function ViewPopoverBody({
  entry,
  containerRef,
  canEdit,
}: InnerProps & { entry: Annotation }) {
  const setActive = useAnnotationsStore((s) => s.setActiveAnnotationId)
  const setResolved = useAnnotationsStore((s) => s.setResolved)
  const updateBody = useAnnotationsStore((s) => s.updateAnnotationBody)
  const removeAnnotation = useAnnotationsStore((s) => s.removeAnnotation)

  // Screen-space position isn't known when opened from the canvas
  // (pin click stores it in transient state separate from the popover
  // — we fall back to center of the screen if missing).
  const popoverAnchor = useAnnotationsStore((s) => s.draft) // unused; anchor-independent
  const [editMode, setEditMode] = useState(false)
  // Seed the draft directly from the entry body. The component is keyed on
  // `entry.id` by the gate so a different entry remounts with a fresh draft.
  const [draftBody, setDraftBody] = useState(entry.body)
  const rootRef = useRef<HTMLDivElement>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const titleId = `annotation-popover-title-${entry.id}`

  // Read the last known screen-space anchor during render. `getLastPinAnchor`
  // is a module-level ref populated by the layer's onPinClick. If there's
  // no anchor (e.g. the popover opened from the side panel), we center the
  // popover in the viewport as a fallback. Reading the rect in render
  // avoids the `react-hooks/set-state-in-effect` lint error and is safe
  // because the canvas container is always mounted before this popover.
  const pos = (() => {
    if (typeof window === 'undefined') return { left: 0, top: 0 }
    // Same rationale as `usePopoverPosition` — the canvas container is
    // already mounted when this popover body renders, so reading its rect
    // in render is safe. The body is keyed on `entry.id` by the gate, so
    // it remeasures when the active annotation changes.
    // eslint-disable-next-line react-hooks/refs
    const rect = containerRef.current?.getBoundingClientRect()
    const anchor = getLastPinAnchor()
    if (rect && anchor) {
      return { left: rect.left + anchor.x + 12, top: rect.top + anchor.y + 12 }
    }
    return { left: window.innerWidth / 2 - 140, top: window.innerHeight / 2 - 80 }
  })()
  // Suppress unused-var: kept for future extension where draft anchor
  // might also inform view positioning.
  void popoverAnchor

  useFocusTrap(rootRef)

  // When entering edit mode, hand focus to the textarea so the user can
  // start typing immediately. Mirrors CreatePopover's auto-focus behavior.
  useEffect(() => {
    if (!editMode) return
    const raf = requestAnimationFrame(() => editTextareaRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [editMode])

  const close = () => {
    setActive(null)
    setEditMode(false)
  }

  const toggleResolve = () => {
    setResolved(entry.id, entry.resolvedAt ? null : new Date().toISOString())
    close()
  }

  const commitEdit = () => {
    const t = draftBody.trim()
    if (!t) {
      // Empty body on edit → treat as delete, matching how most
      // sticky-note UIs behave when the user clears the text.
      removeAnnotation(entry.id)
      close()
      return
    }
    updateBody(entry.id, t)
    setEditMode(false)
  }

  const onDelete = () => {
    removeAnnotation(entry.id)
    close()
  }

  const createdAtLabel = formatCreatedAt(entry.createdAt)
  const headerLabel = entry.resolvedAt ? 'Resolved annotation' : 'Annotation'

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={POPOVER_SHELL_CLASS}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: 300,
        zIndex: 30,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          // In edit mode, Escape reverts the draft; otherwise it closes.
          if (editMode) {
            e.preventDefault()
            setEditMode(false)
            setDraftBody(entry.body)
          } else {
            e.preventDefault()
            close()
          }
        }
      }}
    >
      <PopoverHeader titleId={titleId} label={headerLabel} onClose={close} />

      <div className="flex flex-col gap-3 px-3 py-3">
        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <h3 className={SECTION_LABEL_CLASS}>Content</h3>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {createdAtLabel}
            </span>
          </div>
          {editMode && canEdit ? (
            <>
              <textarea
                ref={editTextareaRef}
                value={draftBody}
                maxLength={ANNOTATION_BODY_MAX}
                onChange={(e) => setDraftBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    commitEdit()
                  }
                }}
                className={`${TEXTAREA_CLASS} min-h-[72px]`}
              />
              <div className="flex justify-end">
                <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                  {draftBody.length}/{ANNOTATION_BODY_MAX}
                </span>
              </div>
            </>
          ) : (
            <div
              className={`whitespace-pre-wrap leading-snug ${
                entry.resolvedAt
                  ? 'text-gray-400 dark:text-gray-500 line-through'
                  : 'text-gray-900 dark:text-gray-100'
              }`}
            >
              {entry.body}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-1">
          <h3 className={SECTION_LABEL_CLASS}>Author</h3>
          <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
            {entry.authorName}
          </span>
        </section>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
          <div>
            {canEdit && !editMode && (
              <button
                type="button"
                onClick={onDelete}
                className={DELETE_BTN_CLASS}
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {editMode ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditMode(false)
                    setDraftBody(entry.body)
                  }}
                  className={SECONDARY_BTN_CLASS}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitEdit}
                  className={PRIMARY_BTN_CLASS}
                >
                  Save
                </button>
              </>
            ) : (
              <>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    className={SECONDARY_BTN_CLASS}
                  >
                    Edit
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={toggleResolve}
                    className={PRIMARY_BTN_CLASS}
                  >
                    {entry.resolvedAt ? 'Reopen' : 'Resolve'}
                  </button>
                )}
                {!canEdit && (
                  <button
                    type="button"
                    onClick={close}
                    className={SECONDARY_BTN_CLASS}
                  >
                    Close
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <div className="text-[10px] text-gray-400 dark:text-gray-500 -mt-1">
          {editMode
            ? 'Esc to cancel · Enter to save · Shift+Enter for newline'
            : 'Esc to close'}
        </div>
      </div>
    </div>
  )
}

function formatCreatedAt(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t)
  // Short friendly label — trimming precision to "Apr 24" + time makes
  // scanning a list of pins readable without overwhelming the card.
  return d.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * The pin click handler in `AnnotationLayer` reports the screen-space
 * pointer position. We need that in `ViewPopover` for placement but
 * don't want to round-trip through zustand (which would cause a
 * second render of the whole editor tree). A tiny module-level cache
 * lets the layer hand the coords directly to the popover.
 */
let lastPinAnchor: { x: number; y: number } | null = null
// eslint-disable-next-line react-refresh/only-export-components
export function setLastPinAnchor(a: { x: number; y: number } | null): void {
  lastPinAnchor = a
}
// eslint-disable-next-line react-refresh/only-export-components
export function getLastPinAnchor(): { x: number; y: number } | null {
  return lastPinAnchor
}
