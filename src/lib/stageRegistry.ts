import type Konva from 'konva'

// Module-level registry for the active Konva stage instance. We need this
// because export features (PDF, PNG) live outside the canvas component tree
// (e.g. inside a modal dialog), but they need a live reference to the Konva
// stage to call `stage.toDataURL()`. React context would also work, but the
// stage ref changes across view mounts (MAP vs ROSTER) and we want a cheap
// read from any component without threading context through every provider.
//
// `CanvasStage` calls `setActiveStage(stage)` on mount + `setActiveStage(null)`
// on unmount. Consumers (export dialog, PDF button) call `getActiveStage()`
// and gracefully handle `null` (canvas not mounted).

let activeStage: Konva.Stage | null = null

export function setActiveStage(stage: Konva.Stage | null): void {
  activeStage = stage
}

export function getActiveStage(): Konva.Stage | null {
  return activeStage
}
