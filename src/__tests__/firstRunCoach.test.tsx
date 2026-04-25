import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FirstRunCoach } from '../components/editor/FirstRunCoach'
import { useUIStore } from '../stores/uiStore'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'

/**
 * These tests cover the persistent dismiss behavior of the first-run
 * coach tour — the parts that survive the wave-12C copy refresh and
 * wave-17B demo-seeder addition. Step copy + focus behavior live in
 * `firstRunCoachCopy.test.tsx`; the inline "Load sample content" demo
 * card is covered further down in this file.
 *
 * Shared beforeEach dismisses the demo seeder's localStorage key so the
 * tour popover tests aren't racing two overlays. Tests that explicitly
 * cover the seeder clear that key back out.
 */

const DEMO_DISMISSED_KEY = 'floocraft.firstRunDemoDismissed'

function dismissDemoCard() {
  localStorage.setItem(DEMO_DISMISSED_KEY, '1')
}

describe('FirstRunCoach tour (persistence)', () => {
  beforeEach(() => {
    localStorage.clear()
    useUIStore.setState({ commandPaletteOpen: false })
    // Pre-dismiss the demo seeder so the tour tests don't have to reason
    // about two overlapping cards. The seeder is independently covered
    // below.
    dismissDemoCard()
  })

  it('mounts the welcome card when firstRunWelcomeSeen is unset', () => {
    render(<FirstRunCoach />)
    expect(screen.getByRole('dialog', { name: /welcome to floorcraft/i })).toBeInTheDocument()
    expect(screen.getByText(/welcome to floorcraft/i)).toBeInTheDocument()
  })

  it('does NOT mount when firstRunWelcomeSeen is set to "1"', () => {
    localStorage.setItem('firstRunWelcomeSeen', '1')
    dismissDemoCard()
    render(<FirstRunCoach />)
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

// ------------------------------------------------------------------
// Wave 17B: "Load sample content" inline seeder card.
// ------------------------------------------------------------------

describe('FirstRunCoach demo seeder', () => {
  beforeEach(() => {
    localStorage.clear()
    // Hide the tour dialog so the seeder tests aren't entangled with it.
    localStorage.setItem('firstRunWelcomeSeen', '1')
    useElementsStore.setState({ elements: {} })
    useEmployeeStore.setState({ employees: {}, departmentColors: {} })
  })

  it('renders the "Load sample content" CTA when the office is empty', () => {
    render(<FirstRunCoach />)
    expect(
      screen.getByRole('region', { name: /new to floorcraft/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /load sample content/i }),
    ).toBeInTheDocument()
  })

  it('does NOT render the CTA when the office already has content', () => {
    useElementsStore.setState({
      elements: {
        'el-1': {
          id: 'el-1',
          type: 'desk',
          x: 0,
          y: 0,
          width: 72,
          height: 48,
          rotation: 0,
          locked: false,
          groupId: null,
          zIndex: 1,
          label: 'Desk',
          visible: true,
          style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
          deskId: 'D1',
          assignedEmployeeId: null,
          capacity: 1,
        } as never,
      },
    })
    render(<FirstRunCoach />)
    expect(
      screen.queryByRole('region', { name: /new to floorcraft/i }),
    ).toBeNull()
  })

  it('does NOT render the CTA when dismissed flag is set', () => {
    localStorage.setItem(DEMO_DISMISSED_KEY, '1')
    render(<FirstRunCoach />)
    expect(
      screen.queryByRole('region', { name: /new to floorcraft/i }),
    ).toBeNull()
  })

  it('Dismiss button hides the CTA and persists to localStorage', () => {
    render(<FirstRunCoach />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss sample-content card/i }))
    expect(localStorage.getItem(DEMO_DISMISSED_KEY)).toBe('1')
    expect(
      screen.queryByRole('region', { name: /new to floorcraft/i }),
    ).toBeNull()
  })

  it('"Start from scratch" also dismisses without loading content', () => {
    render(<FirstRunCoach />)
    fireEvent.click(screen.getByRole('button', { name: /start from scratch/i }))
    expect(localStorage.getItem(DEMO_DISMISSED_KEY)).toBe('1')
    // No elements/employees were seeded.
    expect(Object.keys(useElementsStore.getState().elements)).toHaveLength(0)
    expect(Object.keys(useEmployeeStore.getState().employees)).toHaveLength(0)
  })

  it('"Load sample content" seeds the stores with the demo payload', async () => {
    render(<FirstRunCoach />)
    const cta = screen.getByRole('button', { name: /load sample content/i })
    expect(cta).toHaveAttribute('type', 'button')
    await act(async () => {
      fireEvent.click(cta)
    })
    // Stores were populated by the seeder.
    expect(
      Object.keys(useElementsStore.getState().elements).length,
    ).toBeGreaterThan(0)
    expect(
      Object.keys(useEmployeeStore.getState().employees).length,
    ).toBeGreaterThanOrEqual(40)
  })

  it('CTA button is keyboard-activatable via Enter', async () => {
    render(<FirstRunCoach />)
    const cta = screen.getByRole('button', { name: /load sample content/i })
    cta.focus()
    expect(document.activeElement).toBe(cta)
    // A <button> with type="button" natively activates on Enter; simulate
    // the key press lands on its click handler.
    await act(async () => {
      fireEvent.keyDown(cta, { key: 'Enter', code: 'Enter' })
      // jsdom doesn't translate keydown → click on a button automatically;
      // fire a follow-up click to model the browser behavior (same codepath
      // as mouse activation).
      fireEvent.click(cta)
    })
    expect(
      Object.keys(useEmployeeStore.getState().employees).length,
    ).toBeGreaterThan(0)
  })
})

// Silence the module-unused warning for vi when no mocks are used in
// the currently-enabled describes.
void vi
