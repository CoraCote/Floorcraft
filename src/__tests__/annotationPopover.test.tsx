/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRef } from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { AnnotationPopover, setLastPinAnchor } from '../components/editor/Canvas/AnnotationPopover'
import { useAnnotationsStore } from '../stores/annotationsStore'
import { useProjectStore } from '../stores/projectStore'
import type { Annotation } from '../types/annotations'

// `useSession` is read by `useAuthorName` for the create flow; stub a stable
// authenticated session so the author defaults to "test" without dragging in
// the real auth provider.
vi.mock('../lib/auth/session', () => ({
  useSession: () => ({
    status: 'authenticated',
    user: { id: 'u1', email: 'test@example.com' },
  }),
}))

function Harness() {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div>
      <div
        ref={ref}
        data-testid="canvas-container"
        style={{ width: 800, height: 600 }}
      />
      <AnnotationPopover containerRef={ref} />
    </div>
  )
}

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'a1',
    body: 'Hello world',
    authorName: 'jane.doe',
    createdAt: '2026-04-24T10:00:00.000Z',
    resolvedAt: null,
    anchor: { type: 'floor-position', floorId: 'f1', x: 100, y: 100 },
    ...overrides,
  }
}

beforeEach(() => {
  useAnnotationsStore.setState({
    annotations: {},
    activeAnnotationId: null,
    draft: null,
  } as any)
  useProjectStore.setState({
    currentOfficeRole: 'space-planner',
    impersonatedRole: null,
  } as any)
  setLastPinAnchor({ x: 100, y: 100 })
})

describe('AnnotationPopover — create flow', () => {
  it('opens with focus on the text input', async () => {
    useAnnotationsStore.setState({
      draft: {
        anchor: { type: 'floor-position', floorId: 'f1', x: 100, y: 100 },
        screenX: 100,
        screenY: 100,
      },
    } as any)
    render(<Harness />)
    // RAF-deferred autofocus — wait for it.
    await waitFor(() => {
      const ta = screen.getByPlaceholderText(/Add a note/)
      expect(document.activeElement).toBe(ta)
    })
  })

  it('renders the polished header with type label and close button', () => {
    useAnnotationsStore.setState({
      draft: {
        anchor: { type: 'floor-position', floorId: 'f1', x: 100, y: 100 },
        screenX: 100,
        screenY: 100,
      },
    } as any)
    render(<Harness />)
    expect(screen.getByText('New annotation')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Close annotation editor/i }),
    ).toBeInTheDocument()
    // role=dialog with aria-modal
    const dlg = screen.getByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
  })

  it('Escape closes the create popover', async () => {
    useAnnotationsStore.setState({
      draft: {
        anchor: { type: 'floor-position', floorId: 'f1', x: 100, y: 100 },
        screenX: 100,
        screenY: 100,
      },
    } as any)
    render(<Harness />)
    const ta = await screen.findByPlaceholderText(/Add a note/)
    fireEvent.keyDown(ta, { key: 'Escape' })
    expect(useAnnotationsStore.getState().draft).toBeNull()
  })

  it('Enter in textarea saves a non-empty body', async () => {
    useAnnotationsStore.setState({
      draft: {
        anchor: { type: 'floor-position', floorId: 'f1', x: 100, y: 100 },
        screenX: 100,
        screenY: 100,
      },
    } as any)
    render(<Harness />)
    const ta = await screen.findByPlaceholderText(/Add a note/)
    fireEvent.change(ta, { target: { value: 'Move this desk' } })
    fireEvent.keyDown(ta, { key: 'Enter' })
    const state = useAnnotationsStore.getState()
    expect(state.draft).toBeNull()
    const created = Object.values(state.annotations)
    expect(created).toHaveLength(1)
    expect(created[0].body).toBe('Move this desk')
  })

  it('Shift+Enter does not save (allows newline insertion)', async () => {
    useAnnotationsStore.setState({
      draft: {
        anchor: { type: 'floor-position', floorId: 'f1', x: 100, y: 100 },
        screenX: 100,
        screenY: 100,
      },
    } as any)
    render(<Harness />)
    const ta = await screen.findByPlaceholderText(/Add a note/)
    fireEvent.change(ta, { target: { value: 'line1' } })
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true })
    // Draft is still active; no annotation was created.
    expect(useAnnotationsStore.getState().draft).not.toBeNull()
    expect(Object.values(useAnnotationsStore.getState().annotations)).toHaveLength(
      0,
    )
  })

  it('clicking the close button cancels the draft', () => {
    useAnnotationsStore.setState({
      draft: {
        anchor: { type: 'floor-position', floorId: 'f1', x: 100, y: 100 },
        screenX: 100,
        screenY: 100,
      },
    } as any)
    render(<Harness />)
    const close = screen.getByRole('button', { name: /Close annotation editor/i })
    fireEvent.click(close)
    expect(useAnnotationsStore.getState().draft).toBeNull()
  })

  it('clicking Cancel closes the draft', () => {
    useAnnotationsStore.setState({
      draft: {
        anchor: { type: 'floor-position', floorId: 'f1', x: 100, y: 100 },
        screenX: 100,
        screenY: 100,
      },
    } as any)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(useAnnotationsStore.getState().draft).toBeNull()
  })
})

