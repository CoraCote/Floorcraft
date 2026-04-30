import { useSyncExternalStore } from 'react'
import { Group, Image as KonvaImage, Rect } from 'react-konva'
import type { BackgroundImageElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'

interface Props {
  element: BackgroundImageElement
}

/**
 * Renderer for a `background-image` element — used as a tracing
 * underlay for floor plans imported from architectural sources (e.g.
 * a PNG/JPG of a CAD plan).
 *
 * Image loading lives in a module-scope cache and is exposed to React
 * via `useSyncExternalStore`. Two consequences:
 *   1. The same `storageUrl` only triggers one network/decode pass
 *      across every renderer that consumes it (re-mounts after
 *      panning/zooming pay zero cost).
 *   2. No `useEffect` + `setState` pair, so the React 19
 *      `set-state-in-effect` rule has nothing to flag — the renderer
 *      itself is hookless beyond the external-store subscription.
 *
 * Behaviour notes:
 *   - The image element is locked-by-default at insert time so a
 *     stray drag on the canvas doesn't displace the trace target.
 *     Locked elements still render; the lock only stops mutation.
 *   - Opacity defaults to 0.5 when the field is absent (legacy or
 *     freshly inserted) so the underlay reads as faded reference,
 *     not as a foreground photo.
 *   - A subtle dashed outline appears when selected so the operator
 *     can grab handles (resize, move) on what is otherwise a flat
 *     image area.
 */
export function BackgroundImageRenderer({ element }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  const img = useImage(element.storageUrl)

  const w = element.width
  const h = element.height
  const opacity = typeof element.opacity === 'number' ? element.opacity : 0.5

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      {img ? (
        <KonvaImage
          image={img}
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          opacity={opacity}
        />
      ) : (
        // Loading / errored placeholder — a faint dashed rectangle so
        // the user still sees their underlay's footprint while the image
        // resolves (or to debug a broken URL).
        <Rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          fill="rgba(0,0,0,0.02)"
          stroke="rgba(0,0,0,0.2)"
          strokeWidth={1}
          dash={[6, 4]}
        />
      )}
      {isSelected && (
        <Rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          stroke="#0EA5E9"
          strokeWidth={1}
          dash={[4, 3]}
          listening={false}
        />
      )}
    </Group>
  )
}

// ---------------------------------------------------------------------
// Module-scope image cache exposed via useSyncExternalStore.
// ---------------------------------------------------------------------

interface CacheEntry {
  status: 'loading' | 'loaded' | 'error'
  image: HTMLImageElement | null
  subscribers: Set<() => void>
}

const cache = new Map<string, CacheEntry>()

function getOrCreateEntry(src: string): CacheEntry {
  let entry = cache.get(src)
  if (entry) return entry
  entry = { status: 'loading', image: null, subscribers: new Set() }
  cache.set(src, entry)
  const img = new window.Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    entry!.status = 'loaded'
    entry!.image = img
    entry!.subscribers.forEach((cb) => cb())
  }
  img.onerror = () => {
    entry!.status = 'error'
    entry!.image = null
    entry!.subscribers.forEach((cb) => cb())
  }
  img.src = src
  return entry
}

function useImage(src: string | undefined): HTMLImageElement | null {
  // Empty src returns null (renderer falls through to placeholder).
  // Hook order is preserved by passing a stable no-op subscribe.
  const subscribe = (callback: () => void): (() => void) => {
    if (!src) return () => {}
    const entry = getOrCreateEntry(src)
    entry.subscribers.add(callback)
    return () => {
      entry.subscribers.delete(callback)
    }
  }
  const getSnapshot = (): HTMLImageElement | null => {
    if (!src) return null
    return getOrCreateEntry(src).image
  }
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
