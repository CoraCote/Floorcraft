import { create } from 'zustand'
import { temporal } from 'zundo'
import { nanoid } from 'nanoid'
import { UNDO_LIMIT } from '../lib/constants'
import {
  ANNOTATION_BODY_MAX,
  type Annotation,
  type AnnotationAnchor,
} from '../types/annotations'

/**
 * A pending-create session lives here while the user is filling out the
 * popover. It's kept on the store (rather than as component state on
 * CanvasStage) so the popover component can render as a root-level
 * overlay without prop-drilling a callback into ten deep call sites.
 */
export interface AnnotationDraft {
  anchor: AnnotationAnchor
  /** Screen-space anchor coords (px) — where the popover should render. */
  screenX: number
  screenY: number
}

interface AnnotationsState {
  annotations: Record<string, Annotation>

  /**
   * Id of the annotation whose popover is open (click-to-view). `null`
   * when nothing is open. Not tracked by temporal/partialize — pure UI.
   */
  activeAnnotationId: string | null
  /**
   * In-flight create session. Set by CanvasStage on pin-tool click (or by
   * the element context-menu entry); cleared on save / cancel.
   */
  draft: AnnotationDraft | null

  /**
   * Insert an annotation from pre-built parts. Returns the new id. The
   * caller is expected to provide sanitised inputs (the store trims/
   * truncates the body as a defence in depth, but creation UI enforces
   * the same cap).
   */
  addAnnotation: (params: {
    body: string
    authorName: string
    anchor: AnnotationAnchor
    /** Optional — defaults to `new Date().toISOString()`. Tests pass a stable value. */
    createdAt?: string
  }) => string

  /** Patch the body of an existing annotation. No-op when id is missing. */
  updateAnnotationBody: (id: string, body: string) => void

  /** Toggle between open (null) and resolved (iso timestamp). */
  setResolved: (id: string, resolvedAt: string | null) => void

  removeAnnotation: (id: string) => void

  /** Drop any annotations whose element anchor no longer resolves. */
  pruneOrphans: (validElementIds: Set<string>) => void

  /** Wholesale replace — used by the office loader on hydrate. */
  setAnnotations: (next: Record<string, Annotation>) => void

  clearAll: () => void

  // UI state (transient, not undoable)
  setActiveAnnotationId: (id: string | null) => void
  setDraft: (draft: AnnotationDraft | null) => void
}

function clampBody(body: string): string {
  const trimmed = body.trim()
  return trimmed.length > ANNOTATION_BODY_MAX
    ? trimmed.slice(0, ANNOTATION_BODY_MAX)
    : trimmed
}

/**
 * Annotations store. Wrapped in `temporal` so CRUD participates in the
 * global undo/redo stack alongside `elementsStore` and `neighborhoodStore`.
 *
 * The `partialize` is a straight pick — unlike `elementsStore`, there is
 * no cross-store assignment invariant to strip out before snapshotting.
 * Annotations are self-contained and round-trip cleanly through undo.
 */
export const useAnnotationsStore = create<AnnotationsState>()(
  temporal(
    (set) => ({
      annotations: {},
      activeAnnotationId: null,
      draft: null,

      addAnnotation: ({ body, authorName, anchor, createdAt }) => {
        const id = nanoid()
        const entry: Annotation = {
          id,
          body: clampBody(body),
          authorName,
          createdAt: createdAt ?? new Date().toISOString(),
          resolvedAt: null,
          anchor,
        }
        set((state) => ({
          annotations: { ...state.annotations, [id]: entry },
        }))
        return id
      },

      updateAnnotationBody: (id, body) =>
        set((state) => {
          const existing = state.annotations[id]
          if (!existing) return state
          return {
            annotations: {
              ...state.annotations,
              [id]: { ...existing, body: clampBody(body) },
            },
          }
        }),

      setResolved: (id, resolvedAt) =>
        set((state) => {
          const existing = state.annotations[id]
          if (!existing) return state
          return {
            annotations: {
              ...state.annotations,
              [id]: { ...existing, resolvedAt },
            },
          }
        }),

      removeAnnotation: (id) =>
        set((state) => {
          const rest = { ...state.annotations }
          delete rest[id]
          return { annotations: rest }
        }),

      pruneOrphans: (validElementIds) =>
        set((state) => {
          const next: Record<string, Annotation> = {}
          let changed = false
          for (const [id, a] of Object.entries(state.annotations)) {
            if (
              a.anchor.type === 'element' &&
              !validElementIds.has(a.anchor.elementId)
            ) {
              changed = true
              continue
            }
            next[id] = a
          }
          return changed ? { annotations: next } : state
        }),

      setAnnotations: (next) => set({ annotations: next }),

      clearAll: () =>
        set({ annotations: {}, activeAnnotationId: null, draft: null }),

      setActiveAnnotationId: (id) => set({ activeAnnotationId: id }),
      setDraft: (draft) => set({ draft }),
    }),
    {
      limit: UNDO_LIMIT,
      partialize: (state) => ({ annotations: state.annotations }),
    },
  ),
)
