import { useState } from 'react'
import { useElementsStore } from '../../../stores/elementsStore'
import { useFloorStore } from '../../../stores/floorStore'
import { useNeighborhoodStore } from '../../../stores/neighborhoodStore'

const DISMISS_KEY = 'emptyCanvasHintDismissed'

function readInitialDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * First-run hint rendered as a DOM overlay above the Konva canvas.
 * Shown when the active floor has no elements AND no neighborhoods,
 * AND the user hasn't already dismissed it on this device.
 *
 * Lives as a sibling of the Stage in CanvasStage so it can use
 * `pointer-events-none` on the wrapper and `pointer-events-auto` on
 * the card — operators can still click through the empty area to the
 * canvas while the callout itself stays interactive for its "Got it"
 * dismissal.
 */
export function EmptyCanvasHint() {
  const [dismissed, setDismissed] = useState<boolean>(() => readInitialDismissed())

  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const elementsCount = useElementsStore((s) => Object.keys(s.elements).length)
  const neighborhoodsCount = useNeighborhoodStore((s) => {
    let n = 0
    for (const nb of Object.values(s.neighborhoods)) {
      if (nb.floorId === activeFloorId) n++
    }
    return n
  })

  if (dismissed) return null
  if (elementsCount > 0 || neighborhoodsCount > 0) return null

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // localStorage write can fail (private mode, quota); the hint
      // still hides for this session via component state.
    }
    setDismissed(true)
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div
        className="bg-white/95 backdrop-blur rounded-lg shadow-lg border border-gray-200 p-6 max-w-xs text-sm text-gray-700 pointer-events-auto"
        role="note"
      >
        <div className="font-medium text-gray-900 mb-3">Start by adding something</div>
        <ul className="space-y-1.5 mb-4 list-disc pl-5">
          <li>Drag a desk from the left sidebar →</li>
          <li>
            or press <kbd className="px-1 py-0.5 text-[11px] font-mono bg-gray-100 border border-gray-300 rounded">W</kbd> to draw a wall
          </li>
        </ul>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
