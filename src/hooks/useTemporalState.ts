import { useSyncExternalStore } from 'react'
import { useElementsStore } from '../stores/elementsStore'

/**
 * Reactively observe zundo's temporal store so components (notably the
 * TopBar undo/redo buttons) can disable themselves when there's nothing
 * to undo/redo. Zundo exposes a vanilla Zustand store at
 * `useElementsStore.temporal`, which doesn't come with a React hook built
 * in — `useSyncExternalStore` is the React-recommended way to bridge.
 *
 * Only the two booleans are projected to keep re-renders cheap. Reading
 * the raw past/future arrays would force a re-render on every snapshot.
 */
export function useTemporalState(): { canUndo: boolean; canRedo: boolean } {
  const canUndo = useSyncExternalStore(
    useElementsStore.temporal.subscribe,
    () => useElementsStore.temporal.getState().pastStates.length > 0,
    () => false,
  )
  const canRedo = useSyncExternalStore(
    useElementsStore.temporal.subscribe,
    () => useElementsStore.temporal.getState().futureStates.length > 0,
    () => false,
  )
  return { canUndo, canRedo }
}
