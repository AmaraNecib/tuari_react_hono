// update-channel-metadata.test.mjs — Tests for release channel metadata generation
//
// Run: node --test tests/update-channel-metadata.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = fileURLToPath(new URL('../scripts', import.meta.url));

function runScript(script, args) {
  const fullPath = join(scriptDir, script);
  const argList = parseArgsString(args);
  const result = spawnSync(process.execPath, [fullPath, ...argList], {
    encoding: 'utf8',
    cwd: scriptDir,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const msg = result.stderr || result.stdout || `exit code ${result.status}`;
    throw new Error(msg);
  }
  return result.stdout;
}

function runScriptWithFailure(script, args) {
  const fullPath = join(scriptDir, script);
  const argList = parseArgsString(args);
  const result = spawnSync(process.execPath, [fullPath, ...argList], {
    encoding: 'utf8',
    cwd: scriptDir,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Parse a command-line argument string into an array, respecting quoted strings.
 */
function parseArgsString(str) {
  const args = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ' ' && !inQuote) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

// ─── Tests ────────────────────────────────────────────────────────

test('update-channel-metadata exits with non-zero on missing --channel', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'meta-test-'));

  const result = runScriptWithFailure(
    'update-channel-metadata.mjs',
    `--version 0.6.0 --min-version 0.1.0 --url https://example.com/update --release-date 2026-07-08T00:00:00Z --changelog https://example.com/changelog --output "${join(tmp, 'updates.json')}"`
  );

  assert.notEqual(result.exitCode, 0, 'should exit with non-zero code when --channel is missing');
});

test('update-channel-metadata exits with non-zero on invalid channel name', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'meta-test-'));

  const result = runScriptWithFailure(
    'update-channel-metadata.mjs',
    `--channel invalid --version 0.6.0 --min-version 0.1.0 --url https://example.com/update --release-date 2026-07-08T00:00:00Z --changelog https://example.com/changelog --output "${join(tmp, 'updates.json')}"`
  );

  assert.notEqual(result.exitCode, 0, 'should exit with non-zero code on invalid channel name');
});

test('update-channel-metadata rejects empty string args (not just undefined)', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'meta-test-'));
  const scriptPath = join(scriptDir, 'update-channel-metadata.mjs');

  // Pass --min-version as an explicit empty string via the args array
  // (bypassing the parseArgsString tokenizer, which would otherwise drop it).
  // Guards against the empty-string bypass that allowed the workflow to
  // write minSupportedVersion: "" when an env var was empty.
  const result = spawnSync(process.execPath, [
    scriptPath,
    '--channel', 'nightly',
    '--version', '0.6.0',
    '--min-version', '',
    '--url', 'https://example.com/update',
    '--release-date', '2026-07-08T00:00:00Z',
    '--changelog', 'https://example.com/changelog',
    '--output', join(tmp, 'updates.json'),
  ], { encoding: 'utf8', cwd: scriptDir });

  assert.notEqual(result.status, 0, 'should exit non-zero when a required arg is empty string');
  assert.match(result.stderr, /--min-version is required/, 'should report the empty arg by name');
});

test('generated updates.json for nightly has correct fields', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'meta-test-'));
  const outputPath = join(tmp, 'updates.json');

  runScript(
    'update-channel-metadata.mjs',
    `--channel nightly --version 0.6.0-nightly.20260708 --min-version 0.1.0 --url https://github.com/AmaraNecib/tuari_react_hono/releases/download/nightly/update-0.6.0-nightly.update --release-date 2026-07-08T00:00:00Z --changelog https://github.com/AmaraNecib/tuari_react_hono/releases/nightly --output "${outputPath}"`
  );

  const content = await readFile(outputPath, 'utf8');
  const parsed = JSON.parse(content);

  // Verify top-level structure
  assert.ok(parsed.channels, 'should have channels object');
  assert.ok(parsed.channels.nightly, 'should have nightly channel');

  const nightly = parsed.channels.nightly;
  assert.equal(nightly.latestVersion, '0.6.0-nightly.20260708');
  assert.equal(nightly.minSupportedVersion, '0.1.0');
  assert.equal(
    nightly.updateUrl,
    'https://github.com/AmaraNecib/tuari_react_hono/releases/download/nightly/update-0.6.0-nightly.update'
  );
  assert.equal(nightly.releaseDate, '2026-07-08T00:00:00Z');
  assert.equal(nightly.changeLog, 'https://github.com/AmaraNecib/tuari_react_hono/releases/nightly');

  // Verify all required fields are present
  const requiredFields = ['latestVersion', 'minSupportedVersion', 'updateUrl', 'releaseDate', 'changeLog'];
  for (const field of requiredFields) {
    assert.ok(nightly[field] !== undefined, `should have field "${field}"`);
  }
});

