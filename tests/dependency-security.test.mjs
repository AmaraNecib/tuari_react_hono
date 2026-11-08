import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const manifest = (file) => JSON.parse(read(file));
const lock = read('pnpm-lock.yaml').split('\nsnapshots:')[0];
const versions = (name) => [...lock.matchAll(/^  '?([^\s']+)@(\d[^\s:']*)'?:$/gm)]
  .filter((match) => match[1] === name).map((match) => match[2]);

test('auth client, server and adapter share the vetted security release', () => {
  assert.equal(manifest('apps/api/package.json').dependencies['better-auth'], '1.7.7');
  assert.equal(manifest('apps/web/package.json').dependencies['better-auth'], '1.7.7');
  assert.equal(manifest('apps/api/package.json').dependencies['@better-auth/drizzle-adapter'], '1.7.7');
  assert.deepEqual(versions('better-auth'), ['1.7.7']);
});

test('runtime and tooling lock branches retain vetted security fixes', () => {
  for (const [name, expected] of Object.entries({
    hono: ['4.13.11'], seroval: ['1.6.11'], 'proxy-addr': ['2.0.8'],
    undici: ['7.30.1'], lodash: [], 'fast-uri': ['3.1.9'],
    'brace-expansion': ['1.1.21', '5.0.12'], picomatch: ['2.3.2', '4.0.4'],
    'deepmerge-ts': [], effect: [], postcss: ['8.5.23'], nanoid: ['3.3.20'],
    'js-yaml': ['4.3.2'], '@modelcontextprotocol/sdk': ['1.32.0'],
    defu: ['6.1.5'], browserslist: ['4.28.7'], mysql2: ['3.23.1'],
    flatted: ['3.4.2'], 'source-map-js': ['1.2.2'], 'body-parser': ['2.4.0'],
    'path-to-regexp': ['6.3.0', '8.4.0'], 'ip-address': ['10.7.4'],
    jose: ['6.2.13'], '@noble/ciphers': ['1.3.0', '2.4.0'],
    '@noble/hashes': ['1.8.0', '2.4.0'],
  })) assert.deepEqual(versions(name).sort(), expected.sort(), name);
});

test('contracts and callers use the same Zod 4 release without forcing Zod 3 callers across majors', () => {
  for (const file of ['apps/api/package.json', 'apps/web/package.json', 'packages/contracts/package.json']) {
    assert.equal(manifest(file).dependencies.zod, '4.6.6', file);
  }
  assert.deepEqual(versions('zod').sort(), ['3.25.76', '4.6.6']);
});

test('unused Next integration disappears without a cross-major crypto override', () => {
  assert.deepEqual(versions('next'), []);
  assert.deepEqual(versions('sharp'), []);
  assert.deepEqual(versions('prisma'), []);
  assert.deepEqual(versions('@prisma/client'), []);
  const workspace = read('pnpm-workspace.yaml');
  assert.doesNotMatch(workspace, /^\s+['"]?(?:tar|better-sqlite3-sqlcipher)@/m);
  // The legacy native driver remains a declared blocker, not a claimed fix.
  assert.equal(manifest('apps/api/package.json').dependencies['better-sqlite3-sqlcipher'], '5.4.3-3');
});
