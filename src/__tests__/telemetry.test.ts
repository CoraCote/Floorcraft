import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  captureException,
  registerTelemetrySink,
  getTelemetrySink,
} from '../lib/telemetry'

describe('telemetry', () => {
  // Each test starts with no sink so a leftover from another suite can't
  // bleed into the assertion. Console is silenced because we genuinely
  // expect `captureException` to log every call.
  beforeEach(() => {
    registerTelemetrySink(null)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    registerTelemetrySink(null)
  })

  it('logs to console even when no sink is registered', () => {
    const err = new Error('boom')
    captureException(err)
    expect(console.error).toHaveBeenCalled()
  })

  it('forwards to a registered sink', () => {
    const sink = { captureException: vi.fn() }
    registerTelemetrySink(sink)
    const err = new Error('boom')
    captureException(err, { scope: 'test', extra: { a: 1 } })
    expect(sink.captureException).toHaveBeenCalledTimes(1)
    expect(sink.captureException).toHaveBeenCalledWith(err, {
      scope: 'test',
      extra: { a: 1 },
    })
  })

  it('replaces the sink on re-registration', () => {
    const first = { captureException: vi.fn() }
    const second = { captureException: vi.fn() }
    registerTelemetrySink(first)
    registerTelemetrySink(second)
    captureException(new Error('x'))
    expect(first.captureException).not.toHaveBeenCalled()
    expect(second.captureException).toHaveBeenCalledTimes(1)
  })

  it('clears the sink when called with null', () => {
    registerTelemetrySink({ captureException: vi.fn() })
    expect(getTelemetrySink()).not.toBeNull()
    registerTelemetrySink(null)
    expect(getTelemetrySink()).toBeNull()
  })

  it('does not propagate sink errors back to the caller', () => {
    // A telemetry vendor throwing during report must NOT escalate into a
    // second crash inside the React error boundary that called us.
    registerTelemetrySink({
      captureException: () => {
        throw new Error('vendor-broke')
      },
    })
    expect(() => captureException(new Error('original'))).not.toThrow()
    // Both the original error and the sink error should have been logged
    // — once for the original report, once for the sink failure.
    expect(console.error).toHaveBeenCalledTimes(2)
  })
})
