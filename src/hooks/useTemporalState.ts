import { useRef, useSyncExternalStore } from 'react'
import { useElementsStore } from '../stores/elementsStore'

/**
 * Reactively observe zundo's temporal store so components (notably the
 * TopBar undo/redo buttons) can disable themselves when there's nothing
 * to undo/redo. Zundo exposes a vanilla Zustand store at
 * `useElementsStore.temporal`, which doesn't come with a React hook built
 * in — `useSyncExternalStore` is the React-recommended way to bridge.
 *
 * We project both booleans through a single subscription so the two
 * fields always reflect the same temporal snapshot. Two independent
 * `useSyncExternalStore` calls can commit out of order and briefly show a
 * state that never actually existed (e.g. `canUndo` true but `canRedo`
 * stale), which then gets overwritten a tick later — the classic
 * subscription-tearing footgun.
 *
 * The `cacheRef` keeps the returned object's identity stable when neither
 * boolean changed; React uses reference equality to decide whether to
 * re-render, so returning a fresh object every subscription bump would
 * otherwise force unnecessary re-renders of every subscriber.
 */
export function useTemporalState(): { canUndo: boolean; canRedo: boolean } {
  // Seeded to `{ false, false }` which matches the temporal store's actual
  // initial state on mount (zundo starts with empty past/future arrays). A
  // real computation happens on the first `getSnapshot` call below; the
  // seed is only the fallback for `getServerSnapshot` in SSR, so briefly
  // reading it before subscribe wakes up is not a hazard in practice.
  const cacheRef = useRef<{ canUndo: boolean; canRedo: boolean }>({
    canUndo: false,
    canRedo: false,
  })
  return useSyncExternalStore(
    useElementsStore.temporal.subscribe,
    () => {
      const { pastStates, futureStates } = useElementsStore.temporal.getState()
      const canUndo = pastStates.length > 0
      const canRedo = futureStates.length > 0
      const prev = cacheRef.current
      if (prev.canUndo === canUndo && prev.canRedo === canRedo) return prev
      const next = { canUndo, canRedo }
      cacheRef.current = next
      return next
    },
    () => cacheRef.current,
  )
}
