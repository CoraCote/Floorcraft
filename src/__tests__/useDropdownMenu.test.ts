import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDropdownMenu } from '../hooks/useDropdownMenu'

describe('useDropdownMenu', () => {
  it('starts closed and toggles open', () => {
    const { result } = renderHook(() => useDropdownMenu())
    expect(result.current.open).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.open).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.open).toBe(false)
  })

  it('close() forces the panel closed', () => {
    const { result } = renderHook(() => useDropdownMenu())
    act(() => result.current.toggle())
    expect(result.current.open).toBe(true)
    act(() => result.current.close())
    expect(result.current.open).toBe(false)
  })

  it('Escape on the panel closes it and refocuses the trigger', () => {
    const { result } = renderHook(() => useDropdownMenu())
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    // Patch the ref so the hook's Esc branch can call trigger.focus().
    Object.assign(result.current.triggerRef, { current: trigger })

    act(() => result.current.toggle())
    expect(result.current.open).toBe(true)

    act(() => {
      result.current.panelProps.onKeyDown({
        key: 'Escape',
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent<HTMLDivElement>)
    })
    expect(result.current.open).toBe(false)
    expect(document.activeElement).toBe(trigger)

    document.body.removeChild(trigger)
  })

  it('click-outside on the document closes an open panel', () => {
    const { result } = renderHook(() => useDropdownMenu())
    const panelEl = document.createElement('div')
    const triggerEl = document.createElement('button')
    const outsideEl = document.createElement('div')
    document.body.appendChild(panelEl)
    document.body.appendChild(triggerEl)
    document.body.appendChild(outsideEl)
    Object.assign(result.current.panelProps.ref, { current: panelEl })
    Object.assign(result.current.triggerRef, { current: triggerEl })

    act(() => result.current.toggle())
    expect(result.current.open).toBe(true)

    act(() => {
      const ev = new MouseEvent('mousedown', { bubbles: true })
      outsideEl.dispatchEvent(ev)
    })
    expect(result.current.open).toBe(false)

    document.body.removeChild(panelEl)
    document.body.removeChild(triggerEl)
    document.body.removeChild(outsideEl)
  })

  it('mousedown inside the panel does not close it', () => {
    const { result } = renderHook(() => useDropdownMenu())
    const panelEl = document.createElement('div')
    const inside = document.createElement('button')
    panelEl.appendChild(inside)
    document.body.appendChild(panelEl)
    Object.assign(result.current.panelProps.ref, { current: panelEl })

    act(() => result.current.toggle())
    expect(result.current.open).toBe(true)

    act(() => {
      const ev = new MouseEvent('mousedown', { bubbles: true })
      inside.dispatchEvent(ev)
    })
    expect(result.current.open).toBe(true)
    document.body.removeChild(panelEl)
  })

  it('registerItemRef stores and removes element references', () => {
    const { result } = renderHook(() => useDropdownMenu())
    act(() => result.current.toggle())
    const a = document.createElement('button')
    const b = document.createElement('button')
    document.body.appendChild(a)
    document.body.appendChild(b)
    act(() => {
      result.current.registerItemRef(0)(a)
      result.current.registerItemRef(1)(b)
    })
    // Moving the focus index down should focus the second element.
    act(() => {
      result.current.panelProps.onKeyDown({
        key: 'ArrowDown',
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent<HTMLDivElement>)
    })
    expect(document.activeElement).toBe(b)
    // Unregister — null passed in means the map drops the entry.
    act(() => {
      result.current.registerItemRef(1)(null)
    })
    // With only one entry left, arrow-down wraps back to index 0.
    act(() => {
      result.current.panelProps.onKeyDown({
        key: 'Home',
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent<HTMLDivElement>)
    })
    expect(result.current.focusedIndex).toBe(0)

    document.body.removeChild(a)
    document.body.removeChild(b)
  })

  it('Arrow Up/Down/Home/End move focusedIndex', () => {
    const { result } = renderHook(() => useDropdownMenu())
    act(() => result.current.toggle())
    const els = [0, 1, 2].map(() => {
      const el = document.createElement('button')
      document.body.appendChild(el)
      return el
    })
    act(() => {
      els.forEach((el, i) => result.current.registerItemRef(i)(el))
    })

    const fire = (key: string) =>
      act(() => {
        result.current.panelProps.onKeyDown({
          key,
          preventDefault: () => {},
        } as unknown as React.KeyboardEvent<HTMLDivElement>)
      })

    fire('ArrowDown')
    expect(result.current.focusedIndex).toBe(1)
    fire('End')
    expect(result.current.focusedIndex).toBe(2)
    fire('ArrowDown') // wraps to 0
    expect(result.current.focusedIndex).toBe(0)
    fire('ArrowUp') // wraps to 2
    expect(result.current.focusedIndex).toBe(2)
    fire('Home')
    expect(result.current.focusedIndex).toBe(0)

    els.forEach((el) => document.body.removeChild(el))
  })

  it('Tab closes the panel', () => {
    const { result } = renderHook(() => useDropdownMenu())
    act(() => result.current.toggle())
    act(() => {
      result.current.panelProps.onKeyDown({
        key: 'Tab',
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent<HTMLDivElement>)
    })
    expect(result.current.open).toBe(false)
  })

  it('trigger Enter/ArrowDown/Space opens the panel', () => {
    const { result } = renderHook(() => useDropdownMenu())
    for (const key of ['Enter', 'ArrowDown', ' ']) {
      act(() => result.current.close())
      act(() => {
        result.current.triggerProps.onKeyDown({
          key,
          preventDefault: () => {},
        } as unknown as React.KeyboardEvent<HTMLButtonElement>)
      })
      expect(result.current.open).toBe(true)
    }
  })
})
