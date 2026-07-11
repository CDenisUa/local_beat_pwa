// Core
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

// jsdom has no HTMLMediaElement playback engine — stub the bits the app touches
// so play()/pause() dispatch real events (driving the store's own listeners,
// just like a real browser) and readyState reflects a loaded source.
if (typeof HTMLMediaElement !== 'undefined') {
  const pausedState = new WeakMap<HTMLMediaElement, boolean>()
  const readyStateMap = new WeakMap<HTMLMediaElement, number>()

  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return pausedState.get(this) ?? true
    },
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return readyStateMap.get(this) ?? 0
    },
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value(this: HTMLMediaElement) {
      pausedState.set(this, false)
      this.dispatchEvent(new Event('play'))
      return Promise.resolve()
    },
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value(this: HTMLMediaElement) {
      pausedState.set(this, true)
      this.dispatchEvent(new Event('pause'))
    },
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    value(this: HTMLMediaElement) {
      readyStateMap.set(this, 1)
    },
  })
}

if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = () => 'blob:mock-url'
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = () => {}
}
