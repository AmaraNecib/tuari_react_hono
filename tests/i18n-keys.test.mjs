import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

/**
 * i18n key drift gate (issue #271).
 *
 * Runs scripts/check-i18n-keys.mjs, which scans every t() call in apps/web/src
 * and fails when a literal key is missing from resources/ar.ts without a
 * fallback arg — i18next would return the key itself, rendering raw keys in
 * the UI. This is the regression gate the issue asked for: drift can no longer
 * slip through the test suite.
 */
test('no t() call references a missing i18n key without a fallback', async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [path.join(rootDir, 'scripts/check-i18n-keys.mjs')],
    { cwd: rootDir },
  );

  assert.match(stdout, /missing \(no fallback → renders raw key\): 0/, `raw-key drift found:\n${stdout}\n${stderr}`);
  // Greptile #271 finding: keys referenced through lookup maps (computed t()
  // sources) must also resolve — the key-shaped-literal scan hard-fails on them.
  assert.match(stdout, /missing map-key literals \(computed t\(\) sources\): 0/, `map-key drift found:\n${stdout}\n${stderr}`);
});

test('root package scripts keep the i18n key gate in normal checks', async () => {
  const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));

  assert.equal(packageJson.scripts['check:i18n-keys'], 'node --test ./tests/i18n-keys.test.mjs');
  assert.match(packageJson.scripts.lint, /check:i18n-keys/);
  assert.match(packageJson.scripts.test, /check:i18n-keys/);
});
