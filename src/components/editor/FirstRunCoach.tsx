import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useProjectStore } from '../../stores/projectStore'
import { useNeighborhoodStore } from '../../stores/neighborhoodStore'
import { useAnnotationsStore } from '../../stores/annotationsStore'
import { useToastStore } from '../../stores/toastStore'
import { buildDemoOfficePayload } from '../../lib/demo/createDemoOffice'
import { saveOffice } from '../../lib/offices/officeRepository'
import { emit } from '../../lib/audit'
import { prefersReducedMotion } from '../../lib/prefersReducedMotion'

const STORAGE_KEY = 'firstRunWelcomeSeen'
const DEMO_DISMISSED_KEY = 'floocraft.firstRunDemoDismissed'

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

function readDemoDismissed(): boolean {
  try {
    return localStorage.getItem(DEMO_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeDemoDismissed(): void {
  try {
    localStorage.setItem(DEMO_DISMISSED_KEY, '1')
  } catch {
    // Ignore — state still flips locally.
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
 * First-run coach composite. Two surfaces live here:
 *
 *   1. `FirstRunCoachTour` — a step-by-step popover teaching the editor's
 *      main moves (pan, tools, command palette, shortcut sheet, MAP/ROSTER
 *      tabs). Persists "seen" via localStorage under `firstRunWelcomeSeen`.
 *      Unchanged from Wave 12C apart from being extracted so the demo
 *      seeder can render alongside without wrestling for z-index.
 *
 *   2. `FirstRunDemoSeeder` — a small inline card shown ONLY when the
 *      active office is empty (zero elements on the active floor, zero
 *      employees). Offers a one-click "Load sample content" CTA that
 *      builds `buildDemoOfficePayload()`, persists it via `saveOffice`,
 *      and rehydrates every store so the canvas reflects the seed without
 *      a reload. Persists its own dismiss under
 *      `floocraft.firstRunDemoDismissed`.
 *
 * Both are opt-in to dismissal independently — a user who dismissed the
 * tour on a previous office still sees the "Load sample content" card on
 * a freshly-created empty office, and vice versa. That way the two
 * affordances don't get tangled by a single blanket "seen" flag.
 */
export function FirstRunCoach() {
  return (
    <>
      <FirstRunDemoSeeder />
      <FirstRunCoachTour />
    </>
  )
}

/**
 * Inline "Load sample content" card. Parked top-right above the existing
 * coach popover so both can coexist on an empty office. Disappears the
 * moment content arrives (the seeder CTA was clicked, or the user
 * started building manually).
 *
 * The copy leans marketing-forward on purpose: an empty canvas is the
 * single lowest-signal moment in the app, and a concrete "50 people,
 * two floors, neighborhoods" promise is what converts "I poked at this
 * for 30s and bounced" into "I see what this tool is for".
 */
function FirstRunDemoSeeder() {
  const [dismissed, setDismissed] = useState<boolean>(() => readDemoDismissed())
  const [loading, setLoading] = useState(false)
  const reducedMotion = useRef(prefersReducedMotion()).current

  // Emptiness check: zero elements in the elements store AND zero
  // employees. The roster can legitimately have people before any desks
  // exist (CSV import), so "employees AND elements both empty" is the
  // only safe "untouched canvas" signal.
  const elementCount = useElementsStore((s) => Object.keys(s.elements).length)
  const employeeCount = useEmployeeStore((s) => Object.keys(s.employees).length)
  const isEmpty = elementCount === 0 && employeeCount === 0

  const officeId = useProjectStore((s) => s.officeId)
  const loadedVersion = useProjectStore((s) => s.loadedVersion)

  const handleDismiss = useCallback(() => {
    writeDemoDismissed()
    setDismissed(true)
  }, [])

  const handleLoad = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const payload = buildDemoOfficePayload()

      // Best-effort server-side persist. If the office doesn't yet have a
      // known loadedVersion (brand-new empty row), skip the save and seed
      // stores only — the next debounced save from useOfficeSync will push
      // the content up. Failing to save is not fatal for the onboarding
      // path; the user sees the content immediately either way.
      if (officeId && loadedVersion) {
        try {
          const res = await saveOffice(
            officeId,
            payload as unknown as Record<string, unknown>,
            loadedVersion,
          )
          if (res.ok) {
            // Bump the project store's loadedVersion so subsequent edits
            // save cleanly against the new server-side timestamp.
            useProjectStore.setState({
              loadedVersion: res.updated_at,
              lastSavedAt: res.updated_at,
              saveState: 'saved',
            })
          } else {
            console.warn('[FirstRunDemoSeeder] initial demo save failed', res)
          }
        } catch (err) {
          console.warn('[FirstRunDemoSeeder] saveOffice threw; seeding stores anyway', err)
        }
      }

      // Hydrate local stores so the canvas reflects the seed immediately.
      // This mirrors the ProjectShell load path without going through a
      // full reload.
      useElementsStore.setState({ elements: payload.elements })
      useEmployeeStore.setState({
        employees: payload.employees,
        departmentColors: payload.departmentColors,
      })
      useFloorStore.setState({
        floors: payload.floors,
        activeFloorId: payload.activeFloorId,
      })
      useCanvasStore.setState({ settings: payload.settings })
      useNeighborhoodStore.setState({ neighborhoods: payload.neighborhoods })
      useAnnotationsStore.setState({ annotations: payload.annotations })

      // Best-effort audit trail — skips if the user isn't authenticated
      // or we're in a hosted-share context without a team id.
      void emit('demo.load', 'office', officeId, {
        floors: payload.floors.length,
        employees: Object.keys(payload.employees).length,
      })

      useToastStore.getState().push({
        tone: 'success',
        title: 'Sample office loaded — welcome to Floorcraft',
        body: 'Three floors, 45 people, neighborhoods, and annotations are ready to explore.',
      })

      writeDemoDismissed()
      setDismissed(true)
      // Suppress the step-by-step welcome tour as well: a user who just
      // loaded sample content has explicit, dense visual material in
      // front of them already, and the tour popover floating over the
      // canvas competes for the same attention. Skipping the tour here
      // is the right call — the tour can still be summoned from the
      // Help menu or Cmd+K command palette by users who want it later.
      writeSeen()
    } finally {
      setLoading(false)
    }
  }, [loading, officeId, loadedVersion])

  if (dismissed || !isEmpty) return null

  return (
    <div
      role="region"
      aria-labelledby="first-run-demo-title"
      // Slot the card in the top-right — high enough to be noticed, not
      // so high it clobbers the TopBar. The existing tour popover lives
      // bottom-right; keeping this one top-right means a user who sees
      // BOTH (fresh empty office, tour not yet dismissed) can act on
      // either without either covering the other.
      className={`absolute top-4 right-4 w-[340px] bg-white dark:bg-gray-900 shadow-xl rounded-xl border border-gray-200 dark:border-gray-800 p-4 z-40 ${
        reducedMotion ? '' : 'animate-in fade-in slide-in-from-top-2 duration-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-full w-9 h-9 flex items-center justify-center flex-shrink-0"
        >
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div
            id="first-run-demo-title"
            className="font-semibold text-gray-900 dark:text-gray-100 text-sm"
          >
            New to Floorcraft?
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 leading-snug">
            Load a sample office with{' '}
            <span className="tabular-nums font-medium">45 people</span>, three
            floors, and neighborhoods to see how it all fits together.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 -mr-1 -mt-1 p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Dismiss sample-content card"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleLoad}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
        >
          <Sparkles size={14} aria-hidden="true" />
          {loading ? 'Loading…' : 'Load sample content'}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          Start from scratch
        </button>
      </div>
    </div>
  )
}

/**
 * Step-by-step first-run tour. Walks new editors through the editor's
 * main moves (pan, tools, command palette, shortcut sheet, MAP/ROSTER
 * tabs) in a compact step-by-step popover. Persists "seen" via
 * localStorage under `firstRunWelcomeSeen` so it never re-pops once
 * dismissed; an Escape dismiss is ALSO honored as a session-level
 * suppression so a remount inside the same tab can't bring it back even
 * before the storage write lands.
 *
 * Wave 12C: replaced the milestone checklist with a tour-style coach
 * referencing the new editor surfaces shipped by waves 8-11 (drag-pan,
 * Cmd+K command palette, Cmd+F finder, ? cheat sheet, M/R tab jumps).
 */
function FirstRunCoachTour() {
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
