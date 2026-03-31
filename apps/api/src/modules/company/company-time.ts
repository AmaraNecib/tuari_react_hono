export function createAlgeriaTimestamp(date = new Date()) {
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString().replace("Z", "+01:00")
}

export function normalizeAlgeriaTimestamp(value: string | undefined) {
  return value ?? createAlgeriaTimestamp()
}

export function compareTimestampsDesc(left: string, right: string) {
  return new Date(right).getTime() - new Date(left).getTime()
}
