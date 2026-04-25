import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FirstRunCoach } from '../components/editor/FirstRunCoach'
import { useUIStore } from '../stores/uiStore'

/**
 * These tests cover the persistent dismiss behavior of the first-run
 * coach — the parts that survive the wave-12C copy refresh. Step copy
 * and focus behavior live in `firstRunCoachCopy.test.tsx`.
 */
describe('FirstRunCoach (persistence)', () => {
  beforeEach(() => {
    localStorage.clear()
    useUIStore.setState({ commandPaletteOpen: false })
  })

  it('mounts the welcome card when firstRunWelcomeSeen is unset', () => {
    render(<FirstRunCoach />)
    expect(screen.getByRole('dialog', { name: /welcome to floorcraft/i })).toBeInTheDocument()
    expect(screen.getByText(/welcome to floorcraft/i)).toBeInTheDocument()
  })

  it('does NOT mount when firstRunWelcomeSeen is set to "1"', () => {
    localStorage.setItem('firstRunWelcomeSeen', '1')
    const { container } = render(<FirstRunCoach />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('dialog', { name: /welcome to floorcraft/i })).toBeNull()
  })

  it('Skip tour link writes firstRunWelcomeSeen=1 and unmounts the card', () => {
    render(<FirstRunCoach />)
    fireEvent.click(screen.getByRole('button', { name: /skip tour/i }))
    expect(localStorage.getItem('firstRunWelcomeSeen')).toBe('1')
    expect(screen.queryByRole('dialog', { name: /welcome to floorcraft/i })).toBeNull()
  })

  it('X close button also dismisses', () => {
    render(<FirstRunCoach />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss welcome card/i }))
    expect(localStorage.getItem('firstRunWelcomeSeen')).toBe('1')
  })

  it('"Open palette" CTA on the last step opens the command palette and dismisses', () => {
    render(<FirstRunCoach />)
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    // Walk to the last step via the Next button.
    while (screen.queryByRole('button', { name: /^next$/i })) {
      fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    }
    fireEvent.click(screen.getByRole('button', { name: /open palette/i }))
    expect(useUIStore.getState().commandPaletteOpen).toBe(true)
    expect(localStorage.getItem('firstRunWelcomeSeen')).toBe('1')
  })
})
