import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FirstRunCoach } from '../components/editor/FirstRunCoach'
import { useUIStore } from '../stores/uiStore'

/**
 * Copy + behavior coverage for the wave-12C tour-style first-run coach:
 *  - Renders the expected step copy referencing the new editor surfaces
 *    (drag-pan, hotkeys, Cmd+K palette, ? cheat sheet, M/R tabs).
 *  - Step indicator advances; primary action focuses on open & on each
 *    step change.
 *  - Escape dismisses + persists the seen flag.
 */
describe('FirstRunCoach copy + step behavior', () => {
  beforeEach(() => {
    localStorage.clear()
    useUIStore.setState({ commandPaletteOpen: false })
    // Wave 17B: the first-run composite now also renders a
    // "Load sample content" card on empty offices. Dismiss it so the
    // tour copy tests below don't have to reason about two overlays.
    localStorage.setItem('floocraft.firstRunDemoDismissed', '1')
  })

  it('renders the first step copy referencing pan + zoom', () => {
    render(<FirstRunCoach />)
    // Step 1: panning / zooming.
    expect(screen.getByText(/move around the canvas/i)).toBeInTheDocument()
    // The body uses inline strong+kbd elements, so match a substring of
    // the visible run of text rather than the whole sentence.
    expect(screen.getByText(/drag the empty canvas/i)).toBeInTheDocument()
    // Step indicator shows 1/N.
    expect(screen.getByText(/1\s*\/\s*5/)).toBeInTheDocument()
  })

  it('Next button advances through the five steps in order', () => {
    render(<FirstRunCoach />)
    const titles = [
      /move around the canvas/i,
      /pick a tool/i,
      /^command palette$/i,
      /see every shortcut/i,
      /switch views/i,
    ]
    expect(screen.getByRole('heading', { name: titles[0] })).toBeInTheDocument()
    for (let i = 1; i < titles.length; i++) {
      fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
      expect(screen.getByRole('heading', { name: titles[i] })).toBeInTheDocument()
    }
    // Last step swaps Next for Done + Open palette.
    expect(screen.queryByRole('button', { name: /^next$/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^done$/i })).toBeInTheDocument()
  })

  it('step copy references the real editor shortcuts (Cmd+K, ?, M/R)', () => {
    render(<FirstRunCoach />)
    // Step 3: command palette.
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    expect(screen.getByText(/every action in one searchable list/i)).toBeInTheDocument()
    // Step 4: shortcut sheet via `?`.
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    expect(screen.getByText(/full shortcut cheat\s+sheet/i)).toBeInTheDocument()
    // Step 5: MAP / ROSTER tab jump keys.
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    expect(screen.getByText(/tabs sit at the/i)).toBeInTheDocument()
  })

  it('Back button steps backwards', () => {
    render(<FirstRunCoach />)
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    expect(screen.getByText(/pick a tool/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
    expect(screen.getByText(/move around the canvas/i)).toBeInTheDocument()
  })

  it('focuses the primary action on open and re-focuses on step change', () => {
    render(<FirstRunCoach />)
    // After mount, the primary button (Next) should hold focus once the
    // microtask deferred autofocus runs.
    return new Promise<void>((resolve) => {
      window.setTimeout(() => {
        const nextBtn = screen.getByRole('button', { name: /^next$/i })
        expect(document.activeElement).toBe(nextBtn)
        // Step change → primary stays focused (still "Next" until last
        // step, where it becomes "Done").
        fireEvent.click(nextBtn)
        window.setTimeout(() => {
          expect(document.activeElement).toBe(
            screen.getByRole('button', { name: /^next$/i }),
          )
          resolve()
        }, 10)
      }, 10)
    })
  })

  it('Escape dismisses and persists the seen flag', () => {
    render(<FirstRunCoach />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(localStorage.getItem('firstRunWelcomeSeen')).toBe('1')
    expect(screen.queryByRole('dialog', { name: /welcome to floorcraft/i })).toBeNull()
  })

  it('uses dialog role with aria-labelledby pointing at the dialog title', () => {
    render(<FirstRunCoach />)
    const dialog = screen.getByRole('dialog', { name: /welcome to floorcraft/i })
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    if (labelledBy) {
      const heading = document.getElementById(labelledBy)
      expect(heading?.textContent).toMatch(/welcome to floorcraft/i)
    }
  })

  it('step indicator dots are clickable to jump to a step', () => {
    render(<FirstRunCoach />)
    // Click the dot for step 3.
    fireEvent.click(screen.getByRole('button', { name: /go to step 3/i }))
    expect(screen.getByRole('heading', { name: /^command palette$/i })).toBeInTheDocument()
    expect(screen.getByText(/3\s*\/\s*5/)).toBeInTheDocument()
  })
})
