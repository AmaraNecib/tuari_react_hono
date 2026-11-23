import { realpath, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const within = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

export async function inspectWorktreeContracts(repositoryRoot = process.cwd()) {
  const diagnostics = [];
  let root;
  try { root = await realpath(path.resolve(repositoryRoot)); }
  catch { return { ok: false, diagnostics: [`Repository root does not exist: ${repositoryRoot}`] }; }
  const expected = path.join(root, 'packages/contracts');
  let packageRoot;
  try { packageRoot = await realpath(expected); }
  catch { return { ok: false, diagnostics: [`Missing contracts package: ${expected}`] }; }
  if (!within(root, packageRoot)) diagnostics.push(`Contracts package escapes repository root: ${packageRoot}`);
  for (const app of ['api', 'web']) {
    const link = path.join(root, 'apps', app, 'node_modules/@tuari/contracts');
    let resolved;
    try { resolved = await realpath(link); }
    catch { diagnostics.push(`Missing ${app} contracts link/package: ${link}`); continue; }
    if (resolved !== packageRoot) diagnostics.push(`${app} contracts link resolves outside this worktree package: ${resolved}`);
  }
  let metadata;
  try { metadata = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')); }
  catch (error) { diagnostics.push(`Invalid contracts package metadata: ${error.message}`); return { ok: false, diagnostics }; }
  if (!metadata || metadata.name !== '@tuari/contracts' || !metadata.exports || typeof metadata.exports !== 'object' || Array.isArray(metadata.exports)) {
    diagnostics.push('Malformed contracts package metadata: expected @tuari/contracts and an exports object');
    return { ok: false, diagnostics };
  }
  const entry = metadata.exports['.'];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.import !== 'string' || typeof entry.types !== 'string') {
    diagnostics.push('Malformed contracts exports: expected string import and types targets');
    return { ok: false, diagnostics };
  }
  for (const [kind, target] of [['import', entry.import], ['types', entry.types]]) {
    if (!target.startsWith('./') || target.includes('\\') || path.isAbsolute(target)) { diagnostics.push(`Invalid ${kind} export target: must start with ./ and use forward slashes`); continue; }
    const resolved = path.resolve(packageRoot, target);
    if (!within(packageRoot, resolved)) { diagnostics.push(`${kind} export target escapes contracts package: ${target}`); continue; }
    try {
      const actual = await realpath(resolved);
      if (!within(packageRoot, actual)) diagnostics.push(`${kind} export target resolves outside contracts package: ${target}`);
      else if (!(await stat(actual)).isFile()) diagnostics.push(`Contracts ${kind} build target is not a regular file: ${target}`);
    } catch { diagnostics.push(`Missing contracts ${kind} build target: ${target}`); }
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const roots = args.filter(arg => arg !== '--json');
  if (args.filter(arg => arg === '--json').length > 1 || roots.length > 1 || roots.some(arg => arg.startsWith('-'))) {
    console.error('Usage: node scripts/dev/check-worktree-contracts.mjs [repository-root] [--json]');
    process.exitCode = 2;
  } else {
    const result = await inspectWorktreeContracts(roots[0] ?? process.cwd());
    if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else console.log(result.ok ? 'Worktree contracts links and build targets are local.' : result.diagnostics.map(item => `ERROR: ${item}`).join('\n'));
    if (!result.ok) process.exitCode = 1;
  }
}
