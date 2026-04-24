import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { ThemeProvider, useTheme } from '../lib/theme'

interface MqlMock {
  matches: boolean
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  fire: (matches: boolean) => void
}

function installMatchMedia(initialMatches = false): MqlMock {
  let listeners: Array<(e: MediaQueryListEvent) => void> = []
  const mql: MqlMock = {
    matches: initialMatches,
    addEventListener: vi.fn((_event: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.push(cb)
    }),
    removeEventListener: vi.fn((_event: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners = listeners.filter((l) => l !== cb)
    }),
    fire(matches: boolean) {
      this.matches = matches
      const event = { matches } as unknown as MediaQueryListEvent
      listeners.forEach((l) => l(event))
    },
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => mql),
  })
  return mql
}

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('dark')}>set dark</button>
      <button onClick={() => setTheme('light')}>set light</button>
      <button onClick={() => setTheme('system')}>set system</button>
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
    window.localStorage.clear()
  })

  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('defaults to system when nothing is stored and resolves from matchMedia', () => {
    installMatchMedia(false)
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme').textContent).toBe('system')
    expect(screen.getByTestId('resolved').textContent).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('hydrates from existing localStorage and applies the dark class', () => {
    installMatchMedia(false)
    window.localStorage.setItem('theme', 'dark')
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme').textContent).toBe('dark')
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('setTheme("dark") adds the dark class on root and writes localStorage', () => {
    installMatchMedia(false)
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    act(() => {
      screen.getByText('set dark').click()
    })
    expect(window.localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(screen.getByTestId('resolved').textContent).toBe('dark')

    act(() => {
      screen.getByText('set light').click()
    })
    expect(window.localStorage.getItem('theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('updates resolved theme when matchMedia changes while in system mode', () => {
    const mql = installMatchMedia(false)
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('resolved').textContent).toBe('light')

    act(() => {
      mql.fire(true)
    })
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    act(() => {
      mql.fire(false)
    })
    expect(screen.getByTestId('resolved').textContent).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('stops listening to matchMedia once an explicit theme is chosen', () => {
    const mql = installMatchMedia(false)
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    act(() => {
      screen.getByText('set light').click()
    })
    // Fires while in explicit-light mode should not flip the theme
    act(() => {
      mql.fire(true)
    })
    expect(screen.getByTestId('resolved').textContent).toBe('light')
  })
})
