import { useMemo } from 'react'
import { useElementsStore } from '../../../stores/elementsStore'
import {
  useLayerVisibilityStore,
  LAYER_CATEGORIES,
  type LayerCategory,
} from '../../../stores/layerVisibilityStore'
import { useNeighborhoodStore } from '../../../stores/neighborhoodStore'
import { categoryForElement } from '../../../lib/layerCategory'

const CATEGORY_LABELS: Record<LayerCategory, string> = {
  walls: 'Walls & openings',
  seating: 'Seating',
  rooms: 'Rooms',
  furniture: 'Furniture',
  annotations: 'Annotations',
  neighborhoods: 'Neighborhoods',
}

/**
 * Compact checkbox panel that sits directly under the tool picker in the
 * LeftSidebar. Each row toggles one `LayerCategory` on or off and shows the
 * live count of elements in that category on the active floor.
 *
 * Design notes:
 *   - Counts are computed from the full `elements` map (not a memoized
 *     selector on the store). This is fine because Zustand's shallow
 *     equality rerenders only when the panel's inputs change, and the
 *     reduce is O(elements), which is cheap at the hundreds-of-elements
 *     scale we ship for.
 *   - Category-level visibility is orthogonal to per-element `visible`.
 *     An element is rendered only when BOTH axes say "show", so the count
 *     intentionally includes per-element-hidden items — it represents the
 *     category's population, not the currently-drawn subset.
 *   - Toggling a category does not touch the element-level `visible`
 *     flag, so un-toggling restores the exact previous state.
 */
export function LayerVisibilityPanel() {
  const elements = useElementsStore((s) => s.elements)
  const visible = useLayerVisibilityStore((s) => s.visible)
  const toggle = useLayerVisibilityStore((s) => s.toggle)
  // Neighborhoods live in a sibling store, so they don't come through the
  // `categoryForElement` path. Count them directly for the row badge.
  const neighborhoodCount = useNeighborhoodStore(
    (s) => Object.keys(s.neighborhoods).length,
  )

  const counts = useMemo(() => {
    const c: Record<LayerCategory, number> = {
      walls: 0,
      seating: 0,
      rooms: 0,
      furniture: 0,
      annotations: 0,
      neighborhoods: 0,
    }
    for (const el of Object.values(elements)) {
      c[categoryForElement(el)]++
    }
    c.neighborhoods = neighborhoodCount
    return c
  }, [elements, neighborhoodCount])

  return (
    <div className="p-3" aria-label="Layer visibility">
      <div className="flex flex-col gap-0.5">
        {LAYER_CATEGORIES.map((cat) => {
          const isOn = visible[cat]
          const count = counts[cat]
          return (
            <label
              key={cat}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => toggle(cat)}
                aria-label={`Toggle ${CATEGORY_LABELS[cat]}`}
                className="rounded"
              />
              <span className={isOn ? '' : 'text-gray-400'}>
                {CATEGORY_LABELS[cat]}
              </span>
              <span className="ml-auto text-[11px] text-gray-400 font-mono">
                {count}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
