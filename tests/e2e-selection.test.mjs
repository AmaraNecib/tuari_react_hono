import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAP_PATH,
  globToRegExp,
  loadMap,
  selectAreas,
  selectSpecs,
} from '../scripts/ci/e2e-selection.mjs';

const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const selectorPath = path.join(rootDir, 'scripts', 'ci', 'e2e-selection.mjs');
const specDir = path.join(rootDir, 'tests', 'e2e');

test('globToRegExp: ** crosses directories, * does not, ? is one char', () => {
  assert.ok(globToRegExp('apps/web/src/lib/**').test('apps/web/src/lib/a/b.ts'));
  assert.ok(globToRegExp('apps/web/src/lib/**').test('apps/web/src/lib.ts') === false);

  assert.ok(globToRegExp('tests/**').test('tests/e2e/foo.spec.ts'));
  assert.ok(globToRegExp('scripts/**').test('scripts/ci/x.mjs'));

  assert.ok(globToRegExp('packages/*/package.json').test('packages/contracts/package.json'));
  assert.equal(globToRegExp('packages/*/package.json').test('packages/a/b/package.json'), false);

  assert.ok(globToRegExp('tsconfig?.json').test('tsconfigX.json'));
  assert.equal(globToRegExp('tsconfig?.json').test('tsconfig.json'), false);

  assert.ok(globToRegExp('**/*.md').test('docs/lessons/x.md'));
  assert.ok(globToRegExp('**/*.md').test('README.md'));
});

test('selectSpecs: critical path beats a skip match', () => {
  // `.github/**` is inert, but ci.yml is the gate itself. Critical wins.
  const scope = selectSpecs(['.github/workflows/ci.yml']);
  assert.equal(scope.mode, 'full');
  assert.match(scope.reason, /critical path/);
});

test('selectSpecs: a feature match beats a skip match on the SAME path', () => {
  // A custom map where one path matches both a skip rule and a feature rule.
  // The feature must win, so this test fails if the skip check ever moves ahead
  // of the feature check. (The real map has no such overlap by construction.)
  const overlapMap = {
    always_full: [],
    skip_e2e: ['apps/web/src/features/overlap/**'],
    always_specs: [],
    features: [
      { match: ['apps/web/src/features/overlap/**'], specs: ['overlap.spec.ts'] },
    ],
  };
  const scope = selectSpecs(['apps/web/src/features/overlap/page.tsx'], overlapMap);
  assert.equal(scope.mode, 'affected');
  assert.deepEqual(scope.specs, ['overlap.spec.ts']);
});

test('selectSpecs: a shared UI control routes its callers, warehouses included', () => {
  // Shared UI primitives are imported by nearly every feature; the components
  // rule fans out so a CreateableSelect change cannot skip the warehouse form.
  const scope = selectSpecs(['apps/web/src/components/ui/createable-select.tsx']);
  assert.equal(scope.mode, 'affected');
  assert.ok(scope.specs.includes('warehouses.spec.ts'));
});

test('selectSpecs: both sides of a rename are honoured', () => {
  // The hook and CI pass --no-renames so a rename reports source and
  // destination. A feature moved out of apps/web (destination inert) must still
  // route from its old browser path instead of degrading to a skip.
  const scope = selectSpecs([
    'apps/desktop/warehouse-form.tsx',
    'apps/web/src/features/warehouses/warehouse-form.tsx',
  ]);
  assert.equal(scope.mode, 'affected');
  assert.ok(scope.specs.includes('warehouses.spec.ts'));
});

test('selectSpecs: an unmapped path fails closed to a full run', () => {
  const scope = selectSpecs(['apps/web/src/features/something-brand-new/page.tsx']);
  assert.equal(scope.mode, 'full');
  assert.match(scope.reason, /unmapped path/);
});

test('selectSpecs: an empty diff fails closed to a full run', () => {
  const scope = selectSpecs([]);
  assert.equal(scope.mode, 'full');
  assert.match(scope.reason, /empty diff/);
});

test('selectSpecs: docs-only diff is a skip', () => {
  const scope = selectSpecs(['docs/lessons/x.md', '.agents/wisdom/testing.md', 'README.md']);
  assert.equal(scope.mode, 'skip');
  assert.deepEqual(scope.specs, []);
});

test('selectSpecs: always_specs join an affected run but not a skip', () => {
  const affected = selectSpecs(['apps/web/src/features/expenses/expenses-page.tsx']);
  for (const crossCutting of ['foundation-smoke.spec.ts', 'fonts.spec.ts', 'splashscreen.spec.ts', 'web-hygiene.spec.ts']) {
    assert.ok(affected.specs.includes(crossCutting), `${crossCutting} should join an affected run`);
  }

  const skip = selectSpecs(['docs/lessons/x.md']);
  assert.deepEqual(skip.specs, []);
});

