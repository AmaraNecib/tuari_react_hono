export function createKeyedAsyncTestLock() {
  const tails = new Map<string, Promise<void>>()

  return async function runExclusive<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const previous = tails.get(name) ?? Promise.resolve()
    let release = () => {}
    const tail = new Promise<void>(resolve => { release = resolve })
    tails.set(name, tail)
    await previous
    try { return await operation() }
    finally { release(); if (tails.get(name) === tail) tails.delete(name) }
  }
}