describe('AnnotationPopover — view flow', () => {
  it('renders an existing annotation with delete and resolve actions', () => {
    const a = makeAnnotation()
    useAnnotationsStore.setState({
      annotations: { [a.id]: a },
      activeAnnotationId: a.id,
    } as any)
    render(<Harness />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText('jane.doe')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('Escape closes the view popover', () => {
    const a = makeAnnotation()
    useAnnotationsStore.setState({
      annotations: { [a.id]: a },
      activeAnnotationId: a.id,
    } as any)
    render(<Harness />)
    const dlg = screen.getByRole('dialog')
    fireEvent.keyDown(dlg, { key: 'Escape' })
    expect(useAnnotationsStore.getState().activeAnnotationId).toBeNull()
  })

  it('header close button closes the view popover', () => {
    const a = makeAnnotation()
    useAnnotationsStore.setState({
      annotations: { [a.id]: a },
      activeAnnotationId: a.id,
    } as any)
    render(<Harness />)
    fireEvent.click(
      screen.getByRole('button', { name: /Close annotation editor/i }),
    )
    expect(useAnnotationsStore.getState().activeAnnotationId).toBeNull()
  })

  it('Delete button removes the annotation and closes', () => {
    const a = makeAnnotation()
    useAnnotationsStore.setState({
      annotations: { [a.id]: a },
      activeAnnotationId: a.id,
    } as any)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const state = useAnnotationsStore.getState()
    expect(state.activeAnnotationId).toBeNull()
    expect(state.annotations[a.id]).toBeUndefined()
  })

  it('Edit → Save commits a body change', async () => {
    const a = makeAnnotation()
    useAnnotationsStore.setState({
      annotations: { [a.id]: a },
      activeAnnotationId: a.id,
    } as any)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const ta = (await screen.findByDisplayValue('Hello world')) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'Hello edited' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(useAnnotationsStore.getState().annotations[a.id].body).toBe(
      'Hello edited',
    )
  })

  it('Resolve toggles resolvedAt and closes', () => {
    const a = makeAnnotation()
    useAnnotationsStore.setState({
      annotations: { [a.id]: a },
      activeAnnotationId: a.id,
    } as any)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    const state = useAnnotationsStore.getState()
    expect(state.activeAnnotationId).toBeNull()
    expect(state.annotations[a.id].resolvedAt).not.toBeNull()
  })

  it('viewer (no edit perms) sees only a Close button — no Delete/Edit/Resolve', () => {
    useProjectStore.setState({
      currentOfficeRole: 'shareViewer',
      impersonatedRole: null,
    } as any)
    const a = makeAnnotation()
    useAnnotationsStore.setState({
      annotations: { [a.id]: a },
      activeAnnotationId: a.id,
    } as any)
    render(<Harness />)
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('focus trap: Tab from last focusable wraps to the first', async () => {
    const a = makeAnnotation()
    useAnnotationsStore.setState({
      annotations: { [a.id]: a },
      activeAnnotationId: a.id,
    } as any)
    render(<Harness />)
    const dlg = screen.getByRole('dialog')
    const focusables = dlg.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled])',
    )
    expect(focusables.length).toBeGreaterThan(1)
    const last = focusables[focusables.length - 1]
    const first = focusables[0]
    act(() => {
      last.focus()
    })
    fireEvent.keyDown(dlg, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })
})
