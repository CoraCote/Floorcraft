import { useEffect, useRef, useState } from 'react'
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

  useEffect(() => {
    const raf = requestAnimationFrame(() => textareaRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [])

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
      role="dialog"
      aria-label="Create annotation"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: 260,
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        padding: 10,
        zIndex: 30,
        fontSize: 12,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#374151' }}>
        Add annotation
      </div>
      <textarea
        ref={textareaRef}
        value={body}
        maxLength={ANNOTATION_BODY_MAX}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            save()
          }
        }}
        placeholder="Add a note (max 280 chars)…"
        style={{
          width: '100%',
          minHeight: 72,
          padding: 6,
          border: '1px solid #D1D5DB',
          borderRadius: 4,
          fontSize: 12,
          fontFamily: 'inherit',
          resize: 'vertical',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 6,
        }}
      >
        <span style={{ color: '#9CA3AF', fontSize: 10 }}>
          {body.length}/{ANNOTATION_BODY_MAX}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={cancel}
            style={{
              padding: '4px 10px',
              background: '#fff',
              border: '1px solid #D1D5DB',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={body.trim().length === 0}
            style={{
              padding: '4px 10px',
              background: body.trim().length === 0 ? '#93C5FD' : '#2563EB',
              color: '#fff',
              border: 0,
              borderRadius: 4,
              fontSize: 12,
              cursor: body.trim().length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Save
          </button>
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

  const createdAtLabel = formatCreatedAt(entry.createdAt)

  return (
    <div
      role="dialog"
      aria-label="Annotation"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: 280,
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        padding: 10,
        zIndex: 30,
        fontSize: 12,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <span style={{ fontWeight: 600, color: '#374151' }}>
          {entry.authorName}
        </span>
        <span style={{ color: '#9CA3AF', fontSize: 10 }}>{createdAtLabel}</span>
      </div>

      {editMode && canEdit ? (
        <textarea
          value={draftBody}
          maxLength={ANNOTATION_BODY_MAX}
          onChange={(e) => setDraftBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setEditMode(false)
              setDraftBody(entry.body)
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              commitEdit()
            }
          }}
          style={{
            width: '100%',
            minHeight: 72,
            padding: 6,
            border: '1px solid #D1D5DB',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <div
          style={{
            whiteSpace: 'pre-wrap',
            color: entry.resolvedAt ? '#9CA3AF' : '#111827',
            textDecoration: entry.resolvedAt ? 'line-through' : 'none',
            lineHeight: 1.4,
          }}
        >
          {entry.body}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 6,
          marginTop: 8,
        }}
      >
        <button
          type="button"
          onClick={close}
          style={buttonStyle('secondary')}
        >
          Close
        </button>
        {canEdit && !editMode && (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            style={buttonStyle('secondary')}
          >
            Edit
          </button>
        )}
        {canEdit && editMode && (
          <button
            type="button"
            onClick={commitEdit}
            style={buttonStyle('primary')}
          >
            Save
          </button>
        )}
        {canEdit && !editMode && (
          <button
            type="button"
            onClick={toggleResolve}
            style={buttonStyle('primary')}
          >
            {entry.resolvedAt ? 'Reopen' : 'Resolve'}
          </button>
        )}
      </div>
    </div>
  )
}

function buttonStyle(kind: 'primary' | 'secondary'): React.CSSProperties {
  if (kind === 'primary') {
    return {
      padding: '4px 10px',
      background: '#2563EB',
      color: '#fff',
      border: 0,
      borderRadius: 4,
      fontSize: 12,
      cursor: 'pointer',
    }
  }
  return {
    padding: '4px 10px',
    background: '#fff',
    color: '#374151',
    border: '1px solid #D1D5DB',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
  }
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
