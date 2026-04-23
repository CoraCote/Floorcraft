import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '../stores/toastStore'

beforeEach(() => {
  useToastStore.setState({ items: [] })
})

describe('toastStore', () => {
  it('pushes a toast with a generated id', () => {
    const id = useToastStore.getState().push({ tone: 'info', title: 'Hi' })
    expect(typeof id).toBe('string')
    expect(useToastStore.getState().items).toHaveLength(1)
    expect(useToastStore.getState().items[0]).toMatchObject({ tone: 'info', title: 'Hi', id })
  })

  it('dismisses by id', () => {
    const id = useToastStore.getState().push({ tone: 'warning', title: 'Heads up' })
    useToastStore.getState().dismiss(id)
    expect(useToastStore.getState().items).toHaveLength(0)
  })

  it('caps items at 3 (drops oldest)', () => {
    const s = useToastStore.getState()
    s.push({ tone: 'info', title: 'A' })
    s.push({ tone: 'info', title: 'B' })
    s.push({ tone: 'info', title: 'C' })
    s.push({ tone: 'info', title: 'D' })
    const titles = useToastStore.getState().items.map((i) => i.title)
    expect(titles).toEqual(['B', 'C', 'D'])
  })

  it('supports an optional action with a callback', () => {
    const onClick = vi.fn()
    useToastStore.getState().push({
      tone: 'warning',
      title: 'Something',
      action: { label: 'Fix', onClick },
    })
    useToastStore.getState().items[0].action?.onClick()
    expect(onClick).toHaveBeenCalledOnce()
  })
})
