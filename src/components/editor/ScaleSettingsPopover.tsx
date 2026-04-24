import { useState, useRef, useEffect } from 'react'
import { useCanvasStore } from '../../stores/canvasStore'
import { LENGTH_UNITS, LENGTH_UNIT_LABELS, LENGTH_UNIT_SUFFIX } from '../../lib/units'

/**
 * Small popover that lets users set the project's measurement scale and
 * unit. Surfaces two controls:
 *
 *   - Scale (a number input): how many real-world units one canvas pixel
 *     represents. `1` = "one canvas unit is one <unit>". Lower values
 *     mean a finer scale; the dimension labels get smaller numbers.
 *   - Unit (a select): which unit those numbers are in.
 *
 * The trigger is a chip showing the current "1 px = N <unit>" summary so
 * it doubles as a status indicator — a user who's never opened the
 * popover can still tell what the canvas is measuring in.
 *
 * Expectations we're leaning on:
 *   - CanvasSettings.scale is a positive number. We clamp the input to
 *     1e-6 to prevent divide-by-zero elsewhere in the codebase.
 *   - scaleUnit is one of the LENGTH_UNITS values. The `<select>` prevents
 *     arbitrary strings from reaching the store.
 */
export function ScaleSettingsPopover() {
  const scale = useCanvasStore((s) => s.settings.scale)
  const scaleUnit = useCanvasStore((s) => s.settings.scaleUnit)
  const setSettings = useCanvasStore((s) => s.setSettings)

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click. Uses `mousedown` so clicks land-on-close
  // beat the popover's click handlers — otherwise an outside click would
  // fire a button that happens to be under the cursor on the next layout.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (rootRef.current.contains(e.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  // Close on Escape so the popover doesn't trap focus.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const summary =
    scaleUnit === 'px'
      ? 'px'
      : `1:${formatScale(scale)} ${LENGTH_UNIT_SUFFIX[scaleUnit]}`

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`text-xs px-2 py-1 rounded border ${
          open
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
        title="Project scale and units"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {summary}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Project scale"
          className="absolute top-full mt-1 right-0 z-40 w-64 bg-white border border-gray-200 rounded-md shadow-lg p-3"
        >
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Measurement
          </h3>

          <label className="block text-xs text-gray-700 mb-1" htmlFor="scale-unit">
            Unit
          </label>
          <select
            id="scale-unit"
            value={scaleUnit}
            onChange={(e) => setSettings({ scaleUnit: e.target.value as typeof LENGTH_UNITS[number] })}
            className="w-full text-sm border border-gray-200 rounded px-2 py-1 mb-3 focus:outline-none focus:border-blue-400"
          >
            {LENGTH_UNITS.map((u) => (
              <option key={u} value={u}>
                {LENGTH_UNIT_LABELS[u]} ({LENGTH_UNIT_SUFFIX[u]})
              </option>
            ))}
          </select>

          <label className="block text-xs text-gray-700 mb-1" htmlFor="scale-value">
            Scale: 1 canvas px ={' '}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="scale-value"
              type="number"
              min={0.000001}
              step="any"
              value={scale}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!Number.isFinite(v) || v <= 0) return
                setSettings({ scale: v })
              }}
              className="w-24 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
              disabled={scaleUnit === 'px'}
            />
            <span className="text-sm text-gray-500">{LENGTH_UNIT_SUFFIX[scaleUnit]}</span>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-gray-500">
            {scaleUnit === 'px'
              ? 'Pixel mode: no real-world conversion. Switch unit to enable scaling.'
              : 'Tip: use the Measure tool (⇧M) and the two-click calibrator to set this from a known distance on an imported floor plan.'}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Trim `scale` for display: if it's an integer, show no decimals; if it's
 * less than 1, show up to 4 significant digits; otherwise 2 decimals.
 * Keeps the chip label short at common scales (1:1 ft, 1:0.25 ft) without
 * losing precision for very fine scales.
 */
function formatScale(s: number): string {
  if (s === Math.trunc(s)) return String(s)
  if (s < 1) return Number(s.toPrecision(4)).toString()
  return s.toFixed(2)
}
