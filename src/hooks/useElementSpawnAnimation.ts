import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/prefersReducedMotion'

/**
 * Spawn-animation tracker for canvas elements. When an element id appears
 * for the first time since the module loaded, we register a "start time"
 * and drive a short fade-in + scale-up via requestAnimationFrame. The
 * effect is decorative — kept subtle so the editor doesn't feel toy-like —
 * and exists purely so users get a tiny bit of "I just did a thing" feedback
 * when they create / paste / import / template-apply elements.
 *
 * Why a module-level Map (not state)?
 *
 * The store is mutated frequently (drag, resize, undo/redo); if the
 * "already animated" set lived in component state every drop event would
 * thrash a setState across hundreds of children. A module-level Map gives
 * us O(1) lookup, survives renderer re-mounts within the same SPA session,
 * and is shared across every consumer of the hook. We DO NOT persist it
 * across full page reloads — that's deliberate, since on cold load we seed
 * the set from the live store snapshot (see `seedFromInitial` below) so a
 * re-opened project doesn't animate every existing element.
 *
 * Stagger
 *
 * If many elements register on the same animation frame (CSV import,
 * template apply, paste), each one's start gets pushed back by
 * `STAGGER_MS * positionInBatch`. This prevents the canvas from going
 * completely white on a 200-employee CSV import while still preserving
 * the "wave of activity" feel. Beyond `STAGGER_CAP` the offset is clamped
 * to STAGGER_CAP * STAGGER_MS — past that point further elements skip
 * the animation entirely and just appear, so the main thread isn't
 * dragged for the long tail.
 *
 * Undo/redo idempotence
 *
 * The set tracks ids that have already animated, so undoing then redoing
 * a creation does NOT re-trigger the animation: the id is already in
 * `animatedIds`. This matches user expectation — undo/redo is "navigation
 * through history", not a fresh creation event.
 */

export interface SpawnAnimationValues {
  opacity: number
  scaleX: number
  scaleY: number
}

const IDENTITY: SpawnAnimationValues = { opacity: 1, scaleX: 1, scaleY: 1 }

export const SPAWN_DURATION_MS = 180
export const STAGGER_MS = 12
export const STAGGER_CAP = 60
const SCALE_FROM = 0.92

/**
 * Module-level state. `animatedIds` records ids that have completed (or
 * are mid-flight on) their spawn animation; `startTimes` records when
 * each in-flight animation began (used by the rAF loop to compute t).
 * `currentBatchTick` and `batchCount` collaborate to assign the stagger
 * index: every register call within the same frame shares a batch tick
 * and gets a monotonically increasing position.
 */
const animatedIds = new Set<string>()
const startTimes = new Map<string, number>()
let batchCount = 0
let batchScheduled = false
let initialSeeded = false

/**
 * Seed the "already animated" set with the ids of every element that
 * existed at first hook call. This means a freshly opened project does
 * NOT animate its existing elements on the first paint — only newly
 * added ones. Idempotent: re-callable, but only does work once per
 * module lifetime. Tests that want a fresh slate call `__resetSpawnAnimationState`.
 */
function seedFromInitial(initialIds: string[]): void {
  if (initialSeeded) return
  for (const id of initialIds) animatedIds.add(id)
  initialSeeded = true
}

function nextStaggerIndex(): number {
  // We treat all hook calls that occur in the same JS task as one
  // "batch" — React commits a tree synchronously, so every new Group
  // mounted by the same setState/store update will call the hook
  // before control returns to the event loop. A queued microtask
  // resets the counter at the end of the task, which is good enough
  // for the import / paste / template-apply paths and doesn't require
  // any timing heuristics.
  if (!batchScheduled) {
    batchScheduled = true
    queueMicrotask(() => {
      batchCount = 0
      batchScheduled = false
    })
  }
  const idx = batchCount
  batchCount += 1
  return idx
}

function easeOutCubic(t: number): number {
  // Decelerating curve — fast at start, soft landing. Keeps the
  // perceived snappiness while still ending smoothly.
  const clamped = Math.max(0, Math.min(1, t))
  const inv = 1 - clamped
  return 1 - inv * inv * inv
}