test('selectSpecs: api module maps to the owning feature specs', () => {
  const scope = selectSpecs(['apps/api/src/modules/workforce/employee.module.ts']);
  assert.equal(scope.mode, 'affected');
  assert.ok(scope.specs.includes('employees.spec.ts'));
  assert.ok(scope.specs.includes('salaries.spec.ts'));
});

test('selectAreas: a mapped web-only diff runs test:web and skips test:api', () => {
  const scope = selectAreas(['apps/web/src/features/warehouses/warehouse-form.tsx']);
  assert.equal(scope.gate, 'scoped');
  assert.equal(scope.web, '1');
  assert.equal(scope.api, '0');
  assert.equal(scope.e2e_mode, 'affected');
  assert.ok(scope.e2e_specs.includes('tests/e2e/warehouses.spec.ts'));
});

test('selectAreas: an api-only diff runs test:api and skips test:web', () => {
  const scope = selectAreas(['apps/api/src/modules/expenses/expenses.module.ts']);
  assert.equal(scope.gate, 'scoped');
  assert.equal(scope.api, '1');
  assert.equal(scope.web, '0');
});

test('selectAreas: a docs-only diff scopes to no unit suites and skips e2e', () => {
  const scope = selectAreas(['docs/lessons/x.md']);
  assert.equal(scope.gate, 'scoped');
  assert.equal(scope.api, '0');
  assert.equal(scope.web, '0');
  assert.equal(scope.e2e_mode, 'skip');
  assert.deepEqual(scope.e2e_specs, []);
});

test('selectAreas: contracts and manifests force both suites', () => {
  for (const file of ['packages/contracts/src/index.ts', 'pnpm-lock.yaml', 'package.json']) {
    const scope = selectAreas([file]);
    assert.equal(scope.gate, 'full', `${file} should fail closed`);
    assert.equal(scope.api, '1', `${file} should run the API suite`);
    assert.equal(scope.web, '1', `${file} should run the web suite`);
  }
});

test('selectAreas: an empty diff fails closed to the full gate', () => {
  const scope = selectAreas([]);
  assert.equal(scope.gate, 'full');
});

test('anti-rot: every spec under tests/e2e/ is wired in the map', () => {
  const map = loadMap();
  const declared = new Set([
    ...map.always_specs.filter((s) => !s.startsWith('$comment')),
    ...map.features.flatMap((f) => f.specs),
  ]);

  const onDisk = readdirSync(specDir).filter((name) => name.endsWith('.spec.ts'));
  assert.ok(onDisk.length > 0, 'expected Playwright specs on disk');

  const unwired = onDisk.filter((name) => !declared.has(name));
  assert.deepEqual(
    unwired,
    [],
    `Add these specs to a feature rule or always_specs in ${path.relative(rootDir, MAP_PATH)}: ${unwired.join(', ')}`,
  );
});

test('anti-rot: every declared spec exists and every feature rule is non-empty', () => {
  const map = loadMap();
  const onDisk = new Set(readdirSync(specDir).filter((name) => name.endsWith('.spec.ts')));
  const declared = [
    ...map.always_specs.filter((s) => !s.startsWith('$comment')),
    ...map.features.flatMap((f) => f.specs),
  ];

  for (const name of declared) {
    assert.ok(onDisk.has(name), `map declares a spec that does not exist: ${name}`);
  }
  for (const feature of map.features) {
    assert.ok(Array.isArray(feature.specs) && feature.specs.length > 0, 'a feature rule has no specs');
    assert.ok(Array.isArray(feature.match) && feature.match.length > 0, 'a feature rule has no match globs');
  }
});

test('CLI: --mode areas reads a changed-files list and prints key=value lines', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-selection-'));
  try {
    const files = path.join(dir, 'changed.txt');
    writeFileSync(files, 'apps/web/src/features/warehouses/warehouse-form.tsx\n');
    const out = execFileSync(process.execPath, [selectorPath, '--mode', 'areas', '--files', files], {
      encoding: 'utf8',
    });
    assert.match(out, /^gate=scoped$/m);
    assert.match(out, /^api=0$/m);
    assert.match(out, /^web=1$/m);
    assert.match(out, /^e2e_mode=affected$/m);
    assert.match(out, /^e2e_specs=.*warehouses\.spec\.ts/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: --mode e2e prints the flat scope for GITHUB_OUTPUT', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-selection-'));
  try {
    const files = path.join(dir, 'changed.txt');
    writeFileSync(files, 'docs/lessons/x.md\n');
    const out = execFileSync(process.execPath, [selectorPath, '--mode', 'e2e', '--files', files], {
      encoding: 'utf8',
    });
    assert.match(out, /^mode=skip$/m);
    assert.match(out, /^specs=$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
