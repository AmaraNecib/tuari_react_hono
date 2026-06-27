/**
 * Group items by a key function.
 * Used for organizing data by category, status, etc.
 */
export function groupItemsBy<T>(items: readonly T[], getKey: (item: T) => string | null | undefined) {
  const groupedItems = new Map<string, T[]>()

  for (const item of items) {
    const key = getKey(item)

    if (!key) {
      continue
    }

    const group = groupedItems.get(key)

    if (group) {
      group.push(item)
      continue
    }

    groupedItems.set(key, [item])
  }

  return groupedItems
}

export function countItemsBy<T>(items: readonly T[], getKey: (item: T) => string | null | undefined) {
  const counts = new Map<string, number>()

  for (const item of items) {
    const key = getKey(item)

    if (!key) {
      continue
    }

    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return counts
}

export function collectIds<T>(items: readonly T[], getId: (item: T) => string | null | undefined) {
  const ids = new Set<string>()

  for (const item of items) {
    const id = getId(item)

    if (id) {
      ids.add(id)
    }
  }

  return ids
}
