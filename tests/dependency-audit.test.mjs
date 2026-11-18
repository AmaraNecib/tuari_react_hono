import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { auditOnce, evaluateAudit } from '../scripts/ci/dependency-audit.mjs';

const expiresAt = '2026-11-25T13:10:25Z';
function report(advisories = [], overrides = {}) {
  const entries = Object.fromEntries(advisories.map((item, index) => [String(index + 1), {
    github_advisory_id: item.id ?? 'GHSA-fc5q-39xc-vjpf', module_name: item.module ?? 'picomatch',
    severity: item.severity ?? 'high', findings: (item.versions ?? ['2.3.2']).map((version) => ({ version, paths: ['root>picomatch'] })),
  }]));
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const item of Object.values(entries)) counts[item.severity] += item.findings.length;
  return { actions: [], advisories: entries, muted: [], metadata: { vulnerabilities: { ...counts, ...(overrides.counts ?? {}) }, totalDependencies: 10, dependencies: 10, devDependencies: 0, optionalDependencies: 0 }, ...overrides.report };
}
const allowed = (versions) => ({ versions });

test('allows only the exact advisory and known installed picomatch versions before expiry', () => {
  for (const version of ['2.3.2', '4.0.4', '4.0.7']) {
    assert.equal(evaluateAudit(report([allowed([version])]), { now: '2026-11-25T13:10:24Z', expiresAt, exitCode: 1 }).pass, true);
  }
});

test('the exception expires at its exact UTC deadline, even for only the allowed advisory', () => {
  for (const now of [expiresAt, '2026-11-25T13:10:26Z']) {
    const result = evaluateAudit(report([allowed(['4.0.7'])]), { now, expiresAt, exitCode: 1 });
    assert.equal(result.pass, false);
    assert.match(result.reason, /expired/);
  }
});

test('clean audit passes after expiry and reports the obsolete exception', () => {
  const result = evaluateAudit(report(), { now: '2026-11-25T13:10:25Z', expiresAt });
  assert.equal(result.pass, true);
  assert.match(result.message, /remove obsolete picomatch exception/i);
});

test('rejects every muted advisory even when the listed finding is allowed', () => {
  const base = report([allowed(['4.0.7'])]);
  const input = { ...base, muted: [{ github_advisory_id: 'GHSA-hidden', module_name: 'other-package', severity: 'high' }] };
  assert.equal(evaluateAudit(input, { now: '2026-11-20T00:00:00Z', expiresAt, exitCode: 1 }).pass, false);
});

test('rejects a severity downgrade for the exact exception advisory', () => {
  for (const severity of ['moderate', 'low']) {
    const input = report([{ id: 'GHSA-fc5q-39xc-vjpf', module: 'picomatch', severity, versions: ['4.0.7'] }]);
    assert.equal(evaluateAudit(input, { now: '2026-11-20T00:00:00Z', expiresAt }).pass, false, `${severity} severity must not weaken the exact exception`);
  }
});

test('rejects the exception advisory with a mismatched package or version at low severity', () => {
  for (const item of [
    { id: 'GHSA-fc5q-39xc-vjpf', module: 'other-package', severity: 'low', versions: ['4.0.7'] },
    { id: 'GHSA-fc5q-39xc-vjpf', module: 'picomatch', severity: 'moderate', versions: ['4.0.8'] },
  ]) assert.equal(evaluateAudit(report([item]), { now: '2026-11-20T00:00:00Z', expiresAt }).pass, false);
});

test('fails for a different GHSA, package, version, or severity', () => {
  for (const item of [
    { id: 'GHSA-other', versions: ['4.0.7'] },
    { module: 'other-package', versions: ['4.0.7'] },
    { versions: ['4.0.8'] },
    { severity: 'critical', versions: ['4.0.7'] },
  ]) assert.equal(evaluateAudit(report([item]), { now: '2026-11-20T00:00:00Z', expiresAt }).pass, false);
});

test('every other high or critical finding fails while low and moderate remain reportable', () => {
  assert.equal(evaluateAudit(report([allowed(['4.0.7']), { id: 'GHSA-other', versions: ['1.0.0'] }]), { now: '2026-11-20T00:00:00Z', expiresAt }).pass, false);
  for (const severity of ['low', 'moderate']) assert.equal(evaluateAudit(report([{ id: 'GHSA-other', severity }]), { now: '2026-11-20T00:00:00Z', expiresAt }).pass, true);
});

test('fails closed on malformed structures and absent advisory identity', () => {
  for (const input of [null, {}, { advisories: null }, report([allowed(['4.0.7'])], { report: { advisories: { 1: { module_name: 'picomatch', severity: 'high', findings: [] } } } })]) {
    assert.equal(evaluateAudit(input, { now: '2026-11-20T00:00:00Z', expiresAt }).pass, false);
  }
});

test('summary counts must match findings and cannot conceal an unknown high finding', () => {
  const inconsistent = report([allowed(['4.0.7'])], { counts: { high: 0 } });
  assert.equal(evaluateAudit(inconsistent, { now: '2026-11-20T00:00:00Z', expiresAt }).pass, false);
  const hidden = report([allowed(['4.0.7']), { id: 'GHSA-other', versions: ['1.0.0'] }], { counts: { high: 1 } });
  assert.equal(evaluateAudit(hidden, { now: '2026-11-20T00:00:00Z', expiresAt }).pass, false);
});

test('CLI integration preserves JSON, stderr, and native exit status from a fake pnpm process', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dependency-audit-'));
  try {
    const fake = path.join(dir, 'fake-pnpm.mjs');
    const audit = report([allowed(['4.0.7'])]);
    writeFileSync(fake, `if (process.argv.slice(2).join(' ') !== 'audit --json --audit-level high') process.exit(4); process.stdout.write(${JSON.stringify(JSON.stringify(audit))}); process.stderr.write(${JSON.stringify('audit reported vulnerabilities\\n')}); process.exit(1);`);
    const result = auditOnce({ command: process.execPath, args: [fake, 'audit', '--json', '--audit-level', 'high'], platform: process.platform, now: '2026-11-20T00:00:00Z' });
    assert.equal(result.pass, true);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, JSON.stringify(audit));
    assert.equal(result.stderr, 'audit reported vulnerabilities\\n');
    writeFileSync(fake, `process.stdout.write(${JSON.stringify('{truncated')}); process.exit(1);`);
    const malformed = auditOnce({ command: process.execPath, args: [fake], platform: 'linux' });
    assert.equal(malformed.pass, false);
    assert.match(malformed.reason, /valid JSON/);
    const unavailable = auditOnce({ command: path.join(dir, 'missing-pnpm'), platform: 'linux' });
    assert.equal(unavailable.pass, false);
    assert.match(unavailable.reason, /could not run/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('nonzero exit passes only for a valid vulnerability report allowed by policy', () => {
  assert.equal(evaluateAudit(report([allowed(['4.0.7'])]), { now: '2026-11-20T00:00:00Z', expiresAt, exitCode: 1 }).pass, true);
  assert.equal(evaluateAudit(report(), { now: '2026-11-20T00:00:00Z', expiresAt, exitCode: 1 }).pass, false);
  assert.equal(evaluateAudit(null, { now: '2026-11-20T00:00:00Z', expiresAt, exitCode: 1 }).pass, false);
  assert.equal(evaluateAudit(report([allowed(['4.0.7'])]), { now: '2026-11-20T00:00:00Z', expiresAt, exitCode: 2 }).pass, false);
  assert.equal(evaluateAudit(report([allowed(['4.0.7'])]), { now: '2026-11-20T00:00:00Z', expiresAt, exitCode: 0 }).pass, false);
});
