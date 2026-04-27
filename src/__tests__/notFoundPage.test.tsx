import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotFoundPage } from '../components/NotFoundPage'

describe('NotFoundPage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the Floorcraft wordmark', () => {
    render(
      <MemoryRouter initialEntries={['/no-such-page']}>
        <NotFoundPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Floorcraft')).toBeInTheDocument()
  })

  it('renders the title and a Back to home link', () => {
    render(
      <MemoryRouter initialEntries={['/no-such-page']}>
        <NotFoundPage />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: /can't find that page/i }),
    ).toBeInTheDocument()
    const home = screen.getByRole('link', { name: /back to home/i })
    expect(home).toHaveAttribute('href', '/')
  })

  it('links to the help center', () => {
    render(
      <MemoryRouter initialEntries={['/no-such-page']}>
        <NotFoundPage />
      </MemoryRouter>,
    )
    const help = screen.getByRole('link', { name: /help center/i })
    expect(help).toHaveAttribute('href', '/help')
  })

  it('logs the missing path on mount', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <MemoryRouter initialEntries={['/totally-bogus']}>
        <NotFoundPage />
      </MemoryRouter>,
    )
    expect(warn).toHaveBeenCalledWith('[404] no route matched', '/totally-bogus')
  })

  it('uses role="alert" so screen readers announce it', () => {
    render(
      <MemoryRouter initialEntries={['/no-such-page']}>
        <NotFoundPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
