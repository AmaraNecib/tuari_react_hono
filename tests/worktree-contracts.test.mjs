import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectWorktreeContracts } from '../scripts/dev/check-worktree-contracts.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'contracts root '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, 'packages/contracts');
  await mkdir(path.join(target, 'dist'), { recursive: true });
  await writeFile(path.join(target, 'package.json'), JSON.stringify({ name: '@tuari/contracts', exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } } }));
  await writeFile(path.join(target, 'dist/index.js'), '');
  await writeFile(path.join(target, 'dist/index.d.ts'), '');
  for (const app of ['api', 'web']) {
    const parent = path.join(root, `apps/${app}/node_modules/@tuari`);
    await mkdir(parent, { recursive: true });
    await symlink(target, path.join(parent, 'contracts'), process.platform === 'win32' ? 'junction' : 'dir');
  }
  return { root, target };
}

test('valid own-root links and export targets pass without mutation', async t => {
  const { root } = await fixture(t);
  const before = (await readFile(path.join(root, 'packages/contracts/package.json'))).toString();
  const result = await inspectWorktreeContracts(root);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal((await readFile(path.join(root, 'packages/contracts/package.json'))).toString(), before);
});

test('both app links must resolve to this root contracts package', async t => {
  const { root } = await fixture(t);
  const sibling = path.join(path.dirname(root), 'sibling contracts');
  await mkdir(path.join(sibling, 'dist'), { recursive: true });
  await writeFile(path.join(sibling, 'package.json'), '{}');
  for (const app of ['api', 'web']) {
    const link = path.join(root, `apps/${app}/node_modules/@tuari/contracts`);
    await rm(link, { recursive: true });
    await symlink(sibling, link, process.platform === 'win32' ? 'junction' : 'dir');
    const result = await inspectWorktreeContracts(root);
    assert.equal(result.ok, false, `${app} sibling target accepted`);
  }
  await rm(sibling, { recursive: true, force: true });
});

test('CLI reports missing build with nonzero exit and JSON diagnostics', async t => {
  const { root, target } = await fixture(t);
  await rm(path.join(target, 'dist/index.js'));
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/dev/check-worktree-contracts.mjs', import.meta.url)), '--json', root], { encoding: 'utf8' });
  assert.notEqual(cli.status, 0);
  assert.doesNotThrow(() => JSON.parse(cli.stdout));
});
