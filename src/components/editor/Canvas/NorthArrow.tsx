import { useEffect, useRef, useState } from 'react'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useUIStore } from '../../../stores/uiStore'
import { useCan } from '../../../hooks/useCan'

/**
 * Floating north-arrow compass pinned to the top-left of the canvas.
 * Drag (or arrow-key) to rotate so a floor plan can be aligned with
 * real-world cardinal directions for wayfinding. The rotation lives on
 * `useCanvasStore.settings.northRotation`, defaulting to 0 (N up) for
 * older projects where the field is absent.
 *
 * Hidden in presentation mode. Read-only when the viewer can't edit the
 * map (no `slider` semantics, no drag) — the compass still renders so
 * the orientation is visible, just not adjustable.
 */
export function NorthArrow() {
  const presentationMode = useUIStore((s) => s.presentationMode)
  const northRotation = useCanvasStore((s) => s.settings.northRotation ?? 0)
  const setSettings = useCanvasStore((s) => s.setSettings)
  const canEdit = useCan('editMap')
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  // Drag-to-rotate. We compute the angle from the centre of the compass to
  // the cursor on every pointermove; the visible needle plus the persisted
  // setting both follow in real time. Pointer-capture isn't strictly
  // required since we listen on `window` while dragging, but it keeps the
  // browser cursor consistent across sub-pixel hovers off the element.
  useEffect(() => {
    if (!dragging) return
    const el = ref.current
    if (!el) return

    const handleMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      // atan2 returns radians measured from +x axis. We want degrees from
      // "up" (the visible N direction at rotation 0). Up is -y, so add 90°
      // to align, then normalize to [0, 360).
      const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360
      setSettings({ northRotation: deg })
    }
    const handleUp = () => setDragging(false)

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [dragging, setSettings])

  if (presentationMode) return null

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canEdit) return
    e.preventDefault()
    setDragging(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!canEdit) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      setSettings({ northRotation: (northRotation - 5 + 360) % 360 })
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      setSettings({ northRotation: (northRotation + 5) % 360 })
    } else if (e.key === 'Home') {
      e.preventDefault()
      setSettings({ northRotation: 0 })
    }
  }

  return (
    <div
      ref={ref}
      data-testid="north-arrow"
      className={`absolute top-4 left-4 z-20 w-12 h-12 rounded-full bg-white/90 dark:bg-gray-900/90 backdrop-blur border border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-center ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      aria-label={`North arrow rotated ${Math.round(northRotation)} degrees.${canEdit ? ' Drag or use arrow keys to rotate.' : ''}`}
      role={canEdit ? 'slider' : undefined}
      aria-valuenow={canEdit ? Math.round(northRotation) : undefined}
      aria-valuemin={canEdit ? 0 : undefined}
      aria-valuemax={canEdit ? 360 : undefined}
      tabIndex={canEdit ? 0 : -1}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        style={{ transform: `rotate(${northRotation}deg)` }}
        className="transition-transform"
        aria-hidden
      >
        {/* Red half points to "north"; gray half is the tail. */}
        <polygon
          points="16,3 12,18 16,15 20,18"
          className="fill-red-500"
        />
        <polygon
          points="16,29 12,14 16,17 20,14"
          className="fill-gray-400 dark:fill-gray-500"
        />
        {/* N label rendered inside the SVG so it inherits the rotation
            without manual trig. */}
        <text
          x="16"
          y="9"
          textAnchor="middle"
          className="fill-gray-700 dark:fill-gray-200"
          style={{ fontSize: 7, fontWeight: 700 }}
        >
          N
        </text>
      </svg>
    </div>
  )
}
