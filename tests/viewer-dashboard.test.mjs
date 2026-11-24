import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overview, signatures, timeline, lookup, context } from '../scripts/viewer/model.mjs';
const a = { timestamp: '2026-01-02T23:30:00-03:00', level: 'error', signature: 'error:42', errorCode: 42, count: 3, source: 'app' };
const b = { ...a, timestamp: '2026-01-04T00:00:00Z', count: 1 };
const c = { ...a, timestamp: '2026-01-03T01:00:00Z', signature: 'info', level: 'info', errorCode: null, count: 1 };
const data = { productPrefix: 'TUARI', manifest: { version: '0.9.2', os: 'windows', build: 'abc', createdAt: '2026-01-04T01:00:00Z' }, events: [b, a, c], warnings: [] };
test('overview derives UTC days and counts occurrences, without inventing metadata', () => {
  assert.deepEqual(overview(data), { product: 'TUARI', version: '0.9.2', os: 'windows', build: 'abc', bundleDate: data.manifest.createdAt, events: 5, records: 3, days: ['2026-01-03', '2026-01-04'] });
  assert.equal(overview({ events: [] }).version, 'Unavailable');
  assert.deepEqual(overview({ events: [] }).days, []);
});
test('signatures group only errors, weight count, order by frequency and use manifest provenance', () => {
  const groups = signatures({ ...data, events: [...data.events, { ...b, signature: 'crash', count: 8 }] });
  assert.deepEqual(groups.map(g => [g.signature, g.count]), [['crash', 8], ['error:42', 4]]);
  assert.equal(groups[1].first, a.timestamp);
  assert.equal(groups[1].last, b.timestamp);
  assert.deepEqual(groups[1].versions, ['0.9.2']);
  assert.deepEqual(groups[1].oses, ['windows']);
});
test('timeline intersects day, level and signature filters, preserving stable event identities', () => {
  assert.deepEqual(timeline(data, { day: '2026-01-03', level: 'error', signature: 'error:42' }).map(e => e.id), [1]);
  assert.deepEqual(timeline(data).map(e => e.id), [2, 1, 0]);
  assert.equal(timeline(data, { level: 'fatal' }).length, 0);
});
test('filtering, lookup and context reuse the ordered records of one report', () => {
  const report = { ...data };
  const first = timeline(report)[0];
  assert.strictEqual(timeline(report, { level: 'info' })[0], first);
  assert.strictEqual(context(report, first.id, 0)[0], first);
  assert.strictEqual(lookup(report, 'ANY-0000002A')[0], timeline(report)[1]);
});

test('lookup ignores prefix and case, returns all collisions, and context uses unfiltered chronology', () => {
  assert.deepEqual(lookup(data, '  OTHER-PRODUCT-0000002a ').map(e => e.id), [1, 0]);
  for (const invalid of ['42', 'TUARI-2A', 'TUARI-0000002G', '<img>-0000002A']) assert.deepEqual(lookup(data, invalid), []);
  assert.deepEqual(context(data, 1, 1).map(e => e.id), [2, 1, 0]);
  assert.deepEqual(context(data, 99), []);
});
