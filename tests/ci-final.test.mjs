import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectCiScope } from '../scripts/ci/ci-scope.mjs';
import { acceptanceErrors } from '../scripts/ci/ci-acceptance.mjs';

const success = (outputs = { api: 'false', web: 'false', rust: 'false', encryption: 'false', e2e_mode: 'skip', e2e_specs: '' }) => ({
  detect: { result: 'success', outputs },
  lint: { result: 'success' }, typecheck: { result: 'success' },
  build: { result: 'success' }, audit: { result: 'success' },
  'test-api': { result: 'skipped' }, 'test-web': { result: 'skipped' },
  'test-rust': { result: 'skipped' }, 'test-e2e': { result: 'skipped' },
  'prove-encryption': { result: 'skipped' },
});

test('unknown, empty, critical and forced CI scopes run every area', () => {
  for (const files of [[], ['unknown.txt'], ['.github/workflows/ci.yml'], ['pnpm-lock.yaml'],
    ['scripts/ci/ci-scope.mjs'], ['scripts/ci/ci-acceptance.mjs'], ['tests/ci-final.test.mjs']]) {
    assert.deepEqual(selectCiScope(files), {
      api: 'true', web: 'true', rust: 'true', encryption: 'true', e2e_mode: 'full', e2e_specs: '',
    });
  }
  for (const options of [{ event: 'push' }, { event: 'workflow_dispatch' }, { full: true }]) {
    assert.equal(selectCiScope(['README.md'], options).e2e_mode, 'full');
    assert.equal(selectCiScope(['README.md'], options).rust, 'true');
  }
});

test('known docs skip expensive areas; API and Rust changes remain covered', () => {
  assert.deepEqual(selectCiScope(['README.md']), {
    api: 'false', web: 'false', rust: 'false', encryption: 'false', e2e_mode: 'skip', e2e_specs: '',
  });
  const api = selectCiScope(['apps/api/src/modules/inventory/inventory.service.ts']);
  assert.equal(api.api, 'true');
  const rust = selectCiScope(['apps/desktop/src-tauri/src/license.rs']);
  assert.equal(rust.rust, 'true');
  assert.equal(rust.encryption, 'true');
  assert.equal(selectCiScope(['README.md']).encryption, 'false');
});

test('aggregate permits only successful checks and selector-proven skips', () => {
  assert.deepEqual(acceptanceErrors(success()), []);
  const scope = selectCiScope([], { full: true });
  const needs = success(scope);
  for (const name of ['test-api', 'test-web', 'test-rust', 'test-e2e', 'prove-encryption']) needs[name].result = 'success';
  assert.deepEqual(acceptanceErrors(needs), []);
  for (const name of Object.keys(needs)) {
    for (const result of ['failure', 'cancelled', 'skipped', '']) {
      const broken = structuredClone(needs);
      broken[name].result = result;
      assert.ok(acceptanceErrors(broken).length, `${name} ${result} must fail`);
    }
    const missing = structuredClone(needs);
    delete missing[name];
    assert.ok(acceptanceErrors(missing).length, `${name} missing must fail`);
  }
});

test('aggregate accepts GitHub-omitted empty specs only for full or skipped E2E', () => {
  for (const e2e_mode of ['full', 'skip']) {
    const needs = success({ api: 'false', web: 'false', rust: 'false', encryption: 'false', e2e_mode });
    if (e2e_mode === 'full') needs['test-e2e'].result = 'success';
    assert.deepEqual(acceptanceErrors(needs), []);
  }
  const affected = success({ ...success().detect.outputs, e2e_mode: 'affected' });
  assert.ok(acceptanceErrors(affected).includes('invalid e2e specs'));
  for (const e2e_specs of [null, 0, false]) {
    assert.ok(acceptanceErrors(success({ ...success().detect.outputs, e2e_specs })).includes('invalid e2e specs'));
  }
});

test('aggregate rejects missing, malformed or contradictory selector proof', () => {
  for (const outputs of [{}, { api: 'false' }, { ...success().detect.outputs, rust: '0' },
    { ...success().detect.outputs, encryption: 'yes' },
    { ...success().detect.outputs, e2e_mode: 'affected', e2e_specs: '' },
    { ...success().detect.outputs, e2e_mode: 'skip', e2e_specs: 'tests/e2e/auth.spec.ts' },
    { ...success().detect.outputs, e2e_mode: 'affected', e2e_specs: '--config=evil' }]) {
    assert.ok(acceptanceErrors(success(outputs)).length, JSON.stringify(outputs));
  }
  assert.ok(acceptanceErrors({}).length);
});

