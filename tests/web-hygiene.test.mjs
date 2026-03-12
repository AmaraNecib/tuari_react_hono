import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

function resolveRepoPath(relativePath) {
  return path.join(rootDir, relativePath);
}

async function readRepoFile(relativePath) {
  return readFile(resolveRepoPath(relativePath), 'utf8');
}

test('web README documents the current Vite and Tauri-connected app', async () => {
  const readme = await readRepoFile('apps/web/README.md');

  assert.match(readme, /^# @tuari\/web$/m);
  assert.match(readme, /Vite-powered web shell/i);
  assert.match(readme, /TanStack Router/);
  assert.match(readme, /TanStack Query/);
  assert.match(readme, /Tauri runtime bridge/i);
  assert.match(readme, /pnpm --filter @tuari\/web dev/);
  assert.match(readme, /VITE_API_URL/);
  assert.doesNotMatch(readme, /Next\.js|create-next-app|next\/font/i);
});

test('web workspace does not keep the backup components manifest', async () => {
  await assert.rejects(
    access(resolveRepoPath('apps/web/components.json.bak'), constants.F_OK),
    /ENOENT/,
  );
});

test('agent branch PR template has no trailing whitespace noise', async () => {
  const template = await readRepoFile('.github/PULL_REQUEST_TEMPLATE/agent-branch.md');
  const noisyLine = template.split(/\r?\n/).find((line) => line !== line.trimEnd());

  assert.equal(noisyLine, undefined);
});

test('root package scripts keep web hygiene validation in normal checks', async () => {
  const packageJson = JSON.parse(await readRepoFile('package.json'));

  assert.equal(packageJson.scripts['check:web-hygiene'], 'node --test ./tests/web-hygiene.test.mjs');
  assert.match(packageJson.scripts.lint, /check:web-hygiene/);
  assert.match(packageJson.scripts.test, /check:web-hygiene/);
});
