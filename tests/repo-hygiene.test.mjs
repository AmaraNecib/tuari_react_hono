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

test('no stray `nul` file at the repo root and gitignore blocks it', async () => {
  // The file is a Windows `dir > nul` redirect artifact (issue #284).
  await assert.rejects(
    access(resolveRepoPath('nul'), constants.F_OK),
    /ENOENT/,
  );

  const gitignore = await readRepoFile('.gitignore');
  assert.match(gitignore, /^\/nul$/m);
});

test('api tsconfig does not include the removed prisma.config.ts', async () => {
  const tsconfig = await readRepoFile('apps/api/tsconfig.json');

  assert.doesNotMatch(tsconfig, /prisma\.config\.ts/);
  assert.match(tsconfig, /"include": \["src\/\*\*\/\*\.ts"\]/);
});

test('global focus ring uses the full-opacity outline color', async () => {
  const styles = await readRepoFile('apps/web/src/styles.css');
  const baseRule = styles.split('\n').find((line) => line.includes('@apply border-border'));

  // The universal default outline-color must not be alpha-weakened: a 50%
  // terracotta ring is ~2.2:1 on white, below WCAG 2.2 Focus Appearance (3:1).
  assert.ok(baseRule, 'expected the universal base rule in styles.css');
  assert.doesNotMatch(baseRule, /outline-ring\/50/);
  assert.match(baseRule, /outline-ring\b(?!\/)/);
});
