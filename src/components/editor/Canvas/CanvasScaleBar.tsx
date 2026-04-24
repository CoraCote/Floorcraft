import { useCanvasStore } from '../../../stores/canvasStore'
import { useUIStore } from '../../../stores/uiStore'
import { computeScaleBar } from '../../../lib/exportChrome'

/**
 * Floating scale bar pinned to the bottom-left of the canvas. Reads the
 * project's calibrated `scale`/`scaleUnit` from `useCanvasStore.settings`
 * and the current zoom from `stageScale`, then defers to the same
 * `computeScaleBar` helper the PNG/PDF exports use so the live affordance
 * stays visually consistent with what an architect sees in a download.
 *
 * Hidden when the project is uncalibrated (`scaleUnit === 'px'`) and in
 * presentation mode — neither audience benefits from the noise. Not
 * interactive; the existing StatusBar "Set scale" chip is still the way to
 * (re-)calibrate.
 */
export function CanvasScaleBar() {
  const presentationMode = useUIStore((s) => s.presentationMode)
  const stageScale = useCanvasStore((s) => s.stageScale)
  const unitScale = useCanvasStore((s) => s.settings.scale)
  const scaleUnit = useCanvasStore((s) => s.settings.scaleUnit)

  if (presentationMode) return null
  if (!unitScale || unitScale <= 0) return null
  if (scaleUnit === 'px') return null

  // Effective on-screen pixels per real-world unit, given current zoom.
  const effectivePxPerUnit = unitScale * stageScale
  if (!isFinite(effectivePxPerUnit) || effectivePxPerUnit <= 0) return null

  const bar = computeScaleBar(
    effectivePxPerUnit,
    scaleUnit as 'ft' | 'm' | 'in' | 'cm',
  )

  return (
    <div
      data-testid="canvas-scale-bar"
      className="absolute bottom-12 left-4 z-20 flex flex-col items-start pointer-events-none select-none"
      aria-label={`Scale bar: ${bar.label}`}
    >
      <div className="flex items-center gap-1">
        <div className="h-2 w-px bg-gray-700 dark:bg-gray-300" />
        <div
          data-testid="canvas-scale-bar-rule"
          className="h-1.5 bg-gray-700 dark:bg-gray-300"
          style={{ width: `${bar.pxLength}px` }}
        />
        <div className="h-2 w-px bg-gray-700 dark:bg-gray-300" />
      </div>
      <div className="mt-1 px-1.5 py-0.5 rounded bg-white/80 dark:bg-gray-900/80 backdrop-blur border border-gray-200 dark:border-gray-800 text-[10px] font-semibold tabular-nums text-gray-700 dark:text-gray-200">
        {bar.label}
      </div>
    </div>
  )
}