function computeFrame(elapsed: number, duration: number): SpawnAnimationValues {
  if (elapsed <= 0) return { opacity: 0, scaleX: SCALE_FROM, scaleY: SCALE_FROM }
  if (elapsed >= duration) return IDENTITY
  const t = easeOutCubic(elapsed / duration)
  return {
    opacity: t,
    scaleX: SCALE_FROM + (1 - SCALE_FROM) * t,
    scaleY: SCALE_FROM + (1 - SCALE_FROM) * t,
  }
}

/**
 * Test-only escape hatch: drops the module-level state so each test can
 * start from a clean slate. Not exported from the package's public
 * surface (no index re-export) — the underscore prefix signals
 * "test affordance, do not use from app code".
 */
export function __resetSpawnAnimationState(): void {
  animatedIds.clear()
  startTimes.clear()
  batchCount = 0
  batchScheduled = false
  initialSeeded = false
}

export interface UseSpawnAnimationOptions {
  /**
   * Snapshot of element ids present at first render. Used once to seed
   * the "already animated" set so a project's existing elements don't
   * animate on cold load. Only the FIRST call's value is used; later
   * calls are ignored to keep behaviour stable across renderers that
   * pass slightly different snapshots.
   */
  initialIds?: string[]
  /** Override the spawn duration. Test affordance. */
  durationMs?: number
}

/**
 * Returns the current { opacity, scaleX, scaleY } for an element id.
 *
 * - If reduced-motion is preferred → identity values, always.
 * - If the id was present at first render → identity values, always.
 * - If the id is new → animates 0→1 opacity, 0.92→1 scale over
 *   `durationMs` (default 180ms), staggered by position-in-batch.
 */
export function useElementSpawnAnimation(
  id: string,
  options: UseSpawnAnimationOptions = {},
): SpawnAnimationValues {
  const { initialIds, durationMs = SPAWN_DURATION_MS } = options

  // Seed once. We take the snapshot from the FIRST consumer that supplies
  // it; downstream consumers can omit `initialIds` and the seed sticks.
  if (!initialSeeded && initialIds) {
    seedFromInitial(initialIds)
  } else if (!initialSeeded) {
    // No snapshot supplied AND nothing seeded yet → mark as seeded with
    // an empty set. This keeps behaviour deterministic in unit tests
    // that drive ids directly without an elements store.
    initialSeeded = true
  }

  const reducedMotion = useRef(prefersReducedMotion()).current

  // Decide whether THIS render should animate. We compute the decision
  // synchronously on first render so the very first paint can be at
  // opacity 0 (avoids a one-frame "flash at 1, then drop to 0, then
  // animate up").
  const shouldAnimateRef = useRef<boolean | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const staggerOffsetRef = useRef<number>(0)

  if (shouldAnimateRef.current === null) {
    if (reducedMotion || animatedIds.has(id)) {
      shouldAnimateRef.current = false
      animatedIds.add(id)
    } else {
      const stagger = Math.min(nextStaggerIndex(), STAGGER_CAP)
      if (stagger >= STAGGER_CAP) {
        // Past the cap: skip animation outright so we don't drag the
        // main thread on huge imports.
        shouldAnimateRef.current = false
        animatedIds.add(id)
      } else {
        shouldAnimateRef.current = true
        staggerOffsetRef.current = stagger * STAGGER_MS
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
        startedAtRef.current = now + staggerOffsetRef.current
        startTimes.set(id, startedAtRef.current)
        animatedIds.add(id)
      }
    }
  }

  const [values, setValues] = useState<SpawnAnimationValues>(() => {
    if (!shouldAnimateRef.current) return IDENTITY
    return { opacity: 0, scaleX: SCALE_FROM, scaleY: SCALE_FROM }
  })

  useEffect(() => {
    if (!shouldAnimateRef.current) return
    const startAt = startedAtRef.current
    if (startAt === null) return

    let raf = 0
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const elapsed = now - startAt
      const frame = computeFrame(elapsed, durationMs)
      setValues(frame)
      if (elapsed < durationMs) {
        raf = requestAnimationFrame(tick)
      } else {
        startTimes.delete(id)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
    // We deliberately don't depend on `id` changing — the hook is meant
    // to be used per-element with a stable id. If a consumer swaps the
    // id mid-mount, the current animation cancels and the new id has
    // already been added to `animatedIds` synchronously above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return values
}
