import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
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

interface CoachStep {
  // Used as the heading for each step. `aria-labelledby` on the dialog
  // also points at the active step's id so the screen reader announces
  // the right thing as the user walks through.
  id: string
  title: string
  body: React.ReactNode
}

/**
 * First-run coach. Walks new editors through the editor's main moves
 * (pan, tools, command palette, shortcut sheet, MAP/ROSTER tabs) in a
 * compact step-by-step popover. Persists "seen" via localStorage under
 * `firstRunWelcomeSeen` so it never re-pops once dismissed; an Escape
 * dismiss is ALSO honored as a session-level suppression so a remount
 * inside the same tab can't bring it back even before the storage write
 * lands.
 *
 * Wave 12C: replaced the milestone checklist with a tour-style coach
 * referencing the new editor surfaces shipped by waves 8-11 (drag-pan,
 * Cmd+K command palette, Cmd+F finder, ? cheat sheet, M/R tab jumps).
 */
export function FirstRunCoach() {
  const [dismissed, setDismissed] = useState<boolean>(() => readInitialSeen())
  const [stepIdx, setStepIdx] = useState(0)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null)

  const steps: CoachStep[] = useMemo(
    () => [
      {
        id: 'fr-step-pan',
        title: 'Move around the canvas',
        body: (
          <>
            Drag the empty canvas to <strong>pan</strong>, scroll to{' '}
            <strong>zoom</strong>. Hold <kbd>Space</kbd> for the classic
            pan-tool feel — release to snap back to your previous tool.
          </>
        ),
      },
      {
        id: 'fr-step-tools',
        title: 'Pick a tool',
        body: (
          <>
            Tools live in the left sidebar — or press a hotkey:{' '}
            <kbd>V</kbd> select, <kbd>W</kbd> wall, <kbd>R</kbd> rectangle,{' '}
            <kbd>E</kbd> ellipse, <kbd>T</kbd> text.
          </>
        ),
      },
      {
        id: 'fr-step-palette',
        title: 'Command palette',
        body: (
          <>
            Press <kbd>Cmd</kbd>+<kbd>K</kbd> to open the command palette —
            every action in one searchable list. <kbd>Cmd</kbd>+<kbd>F</kbd>{' '}
            opens the canvas finder to highlight elements by label.
          </>
        ),
      },
      {
        id: 'fr-step-shortcuts',
        title: 'See every shortcut',
        body: (
          <>
            Press <kbd>?</kbd> at any time to pop the full shortcut cheat
            sheet. <kbd>P</kbd> toggles presentation mode (←/→ walks through
            floors).
          </>
        ),
      },
      {
        id: 'fr-step-tabs',
        title: 'Switch views',
        body: (
          <>
            <strong>MAP</strong> and <strong>ROSTER</strong> tabs sit at the
            top of every office. Press <kbd>M</kbd> for the map,{' '}
            <kbd>R</kbd> for the roster — your selection survives the jump.
          </>
        ),
      },
    ],
    [],
  )

  const totalSteps = steps.length
  const isLastStep = stepIdx >= totalSteps - 1
  const activeStep = steps[stepIdx] ?? steps[0]

  const handleDismiss = useCallback(() => {
    writeSeen()
    setDismissed(true)
  }, [])

  const handleNext = useCallback(() => {
    if (isLastStep) {
      handleDismiss()
      return
    }
    setStepIdx((i) => Math.min(totalSteps - 1, i + 1))
  }, [isLastStep, totalSteps, handleDismiss])

  const handleBack = useCallback(() => {
    setStepIdx((i) => Math.max(0, i - 1))
  }, [])

  // Auto-focus the primary action when the coach opens, and re-focus it
  // when the step changes so keyboard users can mash Enter to walk
  // through. The microtask defer matches the FileMenu pattern: focusing
  // synchronously inside an effect can race with React's commit phase
  // when the popover mounts inside an animated parent.
  useEffect(() => {
    if (dismissed) return
    const id = window.setTimeout(() => primaryBtnRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [dismissed, stepIdx])

  // Esc dismisses. Also implements a tiny focus-trap inside the popover:
  // Tab cycles within the dialog so keyboard users don't fall back into
  // the canvas behind it. The handler runs in capture phase so the
  // global editor shortcuts hook (which also listens for Escape) doesn't
  // race us — we want Esc here to dismiss the coach, not clear the
  // canvas selection underneath.
  useEffect(() => {
    if (dismissed) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        handleDismiss()
        return
      }
      if (e.key !== 'Tab') return
      const card = cardRef.current
      if (!card) return
      const focusables = card.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => {
      window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions)
    }
  }, [dismissed, handleDismiss])

  if (dismissed) return null

  const handleOpenPalette = () => {
    // The command palette is the lowest-friction launching pad: it
    // surfaces "Insert wall", "Add desk", "Assign seats" etc. in one
    // searchable list without steering the user down a single path.
    useUIStore.getState().setCommandPaletteOpen(true)
    handleDismiss()
  }

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      // aria-labelledby points at the dialog's stable title heading so
      // the accessible name stays "Welcome to Floorcraft" across steps.
      // The per-step heading inside the body re-announces step copy as
      // the user advances; we don't shift the dialog's name itself.
      aria-labelledby="first-run-coach-title"
      className="absolute bottom-12 right-4 w-[360px] bg-white dark:bg-gray-900 shadow-xl rounded-xl border border-gray-200 dark:border-gray-800 p-5 z-40"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0"
        >
          <Sparkles size={20} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div
            id="first-run-coach-title"
            className="font-semibold text-gray-900 dark:text-gray-100"
          >
            Welcome to Floorcraft
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
            A quick tour of the editor — {totalSteps} steps.
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

      <div className="mt-4">
        <h3
          id={activeStep.id}
          className="text-sm font-semibold text-gray-900 dark:text-gray-100"
        >
          {activeStep.title}
        </h3>
        <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
          {activeStep.body}
        </p>
      </div>

      {/*
        Step indicator: a row of small dots, one per step. The active dot
        gets the primary blue, completed dots a softer blue, and pending
        dots stay neutral. Buttons rather than spans so a mouse user can
        click to jump — keyboard users walk via Next/Back.
      */}
      <div
        className="mt-5 flex items-center gap-1.5"
        aria-label={`Step ${stepIdx + 1} of ${totalSteps}`}
      >
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStepIdx(i)}
            aria-label={`Go to step ${i + 1}: ${s.title}`}
            aria-current={i === stepIdx ? 'step' : undefined}
            className={`h-1.5 rounded-full transition-all ${
              i === stepIdx
                ? 'w-5 bg-blue-600 dark:bg-blue-400'
                : i < stepIdx
                  ? 'w-1.5 bg-blue-300 dark:bg-blue-700'
                  : 'w-1.5 bg-gray-300 dark:bg-gray-700'
            }`}
          />
        ))}
        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {stepIdx + 1} / {totalSteps}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleDismiss}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          Skip tour
        </button>
        <div className="ml-auto flex items-center gap-2">
          {stepIdx > 0 && (
            <button
              type="button"
              onClick={handleBack}
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              Back
            </button>
          )}
          {/* Last step gets two CTAs: "Open palette" jumps the user
              straight into the command palette (the most useful next
              step), "Done" simply dismisses. Earlier steps just have
              "Next". */}
          {isLastStep ? (
            <>
              <button
                type="button"
                onClick={handleOpenPalette}
                className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                Open palette
              </button>
              <button
                ref={primaryBtnRef}
                type="button"
                onClick={handleDismiss}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                Done
              </button>
            </>
          ) : (
            <button
              ref={primaryBtnRef}
              type="button"
              onClick={handleNext}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
