import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const helper = path.join(root, 'scripts/update-nightly-tag.mjs');
function runScenario(t, { responses, githubSha = '17911dc14211730bec6982707f518b4c84dafa19' }) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nightly-tag-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const repository = path.join(directory, 'repo');
  mkdirSync(repository);
  execFileSync('git', ['init', '-q', repository]);
  execFileSync('git', ['-C', repository, 'config', 'user.email', 'nightly-test@example.invalid']);
  execFileSync('git', ['-C', repository, 'config', 'user.name', 'Nightly test']);
  writeFileSync(path.join(repository, 'source.txt'), 'nightly source\n');
  execFileSync('git', ['-C', repository, 'add', 'source.txt']);
  execFileSync('git', ['-C', repository, '-c', 'commit.gpgsign=false', 'commit', '-qm', 'build source']);
  const sourceSha = execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

  const bin = path.join(directory, 'bin');
  mkdirSync(bin);
  const scenarioPath = path.join(directory, 'scenario.json');
  const logPath = path.join(directory, 'calls.jsonl');
  const resolvedResponses = JSON.parse(JSON.stringify(responses).replaceAll('$SOURCE_SHA', sourceSha));
  writeFileSync(scenarioPath, JSON.stringify({ sourceSha, responses: resolvedResponses }));
  const fakeGh = path.join(bin, process.platform === 'win32' ? 'gh.cmd' : 'gh');
  const fakeGhBody = `#!/usr/bin/env node\n` +
    `const fs = require('node:fs');\n` +
    `const scenario = JSON.parse(fs.readFileSync(process.env.NIGHTLY_TAG_SCENARIO, 'utf8'));\n` +
    `const args = process.argv.slice(2);\n` +
    `fs.appendFileSync(process.env.NIGHTLY_TAG_CALLS, JSON.stringify(args) + '\\n');\n` +
    `const index = fs.readFileSync(process.env.NIGHTLY_TAG_CALLS, 'utf8').trim().split('\\n').length - 1;\n` +
    `const response = scenario.responses[index];\n` +
    `if (!response) process.exit(90);\n` +
    `if (response.status) process.stdout.write('HTTP/2.0 ' + response.status + ' Mock\\n\\n');\n` +
    `if (response.body) process.stdout.write(JSON.stringify(response.body));\n` +
    `if (response.error) process.stderr.write(response.error);\n` +
    `process.exit(response.exitCode ?? (response.status >= 400 ? 1 : 0));\n`;
  writeFileSync(fakeGh, process.platform === 'win32' ? `@node "${path.join(directory, 'fake-gh.cjs')}" %*\r\n` : fakeGhBody);
  if (process.platform === 'win32') writeFileSync(path.join(directory, 'fake-gh.cjs'), fakeGhBody.replace('#!/usr/bin/env node\n', ''));
  else chmodSync(fakeGh, 0o755);

  const inheritedPath = process.env.PATH.split(path.delimiter)
    .filter((entry) => !/GitHub CLI/i.test(entry));
  const env = {
    ...process.env,
    PATH: [bin, ...inheritedPath].join(path.delimiter),
    GITHUB_REPOSITORY: 'AmaraNecib/tuari_react_hono',
    GITHUB_SHA: githubSha,
    NIGHTLY_TAG_SCENARIO: scenarioPath,
    NIGHTLY_TAG_CALLS: logPath,
  };
  const result = spawnSync(process.execPath, [helper, sourceSha], { cwd: repository, env, encoding: 'utf8' });
  return {
    result,
    calls: exists(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [],
    sourceSha,
  };
}

function exists(file) {
  try { readFileSync(file); return true; } catch { return false; }
}

const sourceObject = (sha) => ({ object: { sha, type: 'commit' } });

