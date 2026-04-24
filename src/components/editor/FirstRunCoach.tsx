import { useMemo, useState } from 'react'
import { Sparkles, CheckCircle2, Circle, X } from 'lucide-react'
import { useElementsStore } from '../../stores/elementsStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useUIStore } from '../../stores/uiStore'

const STORAGE_KEY = 'firstRunWelcomeSeen'

function readInitialSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Private mode / quota — the card still unmounts via component state.
  }
}

interface ChecklistItem {
  label: string
  done: boolean
}

/**
 * First-run welcome card. Floats above the StatusBar in the bottom-right
 * of the canvas area and retires itself once dismissed or once all three
 * getting-started milestones are complete.
 *
 * Milestones are derived from live store state so importing a template
 * plan (which seeds elements + employee assignments) quietly auto-
 * dismisses on first mount instead of showing a fully-checked card.
 *
 * Non-blocking by design: `role="complementary"` + no focus trap. The
 * card doesn't compete with the empty-canvas hint because the hint
 * sits center and this card sits bottom-right.
 */
export function FirstRunCoach() {
  const [dismissed, setDismissed] = useState<boolean>(() => readInitialSeen())

  // Checklist milestones — each derived from real store state.
  const hasWalls = useElementsStore((s) => {
    for (const el of Object.values(s.elements)) {
      if (el.type === 'wall') return true
    }
    return false
  })
  const hasDesks = useElementsStore((s) => {
    for (const el of Object.values(s.elements)) {
      if (el.type === 'desk' || el.type === 'hot-desk' || el.type === 'workstation') {
        return true
      }
    }
    return false
  })
  const hasTeamAssigned = useEmployeeStore((s) => {
    for (const emp of Object.values(s.employees)) {
      if (emp.seatId) return true
    }
    return false
  })

  const items: ChecklistItem[] = useMemo(
    () => [
      { label: 'Draw your walls', done: hasWalls },
      { label: 'Add some desks', done: hasDesks },
      { label: 'Assign the team', done: hasTeamAssigned },
    ],
    [hasWalls, hasDesks, hasTeamAssigned],
  )

  const allDone = items.every((i) => i.done)

  // Auto-dismiss when the user arrives with a pre-populated office so we
  // don't flash a fully-checked card at them. Persist the flag so it
  // sticks across sessions even if they later remove elements.
  if (allDone && !dismissed) {
    writeSeen()
    // Using a side-effectful branch here (rather than useEffect) because
    // we want the card gone on the very first render — no one-frame
    // flash of "all done" content. Safe because we guard with `!dismissed`
    // so React doesn't see two setState calls in a row.
    setDismissed(true)
    return null
  }

  if (dismissed) return null

  const handleDismiss = () => {
    writeSeen()
    setDismissed(true)
  }

  const handleGetStarted = () => {
    // The command palette is the lowest-friction launching pad: it
    // surfaces "Insert wall", "Add desk", "Assign seats" etc. in one
    // searchable list without steering the user down a single path.
    useUIStore.getState().setCommandPaletteOpen(true)
  }

  return (
    <div
      role="complementary"
      aria-label="First-run help"
      className="absolute bottom-12 right-4 w-[340px] bg-white dark:bg-gray-900 shadow-xl rounded-xl border border-gray-200 dark:border-gray-800 p-5 z-40"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0"
        >
          <Sparkles size={20} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 dark:text-gray-100">Welcome to Floorcraft</div>
          <div className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
            Get your floor plan started in 60 seconds.
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 -mr-1 -mt-1 p-1 rounded"
          aria-label="Dismiss welcome card"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <ul className="mt-4 space-y-2" aria-label="Getting started checklist">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 text-sm">
            {item.done ? (
              <CheckCircle2
                size={18}
                className="text-green-600 dark:text-green-400 flex-shrink-0"
                aria-hidden="true"
              />
            ) : (
              <Circle
                size={18}
                className="text-gray-300 flex-shrink-0"
                aria-hidden="true"
              />
            )}
            <span
              className={
                item.done ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-800 dark:text-gray-100'
              }
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleGetStarted}
          className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50"
        >
          Get started
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
