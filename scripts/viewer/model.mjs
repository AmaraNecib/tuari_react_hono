// Event IDs are original row positions, never signature or error-code IDs.
const unavailable = 'Unavailable';
// Each report is an immutable JSON snapshot. Share its chronology across views.
const chronologies = new WeakMap();
export function timeline(data, filters) {
  let records = chronologies.get(data);
  if (!records) {
    records = (data.events ?? []).map((event, id) => ({ ...event, id }))
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id - b.id);
    chronologies.set(data, records);
  }
  return !filters ? records : records.filter(event => (!filters.day || day(event.timestamp) === filters.day) && (!filters.level || event.level === filters.level) && (!filters.signature || event.signature === filters.signature));
}
function day(timestamp) { return new Date(timestamp).toISOString().slice(0, 10); }
export function overview(data) {
  const manifest = data.manifest ?? {};
  return { product: manifest.product ?? data.productPrefix ?? unavailable, version: manifest.version ?? unavailable, os: manifest.os ?? unavailable, build: manifest.build ?? unavailable, bundleDate: manifest.createdAt ?? unavailable, events: (data.events ?? []).reduce((sum, event) => sum + event.count, 0), records: (data.events ?? []).length, days: [...new Set((data.events ?? []).map(event => day(event.timestamp)))].sort() };
}
export function signatures(data) {
  const groups = new Map();
  for (const event of timeline(data)) {
    if (!['error', 'fatal'].includes(event.level)) continue;
    const group = groups.get(event.signature) ?? { signature: event.signature, count: 0, first: event.timestamp, last: event.timestamp, versions: [data.manifest?.version ?? unavailable], oses: [data.manifest?.os ?? unavailable] };
    group.count += event.count;
    group.last = event.timestamp;
    groups.set(event.signature, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));
}
export function lookup(data, input) {
  const hex = input.trim().match(/^[A-Za-z][A-Za-z0-9_-]*-([0-9a-f]{8})$/i)?.[1];
  return hex ? timeline(data).filter(event => event.errorCode === Number.parseInt(hex, 16)) : [];
}
export function context(data, id, radius = 3) {
  const events = timeline(data);
  const index = events.findIndex(event => event.id === id);
  return index < 0 ? [] : events.slice(Math.max(0, index - radius), index + radius + 1);
}
