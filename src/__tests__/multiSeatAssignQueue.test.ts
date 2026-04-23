import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '../stores/uiStore'

beforeEach(() => {
  useUIStore.setState({ assignmentQueue: [] })
})

describe('uiStore assignmentQueue', () => {
  it('setAssignmentQueue replaces the queue', () => {
    useUIStore.getState().setAssignmentQueue(['a', 'b', 'c'])
    expect(useUIStore.getState().assignmentQueue).toEqual(['a', 'b', 'c'])
  })

  it('clearAssignmentQueue empties it', () => {
    useUIStore.getState().setAssignmentQueue(['a'])
    useUIStore.getState().clearAssignmentQueue()
    expect(useUIStore.getState().assignmentQueue).toEqual([])
  })
})
