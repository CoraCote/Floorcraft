import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConflictModal } from '../components/editor/ConflictModal'

describe('ConflictModal', () => {
  it('calls reload/overwrite/cancel on respective buttons', () => {
    const reload = vi.fn()
    const overwrite = vi.fn()
    const onCancel = vi.fn()
    render(<ConflictModal onReload={reload} onOverwrite={overwrite} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /reload/i }))
    expect(reload).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /overwrite/i }))
    expect(overwrite).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('renders as an accessible dialog', () => {
    render(<ConflictModal onReload={() => {}} onOverwrite={() => {}} onCancel={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })
})