test('the CI-invoked SQLCipher proof command includes the availability regressions', () => {
  const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const proofCommand = rootPackage.scripts['check:sqlcipher-proof'];
  assert.ok(proofCommand.includes('./tests/sqlcipher-encryption-proof.test.mjs'));
  assert.ok(proofCommand.includes('./apps/desktop/scripts/sqlcipher-availability.test.mjs'));
  assert.ok(ci.includes('- run: pnpm check:sqlcipher-proof'));
  assert.ok(ci.includes('- run: node --test tests/ci-final.test.mjs tests/workflow-policy.test.mjs'));
});

test('Rust CI requires both Linux and Windows crate tests under the same acceptance result', () => {
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const rust = ci.slice(ci.indexOf('\n  test-rust:'), ci.indexOf('\n  test-api:'));
  assert.match(rust, /if: \$\{\{ needs\.detect\.outputs\.rust == 'true' \}\}/);
  assert.match(rust, /needs: detect/);
  assert.match(rust, /runs-on: \$\{\{ matrix\.os \}\}/);
  assert.match(rust, /fail-fast: false/);
  assert.match(rust, /os: \[ubuntu-24\.04, windows-2022\]/);
  assert.doesNotMatch(rust, /continue-on-error|--no-run|--lib(?=\s*\n)/);
  assert.match(rust, /name: Install Tauri system deps\n\s+if: runner\.os == 'Linux'/);
  assert.match(rust, /name: "Verify Rust Core boundaries \(no bare tauri imports\)"\n\s+if: runner\.os == 'Linux'/);
  assert.match(rust, /uses: actions\/setup-node@v4/);
  assert.match(rust, /uses: dtolnay\/rust-toolchain@stable/);
  assert.match(rust, /name: Test Rust Core\n(?:\s*#[^\n]*\n)*\s+run: cargo test --manifest-path apps\/desktop\/src-tauri\/Cargo\.toml\n/);
  assert.match(rust, /name: Lint Rust Core\n\s+if: runner\.os == 'Linux'\n\s+run: cargo clippy --manifest-path apps\/desktop\/src-tauri\/Cargo\.toml --lib -- -D warnings/);
});

test('CI wiring exposes one always-running acceptance check and force-full events', () => {
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(ci, /types: \[opened, synchronize, reopened, labeled\]/);
  assert.match(ci, /push:\n\s+branches: \[develop\]/);
  assert.match(ci, /name: CI acceptance/);
  assert.match(ci, /needs: \[detect, lint, typecheck, test-rust, test-api, test-web, test-e2e, build, audit, prove-encryption\]/);
  assert.match(ci, /if: \$\{\{ always\(\) \}\}/);
  assert.match(ci, /NEEDS_JSON: \$\{\{ toJSON\(needs\) \}\}/);
  assert.match(ci, /node scripts\/ci\/ci-acceptance.mjs/);
  assert.match(ci, /--no-renames/);
  assert.match(ci, /e2e:full/);
  assert.match(ci, /encryption: \$\{\{ steps.scope.outputs.encryption \}\}/);
  assert.match(ci, /prove-encryption:\n[\s\S]*needs: detect/);
  const encryption = ci.slice(ci.indexOf('\n  prove-encryption:'), ci.indexOf('\n  audit:'));
  assert.doesNotMatch(encryption, /^    if:/m, 'Required encryption proof must run for fork PRs too');
  assert.doesNotMatch(encryption, /secrets\.|permissions:/);
  assert.match(ci, /permissions:\n  contents: read\n  pull-requests: read/);
  assert.match(ci, /pnpm audit --audit-level high/);
  assert.doesNotMatch(ci, /continue-on-error: true/);
  const e2e = ci.slice(ci.indexOf('\n  test-e2e:'), ci.indexOf('\n  build:'));
  assert.match(e2e, /runs-on: ubuntu-24\.04/);
  assert.equal([...e2e.matchAll(/^    if:/gm)].length, 1, 'E2E must have exactly one job condition');
  assert.match(e2e, /if: \$\{\{ needs\.detect\.outputs\.e2e_mode != 'skip' \}\}/);
  assert.doesNotMatch(e2e, /head\.repo\.full_name/);
});
