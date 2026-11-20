import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectWorktreeContracts } from '../scripts/dev/check-worktree-contracts.mjs';

const cliPath = fileURLToPath(new URL('../scripts/dev/check-worktree-contracts.mjs', import.meta.url));
const metadata = () => ({ name: '@tuari/contracts', exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } } });
const linkDirectory = (target, link) => symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');

async function fixture(t) {
  const sandbox = await mkdtemp(path.join(tmpdir(), 'contracts root '));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const root = path.join(sandbox, 'checkout');
  const target = path.join(root, 'packages/contracts');
  const sibling = path.join(sandbox, 'sibling contracts');
  await mkdir(path.join(target, 'dist'), { recursive: true });
  await mkdir(sibling);
  await writeFile(path.join(target, 'package.json'), JSON.stringify(metadata()));
  await writeFile(path.join(target, 'dist/index.js'), 'export const value = 1;');
  await writeFile(path.join(target, 'dist/index.d.ts'), 'export declare const value: number;');
  for (const app of ['api', 'web']) {
    const parent = path.join(root, `apps/${app}/node_modules/@tuari`);
    await mkdir(parent, { recursive: true });
    await linkDirectory(target, path.join(parent, 'contracts'));
  }
  return { sandbox, root, target, sibling };
}

async function rejects(root, diagnostic) {
  const result = await inspectWorktreeContracts(root);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.diagnostics.some(item => diagnostic.test(item)), JSON.stringify(result));
}

async function snapshot(dir) {
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  return Promise.all(entries.map(async entry => {
    const name = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return [entry.name, 'link'];
    return [entry.name, entry.isDirectory() ? await snapshot(name) : (await readFile(name)).toString('base64')];
  }));
}

test('own-root links and files pass without modifying fixture contents', async t => {
  const { root, sandbox } = await fixture(t);
  const before = await snapshot(sandbox);
  assert.deepEqual(await inspectWorktreeContracts(root), { ok: true, diagnostics: [] });
  assert.deepEqual(await snapshot(sandbox), before);
});

for (const app of ['api', 'web']) {
  test(`${app} sibling target is rejected while the other app remains valid`, async t => {
    const { root, sibling } = await fixture(t);
    const link = path.join(root, `apps/${app}/node_modules/@tuari/contracts`);
    await rm(link, { recursive: true });
    await linkDirectory(sibling, link);
    await rejects(root, new RegExp(`${app} contracts link resolves outside`));
  });
  test(`missing ${app} link is rejected`, async t => {
    const { root } = await fixture(t);
    await rm(path.join(root, `apps/${app}/node_modules/@tuari/contracts`), { recursive: true });
    await rejects(root, new RegExp(`Missing ${app} contracts link`));
  });
}

for (const kind of ['import', 'types']) {
  const file = kind === 'import' ? 'index.js' : 'index.d.ts';
  test(`missing ${kind} build file is rejected`, async t => {
    const { root, target } = await fixture(t);
    await rm(path.join(target, 'dist', file));
    await rejects(root, new RegExp(`Missing contracts ${kind} build target`));
  });
  test(`${kind} directory is not accepted as an entry file`, async t => {
    const { root, target } = await fixture(t);
    await rm(path.join(target, 'dist', file));
    await mkdir(path.join(target, 'dist', file));
    await rejects(root, new RegExp(`${kind} build target is not a regular file`));
  });
  for (const entry of ['../outside.js', 'dist/index.js', '']) {
    test(`invalid ${kind} target ${JSON.stringify(entry)} is rejected`, async t => {
      const { root, target } = await fixture(t);
      const value = metadata();
      value.exports['.'][kind] = entry;
      await writeFile(path.join(target, 'package.json'), JSON.stringify(value));
      await rejects(root, /Invalid .* export target|escapes contracts package/);
    });
  }
  test(`${kind} symlink escaping the package is rejected`, async t => {
    const { root, target, sibling } = await fixture(t);
    const outside = path.join(sibling, 'entries');
    await mkdir(outside);
    await writeFile(path.join(outside, file), 'external');
    await linkDirectory(outside, path.join(target, 'external'));
    const value = metadata();
    value.exports['.'][kind] = `./external/${file}`;
    await writeFile(path.join(target, 'package.json'), JSON.stringify(value));
    await rejects(root, /export target resolves outside/);
  });
}

for (const value of ['{', 'null', '[]', JSON.stringify({ name: 'wrong' }), JSON.stringify({ name: '@tuari/contracts', exports: { '.': { import: './dist/index.js' } } })]) {
  test(`malformed package metadata ${value} fails with diagnostics`, async t => {
    const { root, target } = await fixture(t);
    await writeFile(path.join(target, 'package.json'), value);
    await rejects(root, /Invalid contracts package metadata|Malformed contracts/);
  });
}

test('missing package and nonexistent root are rejected', async t => {
  const { root, target, sandbox } = await fixture(t);
  await rm(target, { recursive: true });
  await rejects(root, /Missing contracts package/);
  await rejects(path.join(sandbox, 'absent'), /Repository root does not exist/);
});

test('root alias resolves to the same owning checkout', async t => {
  const { root, sandbox } = await fixture(t);
  const alias = path.join(sandbox, 'alias root');
  await linkDirectory(root, alias);
  assert.deepEqual(await inspectWorktreeContracts(alias), { ok: true, diagnostics: [] });
});

test('CLI success, default cwd, missing build and invalid arguments have honest exits', async t => {
  const { root, target } = await fixture(t);
  const invoke = args => spawnSync(process.execPath, [cliPath, ...args], { cwd: root, encoding: 'utf8' });
  const ok = invoke(['--json', root]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout), { ok: true, diagnostics: [] });
  const plain = invoke([]);
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /links and build targets are local/);
  await rm(path.join(target, 'dist/index.js'));
  const missing = invoke(['--json', root]);
  assert.equal(missing.status, 1, missing.stderr);
  assert.match(JSON.parse(missing.stdout).diagnostics.join('\n'), /Missing contracts import build target/);
  for (const args of [['--unknown'], [root, root], ['--json', '--json']]) {
    const result = invoke(args);
    assert.equal(result.status, 2, JSON.stringify({ args, ...result }));
    assert.match(result.stderr, /Usage:/);
  }
});