test('generated updates.json for stable points to stable download URL', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'meta-test-'));
  const outputPath = join(tmp, 'updates.json');

  runScript(
    'update-channel-metadata.mjs',
    `--channel stable --version 0.5.0 --min-version 0.1.0 --url https://github.com/AmaraNecib/tuari_react_hono/releases/latest/download/update-0.5.0.update --release-date 2026-07-01T00:00:00Z --changelog https://github.com/AmaraNecib/tuari_react_hono/releases/tag/v0.5.0 --output "${outputPath}"`
  );

  const content = await readFile(outputPath, 'utf8');
  const parsed = JSON.parse(content);

  assert.ok(parsed.channels.stable, 'should have stable channel');
  assert.ok(
    parsed.channels.stable.updateUrl.includes('releases/latest/download/'),
    'stable update URL should point to latest release'
  );
  assert.equal(parsed.channels.stable.latestVersion, '0.5.0');
  assert.equal(parsed.channels.stable.minSupportedVersion, '0.1.0');
  assert.equal(parsed.channels.stable.releaseDate, '2026-07-01T00:00:00Z');
});

test('--merge preserves existing channels and adds new one', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'meta-test-'));

  // First create updates.json with nightly
  const existingPath = join(tmp, 'existing.json');
  runScript(
    'update-channel-metadata.mjs',
    `--channel nightly --version 0.6.0-nightly.20260708 --min-version 0.1.0 --url https://github.com/AmaraNecib/tuari_react_hono/releases/download/nightly/update-0.6.0-nightly.update --release-date 2026-07-08T00:00:00Z --changelog https://github.com/AmaraNecib/tuari_react_hono/releases/nightly --output "${existingPath}"`
  );

  // Now merge beta into the same file
  runScript(
    'update-channel-metadata.mjs',
    `--channel beta --version 0.5.0-beta.1 --min-version 0.1.0 --url https://github.com/AmaraNecib/tuari_react_hono/releases/download/beta/update-0.5.0-beta.1.update --release-date 2026-07-05T00:00:00Z --changelog https://github.com/AmaraNecib/tuari_react_hono/releases/beta --merge "${existingPath}" --output "${existingPath}"`
  );

  const content = await readFile(existingPath, 'utf8');
  const parsed = JSON.parse(content);

  // Both channels should exist
  assert.ok(parsed.channels.nightly, 'nightly channel should be preserved');
  assert.ok(parsed.channels.beta, 'beta channel should be added');

  // Nightly should be unchanged
  assert.equal(parsed.channels.nightly.latestVersion, '0.6.0-nightly.20260708');

  // Beta should be new
  assert.equal(parsed.channels.beta.latestVersion, '0.5.0-beta.1');
});

test('--merge updates existing channel entry', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'meta-test-'));

  // First create updates.json with nightly
  const existingPath = join(tmp, 'existing.json');
  runScript(
    'update-channel-metadata.mjs',
    `--channel nightly --version 0.5.0-nightly.20260701 --min-version 0.1.0 --url https://github.com/AmaraNecib/tuari_react_hono/releases/download/nightly/update-0.5.0-nightly.update --release-date 2026-07-01T00:00:00Z --changelog https://github.com/AmaraNecib/tuari_react_hono/releases/nightly --output "${existingPath}"`
  );

  // Now update nightly to a newer version
  runScript(
    'update-channel-metadata.mjs',
    `--channel nightly --version 0.6.0-nightly.20260708 --min-version 0.1.0 --url https://github.com/AmaraNecib/tuari_react_hono/releases/download/nightly/update-0.6.0-nightly.update --release-date 2026-07-08T00:00:00Z --changelog https://github.com/AmaraNecib/tuari_react_hono/releases/nightly --merge "${existingPath}" --output "${existingPath}"`
  );

  const content = await readFile(existingPath, 'utf8');
  const parsed = JSON.parse(content);

  assert.equal(parsed.channels.nightly.latestVersion, '0.6.0-nightly.20260708', 'nightly version should be updated');
  assert.equal(parsed.channels.nightly.releaseDate, '2026-07-08T00:00:00Z', 'release date should be updated');
});

test('output file has proper JSON formatting', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'meta-test-'));
  const outputPath = join(tmp, 'updates.json');

  runScript(
    'update-channel-metadata.mjs',
    `--channel stable --version 0.5.0 --min-version 0.1.0 --url https://example.com/update --release-date 2026-07-01T00:00:00Z --changelog https://example.com/changelog --output "${outputPath}"`
  );

  const content = await readFile(outputPath, 'utf8');

  // Should be pretty-printed with newline at end
  assert.ok(content.endsWith('\n'), 'output should end with newline');
  assert.ok(content.includes('  '), 'output should be indented');
});
