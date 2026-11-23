/** Canonical, bounded JSON intent and result. Array order is financially significant. */
export function exactFinanceJson(value: unknown): string {
  let nodes = 0;
  const visit = (item: unknown, depth: number): unknown => {
    if (++nodes > 20000 || depth > 32) throw new TypeError("Aggregate JSON resource limit exceeded");
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (Array.isArray(item)) return item.map(value => visit(value, depth + 1));
    if (item && typeof item === "object" && Object.getPrototypeOf(item) === Object.prototype) {
      return Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, visit(value, depth + 1)]));
    }
    throw new TypeError("Aggregate intent and result must be synchronous JSON values");
  };
  const json = JSON.stringify(visit(value, 0));
  if (json.length > 262144) throw new TypeError("Aggregate JSON resource limit exceeded");
  return json;
}
