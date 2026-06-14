/** Fisher–Yates shuffle returning a new array. */
export function shuffleArray<T>(input: readonly T[]): T[] {
  const arr = input.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Build a shuffled queue that, when possible, does not start with `firstId`
 * so the same track does not immediately repeat after the one just played.
 */
export function buildShuffledQueue(ids: readonly string[], firstId?: string): string[] {
  if (ids.length <= 1) return ids.slice()
  let queue = shuffleArray(ids)
  if (firstId && queue[0] === firstId) {
    const swapWith = 1 + Math.floor(Math.random() * (queue.length - 1))
    ;[queue[0], queue[swapWith]] = [queue[swapWith], queue[0]]
  }
  return queue
}
