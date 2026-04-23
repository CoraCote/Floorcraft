import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Provide default Supabase env vars for all tests. Several modules touch
// the supabase client transitively (e.g. audit emission wiring lives in
// the same stores that unit tests already exercise). Individual tests
// that specifically want to test the "missing env" path can still
// vi.stubEnv('VITE_SUPABASE_URL', '') + vi.resetModules() inside their
// own beforeEach — see supabase.test.ts for the pattern.
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon')

// jsdom 29 ships a stub localStorage that emits a "--localstorage-file"
// warning and returns objects missing setItem/getItem when no file is
// configured. Swap in a simple in-memory implementation so hooks that
// read/write localStorage (e.g. zustand persist) work reliably in tests.
function installLocalStorageShim() {
  const proto = Object.getPrototypeOf(globalThis.localStorage ?? {})
  if (proto && typeof proto.setItem === 'function') return
  const store = new Map<string, string>()
  const shim = {
    get length() { return store.size },
    clear() { store.clear() },
    getItem(key: string) { return store.has(key) ? store.get(key)! : null },
    setItem(key: string, value: string) { store.set(key, String(value)) },
    removeItem(key: string) { store.delete(key) },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: shim,
      writable: true,
      configurable: true,
    })
  }
}

installLocalStorageShim()
