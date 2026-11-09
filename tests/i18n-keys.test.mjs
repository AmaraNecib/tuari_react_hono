import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { findUnusedKeys } from '../scripts/i18n-usage.mjs';

const execFileAsync = promisify(execFile);
const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

/**
 * Production translation gate for missing references and orphaned leaves.
 * Fixtures exercise the same CLI that normal lint and test commands invoke.
 */
test('production translations have no missing or unused keys', async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [path.join(rootDir, 'scripts/check-i18n-keys.mjs')],
    { cwd: rootDir },
  );

  assert.match(stdout, /unused resource keys: 0/, `unused translation drift found:\n${stdout}\n${stderr}`);
  assert.match(stdout, /missing \(no fallback → renders raw key\): 0/, `raw-key drift found:\n${stdout}\n${stderr}`);
  // Greptile #271 finding: keys referenced through lookup maps (computed t()
  // sources) must also resolve — the key-shaped-literal scan hard-fails on them.
  assert.match(stdout, /missing map-key literals \(computed t\(\) sources\): 0/, `map-key drift found:\n${stdout}\n${stderr}`);
});

const sources = (text) => [{ fileName: 'example.tsx', text }];

test('usage includes indirect maps, helpers and conditional keys under any namespace', () => {
  const resource = { newFeature: { mapped: 'a', helper: 'b', yes: 'c', no: 'd', orphan: 'e' } };
  assert.deepEqual(findUnusedKeys(resource, sources(`
    const labels = { active: 'newFeature.mapped' };
    function key() { return 'newFeature.helper' }
    t(labels[status]); t(key()); t(flag ? 'newFeature.yes' : 'newFeature.no');
    // t('newFeature.orphan')
  `)), ['newFeature.orphan']);
});

test('bounded templates and concatenations do not exempt unrelated siblings', () => {
  const resource = { status: { activeLabel: 'a', stoppedLabel: 'b', hidden: 'c' },
    panels: { first: { title: 'd' }, second: { title: 'e' }, orphan: 'f' } };
  assert.deepEqual(findUnusedKeys(resource, sources(
    't(`status.${status}Label`); t("panels." + panel + ".title");'
  )), ['panels.orphan', 'status.hidden']);
});

test('constant template spans retain their values', () => {
  assert.deepEqual(findUnusedKeys({ common: { save: 'a', delete: 'b' } },
    sources('t(`common.${"save"}`)')), ['common.delete']);
});

test('plural variants and explicit object returns count without hiding other leaves', () => {
  const resource = { feature: { count_one: 'one', count_other: 'many',
    group: { title: 'title', body: 'body' }, orphan: 'unused' } };
  assert.deepEqual(findUnusedKeys(resource, sources(`
    t('feature.count', { count });
    t('feature.group', { returnObjects: true });
  `)), ['feature.orphan']);
  assert.deepEqual(findUnusedKeys({ group: { child: 'unused' } }, sources("t('group')")), ['group.child']);
});

test('the CLI fails on orphans and test-only references without weakening missing checks', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'tuari-i18n-493-'));
  const src = path.join(fixture, 'apps/web/src');
  await mkdir(path.join(src, 'i18n/resources'), { recursive: true });
  await writeFile(path.join(src, 'i18n/resources/ar.ts'), `export const ar = { translation: {
    freshNamespace: { live: 'live', dead: 'dead', testedOnly: 'test' }
  } }`);
  await writeFile(path.join(src, 'page.tsx'), `t('freshNamespace.live'); t('freshNamespace.missing', { count: 1 });`);
  await writeFile(path.join(src, 'page.test.tsx'), `t('freshNamespace.testedOnly')`);
  await mkdir(path.join(src, '__tests__'));
  await writeFile(path.join(src, '__tests__/usage.tsx'), `t('freshNamespace.dead')`);
  await assert.rejects(execFileAsync(process.execPath,
    [path.join(rootDir, 'scripts/check-i18n-keys.mjs'), '--root', fixture, '--json'], { cwd: rootDir }),
  (error) => {
    assert.equal(error.code, 1);
    const report = JSON.parse(error.stdout);
    assert.deepEqual(report.unusedKeys, ['freshNamespace.dead', 'freshNamespace.testedOnly']);
    assert.deepEqual(report.missing.map(({ key }) => key), ['freshNamespace.missing']);
    return true;
  });
});

test('the CLI accepts finite indirect usages and interpolated constant keys', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'tuari-i18n-493-live-'));
  const src = path.join(fixture, 'apps/web/src');
  await mkdir(path.join(src, 'i18n/resources'), { recursive: true });
  await writeFile(path.join(src, 'i18n/resources/ar.ts'), `export const ar = { translation: {
    freshNamespace: { mapped: 'a', yes: 'b', no: 'c', constant: 'd' }
  } }`);
  await writeFile(path.join(src, 'page.tsx'), `const labels = { active: 'freshNamespace.mapped' };
    t(labels[status]); t(flag ? 'freshNamespace.yes' : 'freshNamespace.no');
    t(\`freshNamespace.\${"constant"}\`);`);
  const { stdout } = await execFileAsync(process.execPath,
    [path.join(rootDir, 'scripts/check-i18n-keys.mjs'), '--root', fixture, '--json'], { cwd: rootDir });
  const report = JSON.parse(stdout);
  assert.deepEqual(report.unusedKeys, []);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.missingMapKeys, []);
});

test('root package scripts keep the i18n key gate in normal checks', async () => {
  const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));

  assert.equal(packageJson.scripts['check:i18n-keys'], 'node --test ./tests/i18n-keys.test.mjs');
  assert.match(packageJson.scripts.lint, /check:i18n-keys/);
  assert.match(packageJson.scripts.test, /check:i18n-keys/);
});
