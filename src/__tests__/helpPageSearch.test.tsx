import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelpPage } from '../components/help/HelpPage'

/**
 * Wave-12C help-page coverage:
 *  - TOC nav has the right role/label and lists every section.
 *  - Search filters BOTH the TOC and the rendered sections by
 *    case-insensitive substring of heading + body text.
 *  - Empty state renders when no sections match, with a working Clear.
 *  - Section headings have id attributes (deep-link anchors).
 *  - Anchor copy-to-clipboard surfaces an aria-live confirmation.
 */
function renderHelp() {
  return render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  )
}

describe('HelpPage TOC + search', () => {
  beforeEach(() => {
    // jsdom doesn't ship IntersectionObserver. The component degrades
    // gracefully when it's missing, but stubbing it keeps the render
    // path identical to production.
    if (!('IntersectionObserver' in window)) {
      class IO {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() { return [] }
      }
      // @ts-expect-error: assigning to global for jsdom
      window.IntersectionObserver = IO
      // @ts-expect-error: assigning to global for jsdom
      globalThis.IntersectionObserver = IO
    }
  })

  it('renders a TOC navigation landmark with every section listed', () => {
    renderHelp()
    // Two TOC blocks render (mobile <details> + desktop <aside>); both
    // share the same role/label, so we use getAllBy and pick the first.
    const navs = screen.getAllByRole('navigation', { name: /table of contents/i })
    expect(navs.length).toBeGreaterThan(0)
    const desktopNav = navs[navs.length - 1]
    // A few sections we expect to see by label.
    expect(within(desktopNav).getByText(/what's new/i)).toBeInTheDocument()
    expect(within(desktopNav).getByText(/getting started/i)).toBeInTheDocument()
    expect(within(desktopNav).getByText(/keyboard shortcuts/i)).toBeInTheDocument()
    expect(within(desktopNav).getByText(/^faq$/i)).toBeInTheDocument()
  })

  it('renders the new "What\'s new" section above existing content', () => {
    renderHelp()
    // Each section has an id matching its slug. The What's new
    // landmark should be present.
    const section = document.getElementById('whats-new')
    expect(section).not.toBeNull()
    expect(section?.textContent ?? '').toMatch(/drag empty canvas to pan/i)
    expect(section?.textContent ?? '').toMatch(/cmd/i)
  })

  it('search filters TOC and sections by heading text', () => {
    renderHelp()
    const searchBoxes = screen.getAllByRole('searchbox', { name: /search help/i })
    // Desktop input is the second one (after the mobile <details>'s input).
    fireEvent.change(searchBoxes[searchBoxes.length - 1], { target: { value: 'utilization' } })
    // Reports section mentions "utilization" — uniquely scoped.
    expect(document.getElementById('reports')).not.toBeNull()
    expect(document.getElementById('roster')).toBeNull()
    expect(document.getElementById('sharing')).toBeNull()
    expect(document.getElementById('audit-log')).toBeNull()
  })

  it('search is case-insensitive and matches body keywords', () => {
    renderHelp()
    const searchBoxes = screen.getAllByRole('searchbox', { name: /search help/i })
    fireEvent.change(searchBoxes[searchBoxes.length - 1], { target: { value: 'KONVA' } })
    // Map editor section mentions Konva in its body searchText.
    expect(document.getElementById('map-editor')).not.toBeNull()
    expect(document.getElementById('faq')).toBeNull()
  })

  it('shows results-count chip via aria-live status when searching', () => {
    renderHelp()
    const searchBoxes = screen.getAllByRole('searchbox', { name: /search help/i })
    fireEvent.change(searchBoxes[searchBoxes.length - 1], { target: { value: 'audit' } })
    // Multiple aria-live status nodes exist (count chip + copy
    // confirmation). Find the one announcing the section count.
    const statuses = screen.getAllByRole('status')
    const countChip = statuses.find((s) => /\d+\s+section/i.test(s.textContent ?? ''))
    expect(countChip).toBeDefined()
    expect(countChip?.textContent).toMatch(/section/i)
  })

  it('empty state renders with a Clear button when nothing matches', () => {
    renderHelp()
    const searchBoxes = screen.getAllByRole('searchbox', { name: /search help/i })
    fireEvent.change(searchBoxes[searchBoxes.length - 1], { target: { value: 'zzzzznotathing' } })
    // The empty-state message renders in both the TOC and the main
    // panel — at least one must be present.
    const emptyHits = screen.getAllByText(/no sections match/i)
    expect(emptyHits.length).toBeGreaterThan(0)
    // No section bodies remain mounted.
    expect(document.getElementById('faq')).toBeNull()
    expect(document.getElementById('roster')).toBeNull()
    // Clicking the Clear button restores all sections.
    const clearButtons = screen.getAllByRole('button', { name: /clear search|^clear$/i })
    fireEvent.click(clearButtons[0])
    expect(document.getElementById('faq')).not.toBeNull()
    expect(document.getElementById('roster')).not.toBeNull()
  })

  it('every section <h2> has a stable id for deep-linking', () => {
    renderHelp()
    for (const id of ['whats-new', 'getting-started', 'map-editor', 'roster', 'shortcuts', 'faq']) {
      // The section element itself carries the id; the h2 has
      // `heading-<id>` so aria-labelledby works.
      expect(document.getElementById(id)).not.toBeNull()
      expect(document.getElementById(`heading-${id}`)).not.toBeNull()
    }
  })

  it('clicking the # anchor next to a heading copies the deep-link to clipboard and announces it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText },
    })
    renderHelp()
    const copyBtn = screen.getByRole('button', { name: /copy link to getting started/i })
    fireEvent.click(copyBtn)
    expect(writeText).toHaveBeenCalledTimes(1)
    const arg = writeText.mock.calls[0][0] as string
    expect(arg).toMatch(/#getting-started$/)

    // The aria-live confirmation chip surfaces "Link copied" once the
    // promise resolves. Wait a microtask + a short timeout for React.
    await new Promise((r) => setTimeout(r, 20))
    // Status nodes include the TOC count chip; find the one announcing
    // the copy.
    const statuses = screen.getAllByRole('status')
    const copyStatus = statuses.find((s) => /link copied/i.test(s.textContent ?? ''))
    expect(copyStatus).toBeDefined()
  })
})
