import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile, readdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectWorktreeContracts, inspectWorktreeOwnership } from '../scripts/dev/check-worktree-contracts.mjs';

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

test('independent synthetic trees pass ownership checks and remain unchanged', async t => {
  const a = await fixture(t);
  const b = await fixture(t);
  assert.deepEqual(await inspectWorktreeOwnership(a.root), { ok: true, diagnostics: [] });
  assert.deepEqual(await inspectWorktreeOwnership(b.root), { ok: true, diagnostics: [] });
  await writeFile(path.join(a.target, 'dist/index.js'), 'export const value = 2;');
  assert.equal(await readFile(path.join(b.target, 'dist/index.js'), 'utf8'), 'export const value = 1;');
});

test('ownership command reaches downstream on valid root and blocks sibling node_modules and output', async t => {
  const { root, sibling } = await fixture(t);
  await mkdir(path.join(root, 'node_modules/.pnpm'), { recursive: true });
  await mkdir(path.join(root, 'apps/api/node_modules/.pnpm'), { recursive: true });
  await mkdir(path.join(root, 'apps/web/node_modules/.pnpm'), { recursive: true });
  await mkdir(path.join(root, 'packages/contracts/node_modules/.pnpm'), { recursive: true });
  const sentinel = path.join(root, 'downstream-ran');
  const run = cwd => spawnSync(process.execPath, ['-e', `const {spawnSync}=require('node:child_process');const {writeFileSync}=require('node:fs');const r=spawnSync(process.execPath,['${cliPath.replaceAll('\\','\\\\')}','--ownership-only','${root.replaceAll('\\','\\\\')}'],{cwd:'${cwd.replaceAll('\\','\\\\')}',encoding:'utf8'});if(r.status!==0){process.stderr.write(r.stdout+r.stderr);process.exit(r.status)}writeFileSync('${sentinel.replaceAll('\\','\\\\')}','ran')`], { cwd, encoding: 'utf8' });
  const positive = run(root);
  assert.equal(positive.status, 0, positive.stderr);
  assert.equal(await readFile(sentinel, 'utf8'), 'ran');
  await rm(sentinel);
  for (const relative of ['node_modules', 'apps/api/node_modules', 'apps/web/node_modules', 'packages/contracts/node_modules', 'packages/contracts/dist']) {
    const target = path.join(root, relative);
    await rm(target, { recursive: true, force: true });
    await linkDirectory(sibling, target);
    const result = run(root);
    assert.notEqual(result.status, 0, relative);
    assert.match(result.stderr, new RegExp(relative.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')));
    await assert.rejects(lstat(sentinel));
    await rm(target);
    if (relative.endsWith('dist')) await mkdir(target, { recursive: true });
  }
});

function runOwnershipDownstream(root, sentinel) {
  const code = `const {spawnSync}=require('node:child_process');const {writeFileSync}=require('node:fs');const r=spawnSync(process.execPath,${JSON.stringify([cliPath, '--ownership-only', root])},{encoding:'utf8'});if(r.status!==0){process.stderr.write(r.stdout+r.stderr);process.exit(r.status??1)}writeFileSync(${JSON.stringify(sentinel)},'ran')`;
  return spawnSync(process.execPath, ['-e', code], { cwd: root, encoding: 'utf8', timeout: 10000 });
}

for (const relative of ['node_modules/.pnpm', 'apps/api/node_modules/.pnpm', 'apps/web/node_modules/.pnpm', 'packages/contracts/node_modules/.pnpm', 'node_modules', 'apps/api/node_modules', 'apps/web/node_modules', 'packages/contracts/node_modules', 'packages/contracts/dist']) {
  test(`ownership blocks foreign, dangling and looping ${relative} before downstream execution`, async t => {
    for (const kind of ['foreign', 'internal', 'external', 'loop']) {
      const { root, sibling } = await fixture(t);
      const link = path.join(root, relative);
      await rm(link, { recursive: true, force: true });
      await mkdir(path.dirname(link), { recursive: true });
      const target = kind === 'foreign' ? sibling : kind === 'internal' ? path.join(root, 'missing-target') : kind === 'external' ? path.join(sibling, 'missing-target') : link;
      await linkDirectory(target, link);
      if (kind === 'loop') await assert.rejects(lstat(path.join(link, 'probe')), error => ['ELOOP', 'ENOENT', 'EINVAL'].includes(error.code));
      const result = await inspectWorktreeOwnership(root);
      assert.equal(result.ok, false, `${kind}: ${JSON.stringify(result)}`);
      assert.ok(result.diagnostics.some(item => item.includes(relative)), JSON.stringify(result));
      const sentinel = path.join(root, 'downstream-ran');
      const command = runOwnershipDownstream(root, sentinel);
      assert.equal(command.error, undefined, `${relative} ${kind}: ${command.error}`);
      assert.equal(command.status, 1, `${relative} ${kind}: ${command.stderr}`);
      await assert.rejects(lstat(sentinel), { code: 'ENOENT' });
    }
  });
}

for (const kind of ['import', 'types']) {
  test(`ownership rejects ${kind} export linked to sibling before downstream`, async t => {
    const { root, target, sibling } = await fixture(t);
    const filename = kind === 'import' ? 'entry.js' : 'entry.d.ts';
    await writeFile(path.join(sibling, filename), 'foreign');
    await linkDirectory(sibling, path.join(target, 'external'));
    const manifest = metadata();
    manifest.exports['.'][kind] = `./external/${filename}`;
    await writeFile(path.join(target, 'package.json'), JSON.stringify(manifest));
    const sentinel = path.join(root, 'downstream-ran');
    const command = runOwnershipDownstream(root, sentinel);
    assert.equal(command.status, 1, command.stderr);
    assert.match(command.stderr, /resolves outside contracts package/);
    await assert.rejects(lstat(sentinel), { code: 'ENOENT' });
  });
}

test('ownership rejects dangling export links but allows missing ordinary build output', async t => {
  const { root, target } = await fixture(t);
  await rm(path.join(target, 'dist'), { recursive: true });
  assert.deepEqual(await inspectWorktreeOwnership(root), { ok: true, diagnostics: [] });
  await mkdir(path.join(target, 'dist'), { recursive: true });
  await linkDirectory(path.join(target, 'dist', 'absent'), path.join(target, 'dist', 'broken'));
  const manifest = metadata();
  manifest.exports['.'].import = './dist/broken/index.js';
  await writeFile(path.join(target, 'package.json'), JSON.stringify(manifest));
  const result = await inspectWorktreeOwnership(root);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.match(result.diagnostics.join('\\n'), /Broken contracts import export target|dangling/);
});

test('ownership allows missing local install and contracts output paths before downstream execution', async t => {
  const { root } = await fixture(t);
  for (const relative of ['node_modules', 'apps/api/node_modules', 'apps/web/node_modules', 'packages/contracts/node_modules', 'packages/contracts/dist']) {
    await rm(path.join(root, relative), { recursive: true, force: true });
  }
  assert.deepEqual(await inspectWorktreeOwnership(root), { ok: true, diagnostics: [] });
  const sentinel = path.join(root, 'downstream-ran');
  const result = runOwnershipDownstream(root, sentinel);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(sentinel, 'utf8'), 'ran');
});

test('supported manifest scripts run their declared ownership preflight from real package cwd', async t => {
  const { root } = await fixture(t);
  const manifests = [
    ['package.json', ['build', 'typecheck', 'test', 'lint', 'dev', 'dev:api', 'dev:web', 'test:api', 'test:web']],
    ['apps/api/package.json', ['dev', 'build', 'test', 'test:coverage', 'typecheck']],
    ['apps/web/package.json', ['dev', 'build', 'test', 'typecheck']],
    ['packages/contracts/package.json', ['build', 'dev', 'test', 'typecheck']],
  ];
  for (const [relativeManifest, names] of manifests) {
    const manifest = JSON.parse(await readFile(new URL(`../${relativeManifest}`, import.meta.url), 'utf8'));
    const cwd = path.join(root, path.dirname(relativeManifest));
    for (const name of names) {
      const command = manifest.scripts[name];
      const prefixText = command.split(' && ')[0];
      const prefix = prefixText.split(' ');
      assert.ok(prefixText.includes('check-worktree-contracts.mjs') && prefix.includes('--ownership-only'), `${relativeManifest} ${name} lacks ownership guard`);
      const rootArg = prefix[prefix.indexOf('--ownership-only') + 1] ?? '.';
      if (path.dirname(relativeManifest) !== '.') assert.equal(rootArg, '../..', `${relativeManifest} ${name} omits explicit root`);
      const result = spawnSync(process.execPath, [cliPath, '--ownership-only', rootArg], { cwd, encoding: 'utf8' });
      assert.equal(result.status, 0, `${relativeManifest} ${name}: ${result.stdout}${result.stderr}`);
      const brokenManifestCommand = command.replace(' ../.. &&', ' &&');
      const broken = brokenManifestCommand.split(' && ')[0].split(' ');
      if (path.dirname(relativeManifest) !== '.') {
        assert.ok(broken.includes('--ownership-only'), `${relativeManifest} ${name} guard missing in mutation`);
        const brokenResult = spawnSync(process.execPath, [cliPath, '--ownership-only', broken[broken.indexOf('--ownership-only') + 1] ?? ''], { cwd, encoding: 'utf8' });
        assert.notEqual(brokenResult.status, 0, `${relativeManifest} ${name} mutation must fail from package cwd`);
      }
    }
  }
});

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
