import { useEffect, useState } from 'react'
import { useCalibrateScaleStore } from '../../stores/calibrateScaleStore'
import { useUIStore } from '../../stores/uiStore'
import {
  LENGTH_UNIT_LABELS,
  LENGTH_UNIT_SUFFIX,
  type LengthUnit,
} from '../../lib/units'
import { pointDistance } from '../../lib/calibrateScale'
import { Button, Modal, ModalBody, ModalFooter } from '../ui'

/**
 * Tiny modal shown after the user has dropped both calibration points.
 *
 * Presents a numeric input + unit dropdown and, on Apply, writes the
 * derived scale back into the canvas store via `commit()`. Cancel (or
 * Escape, handled by the keyboard hook) aborts the session.
 *
 * Rendering is gated on `status === 'awaiting-distance'` so the modal
 * simply disappears when the calibrator is inactive — there's no "is
 * open" boolean to keep in sync. We increment the global modal counter
 * while mounted so the editor's global hotkeys stand down (Escape
 * closes this modal, not canvas selection).
 */
// Units offered in the calibrator. `px` is excluded intentionally — a
// "calibrate to pixels" result is always 1:1, which would silently stomp
// the user's real-world scale with no benefit. `deriveCalibration` also
// rejects 'px' as a defense-in-depth guard.
const CALIBRATION_UNITS: readonly LengthUnit[] = ['ft', 'in', 'm', 'cm'] as const

export function CalibrateScaleModal() {
  const status = useCalibrateScaleStore((s) => s.status)
  const isOpen = status === 'awaiting-distance'
  // Split into outer gate + inner body so each open is a fresh mount.
  // That lets the inner component initialize state from `useState` directly
  // (no setState-in-effect reset pattern, which the lint rule discourages).
  if (!isOpen) return null
  return <CalibrateScaleModalBody />
}

function CalibrateScaleModalBody() {
  const firstPoint = useCalibrateScaleStore((s) => s.firstPoint)
  const secondPoint = useCalibrateScaleStore((s) => s.secondPoint)
  const commit = useCalibrateScaleStore((s) => s.commit)
  const reset = useCalibrateScaleStore((s) => s.reset)

  const [value, setValue] = useState('')
  const [unit, setUnit] = useState<LengthUnit>('ft')
  const [error, setError] = useState<string | null>(null)

  // Modal ref-count: while mounted, global hotkeys (Cmd+A, nudges, etc.)
  // should stand down so typing into the distance input feels normal.
  // The focus-guard in useKeyboardShortcuts catches INPUTs too, but this
  // belt-and-braces also covers Escape-close precedence.
  const registerModalOpen = useUIStore((s) => s.registerModalOpen)
  const registerModalClose = useUIStore((s) => s.registerModalClose)
  useEffect(() => {
    registerModalOpen()
    return () => registerModalClose()
  }, [registerModalOpen, registerModalClose])

  const parsed = Number(value)
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed > 0

  const canvasPx =
    firstPoint && secondPoint ? pointDistance(firstPoint, secondPoint) : 0

  const handleApply = () => {
    if (!valid) return
    const ok = commit(parsed, unit)
    if (!ok) {
      setError('Could not apply calibration. Points may be identical — try again.')
    }
  }

  return (
    <Modal open onClose={reset} title="Set scale" size="sm">
      <ModalBody>
        <p className="text-xs text-gray-500 mb-3">
          How far apart are these two points in real life?
        </p>
        <p className="text-[11px] text-gray-400 mb-3 tabular-nums">
          Canvas distance: {canvasPx.toFixed(1)} px
        </p>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs text-gray-700 mb-1" htmlFor="calibrate-distance">
              Distance
            </label>
            <input
              id="calibrate-distance"
              type="number"
              min={0}
              step="any"
              value={value}
              autoFocus
              onChange={(e) => {
                setError(null)
                setValue(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && valid) {
                  e.preventDefault()
                  handleApply()
                }
              }}
              aria-invalid={!!error}
              aria-describedby={error ? 'calibrate-distance-error' : undefined}
              className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
            />
          </div>
          <div className="w-24">
            <label className="block text-xs text-gray-700 mb-1" htmlFor="calibrate-unit">
              Unit
            </label>
            <select
              id="calibrate-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as LengthUnit)}
              className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
            >
              {CALIBRATION_UNITS.map((u) => (
                <option key={u} value={u}>
                  {LENGTH_UNIT_LABELS[u]} ({LENGTH_UNIT_SUFFIX[u]})
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p
            id="calibrate-distance-error"
            className="text-xs text-red-600 mt-1"
            role="alert"
          >
            {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="secondary" size="sm" onClick={reset}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleApply}
          disabled={!valid}
        >
          Apply
        </Button>
      </ModalFooter>
    </Modal>
  )
}
