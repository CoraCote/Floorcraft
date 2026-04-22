import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LibraryPreview } from '../components/editor/LeftSidebar/LibraryPreview'
import type { LibraryItem } from '../components/editor/LeftSidebar/ElementLibrary'

function snap(item: LibraryItem) {
  const { container } = render(<LibraryPreview item={item} />)
  return container.firstElementChild?.outerHTML ?? ''
}

describe('LibraryPreview', () => {
  it('round table renders an ellipse', () => {
    const html = snap({ type: 'table-round', label: 'Round', category: 'Tables' })
    expect(html).toMatch(/<ellipse/)
  })

  it('column renders a small circle', () => {
    const html = snap({ type: 'decor', shape: 'column', label: 'Column', category: 'Structure' })
    expect(html).toMatch(/<circle/)
    expect(html).not.toMatch(/<rect[^>]*(width="22"|width="24")/)
  })

  it('stairs renders three horizontal lines inside a rect', () => {
    const html = snap({ type: 'decor', shape: 'stairs', label: 'Stairs', category: 'Structure' })
    // 1 outer rect + 3 line siblings
    expect(html.match(/<line/g)?.length).toBe(3)
    expect(html).toMatch(/<rect/)
  })

  it('text-label renders the letter T', () => {
    const html = snap({ type: 'text-label', label: 'Text', category: 'Other' })
    expect(html).toMatch(/<text[^>]*>T</)
  })

  it('rect table falls through to the default proportional rect', () => {
    const html = snap({ type: 'table-rect', label: 'Rect Table', category: 'Tables' })
    expect(html).toMatch(/<rect/)
    expect(html).not.toMatch(/<ellipse/)
  })

  it('elevator has two crossing lines', () => {
    const html = snap({ type: 'decor', shape: 'elevator', label: 'Elevator', category: 'Structure' })
    expect(html.match(/<line/g)?.length).toBe(2)
  })
})
