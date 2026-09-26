// generate-license.test.mjs — Tests for the license signing CLI
//
// Run: node --test tests/generate-license.test.mjs
//
// Every test mints with a throwaway keypair generated in a temp dir; the
// vendor key never appears in the repo or the test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  parseSeatCount,
  normalizeLicenseType,
  normalizeValidUntil,
  assertExpiryForType,
} from '../scripts/generate-license.mjs';

const scriptPath = fileURLToPath(
  new URL('../scripts/generate-license.mjs', import.meta.url),
);

async function makeTestKey(dir) {
  const { privateKey } = generateKeyPairSync('ed25519');
  const keyPath = join(dir, 'test-signing.pem');
  await writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  return keyPath;
}

function runCli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
}

function decodePayload(license) {
  const [payloadB64] = license.trim().split('.');
  return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
}

test('parseSeatCount accepts non-negative integers and rejects typos', () => {
  assert.equal(parseSeatCount(undefined), 1);
  assert.equal(parseSeatCount('0'), 0);
  assert.equal(parseSeatCount('10'), 10);

  for (const bad of ['ten', '-1', '1.5', '1e3', ' 3', '0x10', '']) {
    assert.throws(() => parseSeatCount(bad), /--max-users/, `accepted ${bad}`);
  }
});

test('normalizeLicenseType defaults to perpetual and rejects unknowns', () => {
  assert.equal(normalizeLicenseType(undefined), 'perpetual');
  assert.equal(normalizeLicenseType('trial'), 'trial');
  assert.throws(() => normalizeLicenseType('perpetual-ish'), /--license-type/);
});

test('normalizeValidUntil converts date-only to RFC 3339 and rejects garbage', () => {
  assert.equal(normalizeValidUntil(undefined), null);
  assert.equal(normalizeValidUntil('2027-01-01'), '2027-01-01T00:00:00Z');
  assert.equal(
    normalizeValidUntil('2027-01-01T12:30:00+02:00'),
    '2027-01-01T12:30:00+02:00',
  );

  for (const bad of ['2027-01-01 00:00:00', '01/01/2027', '2027-02-30', 'soon']) {
    assert.throws(() => normalizeValidUntil(bad), /--valid-until/, `accepted ${bad}`);
  }
});

test('assertExpiryForType requires expiry for time-limited types', () => {
  assert.doesNotThrow(() => assertExpiryForType('perpetual', null));
  assert.doesNotThrow(() => assertExpiryForType('trial', '2027-01-01T00:00:00Z'));
  assert.throws(() => assertExpiryForType('trial', null), /--valid-until/);
  assert.throws(() => assertExpiryForType('subscription', null), /--valid-until/);
});

test('trial/subscription without --valid-until are rejected', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'tuari-license-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = await makeTestKey(dir);

  for (const type of ['trial', 'subscription']) {
    const result = runCli([
      '--edition', 'professional',
      '--issued-to', 'No Expiry Co',
      '--email', 'no-expiry@example.com',
      '--private-key', key,
      '--license-type', type,
    ]);
    assert.notEqual(result.status, 0, `${type} without expiry must fail`);
    assert.match(result.stderr, /--valid-until is required/);
    assert.equal(result.stdout, '', `${type} failure must not print a license`);
  }
});

test('non-integer seat counts are rejected before signing', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'tuari-license-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = await makeTestKey(dir);

  for (const bad of ['ten', '-1', '1.5']) {
    const result = runCli([
      '--edition', 'professional',
      '--issued-to', 'Seat Typo Co',
      '--email', 'seats@example.com',
      '--private-key', key,
      '--max-users', bad,
    ]);
    assert.notEqual(result.status, 0, `--max-users ${bad} must fail`);
    assert.match(result.stderr, /--max-users/);
    assert.equal(result.stdout, '');
  }
});

test('unknown license types are rejected', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'tuari-license-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = await makeTestKey(dir);

  const result = runCli([
    '--edition', 'professional',
    '--issued-to', 'Bad Type Co',
    '--email', 'type@example.com',
    '--private-key', key,
    '--license-type', 'lifetime',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--license-type/);
  assert.equal(result.stdout, '');
});

test('date-only expiry is normalised into the signed payload', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'tuari-license-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = await makeTestKey(dir);

  const result = runCli([
    '--edition', 'professional',
    '--issued-to', 'Date Only Co',
    '--email', 'dates@example.com',
    '--private-key', key,
    '--license-type', 'trial',
    '--valid-until', '2027-01-01',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(decodePayload(result.stdout).validUntil, '2027-01-01T00:00:00Z');
});

test('perpetual mint omits validUntil and keeps max-users explicit', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'tuari-license-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = await makeTestKey(dir);

  const result = runCli([
    '--edition', 'enterprise',
    '--issued-to', 'Perpetual Co',
    '--email', 'perpetual@example.com',
    '--private-key', key,
    '--max-users', '25',
  ]);
  assert.equal(result.status, 0, result.stderr);
  const payload = decodePayload(result.stdout);
  assert.equal(payload.licenseType, 'perpetual');
  assert.equal(payload.maxUsers, 25);
  assert.ok(!('validUntil' in payload), 'perpetual must not carry validUntil');
});

test('unlimited seats are only emitted when the operator passes 0', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'tuari-license-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = await makeTestKey(dir);

  const result = runCli([
    '--edition', 'enterprise',
    '--issued-to', 'Unlimited Co',
    '--email', 'unlimited@example.com',
    '--private-key', key,
    '--max-users', '0',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(decodePayload(result.stdout).maxUsers, 0);
});

test('stdout contains only the license value; the summary goes to stderr', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'tuari-license-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = await makeTestKey(dir);

  const result = runCli([
    '--edition', 'standard',
    '--issued-to', 'Stdout Co',
    '--email', 'stdout@example.com',
    '--private-key', key,
    '--license-type', 'perpetual',
  ]);
  assert.equal(result.status, 0, result.stderr);

  const lines = result.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, `stdout must hold one line, got: ${result.stdout}`);
  const parts = lines[0].split('.');
  assert.equal(parts.length, 2, 'stdout must be <payload>.<signature>');
  assert.ok(!/\s/.test(lines[0]), 'licence value must not contain whitespace');
  assert.doesNotMatch(result.stdout, /Generated license|Edition:|Customer:/);
  assert.match(result.stderr, /Generated license/);
});

test('--output writes the same license stdout would print', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'tuari-license-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = await makeTestKey(dir);
  const outPath = join(dir, 'customer-license.lic');

  const result = runCli([
    '--edition', 'professional',
    '--issued-to', 'Output Co',
    '--email', 'output@example.com',
    '--private-key', key,
    '--license-type', 'subscription',
    '--valid-until', '2027-06-30T00:00:00Z',
    '--output', outPath,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '', '--output must not also echo the license');

  const fileContents = await readFile(outPath, 'utf8');
  assert.equal(fileContents.trim().split('.').length, 2);
  assert.match(result.stderr, /Signed license written to/);
});
