import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button, Input, Modal, ModalBody, ModalFooter } from '../components/ui'

describe('Button', () => {
  it('renders children, forwards disabled, and applies variant class', () => {
    render(
      <Button variant="primary" disabled>
        Save
      </Button>,
    )
    const btn = screen.getByRole('button', { name: /save/i })
    expect(btn).toBeDisabled()
    expect(btn.className).toMatch(/bg-blue-600/)
  })
})

describe('Input', () => {
  it('forwards ref and applies invalid class when `invalid`', () => {
    const ref = createRef<HTMLInputElement>()
    const { rerender } = render(<Input ref={ref} defaultValue="hi" />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
    expect(ref.current?.className).toMatch(/border-gray-300/)

    rerender(<Input ref={ref} defaultValue="hi" invalid />)
    expect(ref.current?.className).toMatch(/border-red-500/)
    expect(ref.current).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('Modal', () => {
  it('renders nothing when open=false', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        <ModalBody>should not appear</ModalBody>
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText(/should not appear/i)).toBeNull()
  })

  it('renders children + fires onClose on Escape and backdrop click', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Modal open onClose={onClose} title="Hello">
        <ModalBody>hi there</ModalBody>
        <ModalFooter>footer</ModalFooter>
      </Modal>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/hi there/i)).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    const backdrop = screen.getByTestId('modal-backdrop')
    fireEvent.mouseDown(backdrop, { target: backdrop, currentTarget: backdrop })
    expect(onClose).toHaveBeenCalledTimes(2)

    // preventBackdropClose stops the backdrop-click path but keeps Escape working
    onClose.mockClear()
    rerender(
      <Modal open onClose={onClose} title="Hello" preventBackdropClose>
        <ModalBody>hi there</ModalBody>
      </Modal>,
    )
    const backdrop2 = screen.getByTestId('modal-backdrop')
    fireEvent.mouseDown(backdrop2, { target: backdrop2, currentTarget: backdrop2 })
    expect(onClose).not.toHaveBeenCalled()
  })
})