test('advances an existing nightly ref without force and verifies exact source readback', (t) => {
  const { result, calls, sourceSha } = runScenario(t, {
    responses: [
      { status: 200, body: sourceObject('1111111111111111111111111111111111111111') },
      { status: 200, body: sourceObject('$SOURCE_SHA') },
      { status: 200, body: sourceObject('$SOURCE_SHA') },
    ],
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(calls.length, 3);
  assert.ok(calls[1].includes('--method') && calls[1].includes('PATCH'));
  assert.ok(calls[1].includes('force=false'), 'existing ref update must explicitly disable force');
  assert.ok(calls[1].includes(`sha=${sourceSha}`), 'PATCH must use the fixture commit SHA, not the different GITHUB_SHA value');
  assert.notEqual(sourceSha, '17911dc14211730bec6982707f518b4c84dafa19');
});

test('creates a missing nightly ref only after an actual 404 and verifies readback', (t) => {
  const { result, calls, sourceSha } = runScenario(t, {
    responses: [
      { status: 404, error: 'Not Found' },
      { status: 201, body: sourceObject('$SOURCE_SHA') },
      { status: 200, body: sourceObject('$SOURCE_SHA') },
    ],
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(calls.length, 3);
  assert.ok(calls[1].includes('--method') && calls[1].includes('POST'));
  assert.ok(calls[1].includes('ref=refs/tags/nightly'));
  assert.ok(calls[1].includes(`sha=${sourceSha}`));
});

test('fails closed on permission/API errors instead of creating a ref', (t) => {
  const { result, calls } = runScenario(t, {
    responses: [{ status: 403, error: 'Resource not accessible by integration' }],
  });
  assert.notEqual(result.status, 0);
  assert.equal(calls.length, 1, '403 must not be treated as a missing ref');
  assert.match(result.stderr + result.stdout, /403|permission|accessible/i);
});

test('reports non-fast-forward rejection and never force-updates the ref', (t) => {
  const { result, calls } = runScenario(t, {
    responses: [
      { status: 200, body: sourceObject('1111111111111111111111111111111111111111') },
      { status: 422, error: 'Reference update failed' },
    ],
  });
  assert.notEqual(result.status, 0);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes('force=false'));
  assert.match(result.stderr + result.stdout, /non-fast-forward|diverged|force/i);
});

test('rejects a successful write whose readback names another commit', (t) => {
  const { result, calls } = runScenario(t, {
    responses: [
      { status: 200, body: sourceObject('1111111111111111111111111111111111111111') },
      { status: 200, body: sourceObject('2222222222222222222222222222222222222222') },
      { status: 200, body: sourceObject('2222222222222222222222222222222222222222') },
    ],
  });
  assert.notEqual(result.status, 0);
  assert.equal(calls.length, 3, 'a mismatched write response still requires readback');
  assert.match(result.stderr + result.stdout, /readback|expected.*found|identity/i);
});

test('workflow updates tag only after all smoke gates and targets release at checked-out SHA', () => {
  const workflow = readFileSync(path.join(root, '.github/workflows/nightly.yml'), 'utf8');
  const stepIndex = (name) => workflow.indexOf(`- name: ${name}`);
  const smoke = stepIndex('Run installer smoke test');
  const tag = stepIndex('Update nightly tag');
  const release = stepIndex('Upload to nightly release');
  assert.ok(smoke >= 0 && tag > smoke && release > tag);
  const sourceCapture = stepIndex('Capture checked-out source SHA');
  assert.ok(sourceCapture > stepIndex('Checkout repository') && sourceCapture < smoke);
  assert.match(workflow.slice(sourceCapture, smoke), /git rev-parse HEAD/);
  assert.match(workflow.slice(tag, release), /scripts\/update-nightly-tag\.mjs/);
  assert.match(workflow.slice(release), /--target "\$\{\{ steps\.source\.outputs\.sha \}\}"/);
  assert.doesNotMatch(workflow.slice(release), /--target "\$env:GITHUB_SHA"/);
  const releaseBlock = workflow.slice(release);
  assert.match(releaseBlock, /LASTEXITCODE/);
  assert.match(releaseBlock, /gh release delete/);
  assert.match(releaseBlock, /gh release create/);
  assert.match(releaseBlock, /\$artifactFiles/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /concurrency:[\s\S]*?cancel-in-progress: true/);
  const helperSource = readFileSync(helper, 'utf8');
  assert.match(helperSource, /git\/ref\/tags\/nightly/);
  assert.doesNotMatch(helperSource, /\/releases|\/assets/);
});
