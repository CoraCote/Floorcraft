import '@testing-library/jest-dom'

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
