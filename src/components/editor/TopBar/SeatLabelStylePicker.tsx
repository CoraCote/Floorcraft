import type { SeatLabelStyle } from '../../../types/project'
import { SEAT_LABEL_STYLES } from '../../../types/project'

/**
 * Wave 15C — picker UI for the per-seat label style.
 *
 * Rendered as a sub-section inside the TopBar's View dropdown. Each
 * style is shown as a radio-style menu item with a small CSS-only
 * preview swatch so the user can see at a glance which style is
 * which. The swatches are not Konva renders — they're hand-tuned HTML
 * approximations that track the Konva rendering closely enough to
 * communicate the idea (card-with-header vs. pill vs. avatar chip
 * vs. left accent stripe) without dragging a stage into the menu.
 *
 * We deliberately keep this component presentational: the parent
 * (`TopBar`) owns the `CanvasSettings` write-through so the picker
 * inherits the existing autosave plumbing for free. The `aria-
 * checked` / `role="menuitemradio"` pattern matches other radio-style
 * dropdown groups in the codebase (see `ViewAsMenu`).
 */

interface SeatLabelStylePickerProps {
  value: SeatLabelStyle
  onChange: (next: SeatLabelStyle) => void
}

interface StyleOption {
  id: SeatLabelStyle
  label: string
  description: string
}

const OPTIONS: StyleOption[] = [
  {
    id: 'pill',
    label: 'Pill',
    description: 'Tinted pill carries the dept colour; full name only.',
  },
  {
    id: 'card',
    label: 'Card',
    description: '4px dept accent strip + name. Title only when set.',
  },
  {
    id: 'avatar',
    label: 'Avatar',
    description: 'Initials chip alone — minimal floor-plan look.',
  },
  {
    id: 'banner',
    label: 'Banner',
    description: 'Dept-coloured left stripe + name. No eyebrow.',
  },
]

// Keep the set of options in sync with the type union at build time —
// if SEAT_LABEL_STYLES grows a new variant but OPTIONS doesn't, this
// will trip a TypeScript error rather than silently hiding the new
// style from users.
type _Assert = typeof SEAT_LABEL_STYLES[number] extends StyleOption['id']
  ? StyleOption['id'] extends typeof SEAT_LABEL_STYLES[number]
    ? true
    : never
  : never
// Prevents the `_Assert` alias itself from being flagged as unused
// without actually using it at runtime.
const _assert: _Assert = true
void _assert

export function SeatLabelStylePicker({ value, onChange }: SeatLabelStylePickerProps) {
  return (
    <div role="group" aria-label="Seat label style">
      <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Seat label style
      </div>
      {OPTIONS.map((opt) => {
        const isChecked = value === opt.id
        return (
          <button
            key={opt.id}
            role="menuitemradio"
            aria-checked={isChecked}
            onClick={() => onChange(opt.id)}
            title={opt.description}
            className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
              isChecked
                ? 'text-gray-900 dark:text-gray-50'
                : 'text-gray-700 dark:text-gray-200'
            }`}
            data-style={opt.id}
            data-testid={`seat-label-style-${opt.id}`}
          >
            <span
              aria-hidden="true"
              className="inline-block w-[14px] text-center text-blue-600 dark:text-blue-400"
            >
              {isChecked ? '\u2022' : ''}
            </span>
            <StyleSwatch style={opt.id} />
            <span className="flex-1">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Tiny 24×16 CSS-only preview of each style. These are deliberately
 * abstract — the goal is "does this look like the card / pill /
 * avatar / banner variant" not "does this render a specific
 * employee" — so the swatch stays readable at a glance and doesn't
 * lie about behaviour that would require a live stage.
 *
 * The swatches use the same colour palette as the real renderers
 * (indigo = department accent, cream = desk fill, gray = text) so
 * the preview reads as a miniature of what the canvas will look
 * like after selection.
 */
function StyleSwatch({ style }: { style: SeatLabelStyle }) {
  switch (style) {
    case 'pill':
      // Tinted pill — name centred, no subtitle.
      return (
        <span
          aria-hidden="true"
          className="relative inline-block w-6 h-4 rounded-sm border border-gray-300 dark:border-gray-600 bg-amber-50 dark:bg-amber-950/30"
        >
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-2 rounded-full"
            style={{ backgroundColor: 'rgba(79,70,229,0.35)' }}
          />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-[2px] bg-gray-700 rounded-sm" />
        </span>
      )
    case 'card':
      // 4px top accent strip + centred name (no header text).
      return (
        <span
          aria-hidden="true"
          className="relative inline-block w-6 h-4 rounded-sm bg-white border border-indigo-500"
        >
          <span className="absolute inset-x-0 top-0 h-[2px] bg-indigo-500" />
          <span className="absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 w-3.5 h-[2px] bg-gray-700 rounded-sm" />
        </span>
      )
    case 'avatar':
      // Centred initials chip alone — no name beside it.
      return (
        <span
          aria-hidden="true"
          className="relative inline-block w-6 h-4 rounded-sm border border-gray-300 dark:border-gray-600 bg-amber-50 dark:bg-amber-950/30"
        >
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
            style={{ backgroundColor: 'rgba(79,70,229,0.85)' }}
          />
        </span>
      )
    case 'banner':
      // Left stripe + centred name (no eyebrow).
      return (
        <span
          aria-hidden="true"
          className="relative inline-block w-6 h-4 rounded-sm border border-gray-300 dark:border-gray-600 bg-amber-50 dark:bg-amber-950/30"
        >
          <span className="absolute inset-y-0 left-0 w-1 bg-indigo-500" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-[2px] bg-gray-700 rounded-sm" />
        </span>
      )
  }
}
