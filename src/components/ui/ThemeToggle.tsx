import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../lib/theme'
import type { Theme } from '../../lib/theme'
import { cn } from '../../lib/cn'

interface ThemeToggleProps {
  className?: string
  /** Render label text alongside the icons (default false — icon-only). */
  showLabels?: boolean
}

const OPTIONS: ReadonlyArray<{ value: Theme; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

/**
 * Three-way segmented control for selecting Light / System / Dark.
 * Icon-only by default; pass `showLabels` for textual labels.
 */
export function ThemeToggle({ className, showLabels = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-800',
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              active
                ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200',
            )}
          >
            <Icon size={14} aria-hidden />
            {showLabels ? <span>{label}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
