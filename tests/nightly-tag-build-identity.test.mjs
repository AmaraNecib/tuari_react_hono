import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { updateNightlyTag } from '../scripts/update-nightly-tag.mjs';

const sourceSha = 'c253231d4a581a083818d891677c481c143fff23';
const oldSha = '17911dc14211730bec6982707f518b4c84dafa19';
const repository = 'owner/repository';
const sourceObject = sha => ({ object: { sha, type: 'commit' } });
const ok = sha => ({ status: 200, body: sourceObject(sha) });

// Inject the subprocess boundary directly. Tests cannot resolve a real gh binary,
// inherit credentials into a fake executable, or contact GitHub.
function scenario(responses) {
  const calls = [];
  const execute = (command, args, options) => {
    calls.push({ command, args, options });
    const response = responses[calls.length - 1];
    assert.ok(response, 'unexpected API request');
    if (response.error) return { error: new Error(response.error) };
    return {
      status: response.exitCode ?? (response.status >= 400 ? 1 : 0),
      stdout: response.raw ?? `HTTP/2.0 ${response.status} Mock\r\n\r\n${JSON.stringify(response.body ?? {})}`,
      stderr: '',
    };
  };
  return { calls, run: () => updateNightlyTag({ repository, sourceSha }, { execute }) };
}

test('updates the existing ref with force=false through the correct write endpoint', () => {
  const s = scenario([ok(oldSha), ok(sourceSha), ok(sourceSha)]);
  s.run();
  assert.equal(s.calls.length, 3);
  assert.deepEqual(s.calls[1].args, ['api', '--include', '--method', 'PATCH', 'repos/owner/repository/git/refs/tags/nightly', '-f', `sha=${sourceSha}`, '-F', 'force=false']);
  assert.deepEqual(s.calls[0].args, ['api', '--include', 'repos/owner/repository/git/ref/tags/nightly']);
  for (const call of s.calls) {
    assert.equal(call.options.shell, false);
    assert.equal(call.options.timeout, 30_000);
  }
});

test('creates a missing ref only after an actual HTTP404 then verifies its identity', () => {
  const s = scenario([{ status: 404 }, { status: 201, body: sourceObject(sourceSha) }, ok(sourceSha)]);
  s.run();
  assert.deepEqual(s.calls[1].args, ['api', '--include', '--method', 'POST', 'repos/owner/repository/git/refs', '-f', 'ref=refs/tags/nightly', '-f', `sha=${sourceSha}`]);
  assert.equal(s.calls.length, 3);
});

test('already correct ref is verified without a write', () => {
  const s = scenario([ok(sourceSha), ok(sourceSha)]);
  s.run();
  assert.equal(s.calls.length, 2);
  assert.ok(s.calls.every(call => !call.args.includes('--method')));
});

test('permission failures never create or move a ref', () => {
  const s = scenario([{ status: 403 }]);
  assert.throws(s.run, /HTTP 403/);
  assert.equal(s.calls.length, 1);
});

test('non-fast-forward rejection fails without a force retry', () => {
  const s = scenario([ok(oldSha), { status: 422 }]);
  assert.throws(s.run, /non-fast-forward/);
  assert.equal(s.calls.length, 2);
  assert.ok(!s.calls.some(call => call.args.includes('force=true')));
});

test('wrong readback remains failure after a successful write', () => {
  const s = scenario([ok(oldSha), ok(sourceSha), ok(oldSha)]);
  assert.throws(s.run, /identity mismatch/);
  assert.equal(s.calls.length, 3);
});

test('missing HTTP status, transport failure and malformed readback fail closed', () => {
  assert.throws(scenario([{ raw: JSON.stringify(sourceObject(sourceSha)) }]).run, /HTTP unknown/);
  assert.throws(scenario([{ error: 'timeout' }]).run, /timeout/);
  assert.throws(scenario([ok(sourceSha), { status: 200, body: {} }]).run, /directly to a commit/);
});

test('rejects unsafe repository or source input before executing anything', () => {
  const execute = () => assert.fail('invalid input must not reach a subprocess');
  assert.throws(() => updateNightlyTag({ repository: 'bad;repo/x', sourceSha }, { execute }), /repository/);
  assert.throws(() => updateNightlyTag({ repository, sourceSha: '--bad' }, { execute }), /SHA/);
});

test('workflow uses checked-out source after smoke gates and before release mutation', () => {
  const workflow = readFileSync(new URL('../.github/workflows/nightly.yml', import.meta.url), 'utf8');
  const index = name => workflow.indexOf(`- name: ${name}`);
  const smoke = index('Run installer smoke test');
  const tag = index('Update nightly tag');
  const release = index('Upload to nightly release');
  assert.ok(smoke > 0 && tag > smoke && release > tag);
  const capture = index('Capture checked-out source SHA');
  assert.ok(capture > index('Checkout repository') && capture < smoke);
  assert.match(workflow.slice(capture, smoke), /git rev-parse HEAD/);
  assert.match(workflow.slice(tag, release), /scripts\/update-nightly-tag\.mjs "\$\{\{ steps\.source\.outputs\.sha \}\}"/);
  const publish = workflow.slice(release);
  assert.match(publish, /--target "\$\{\{ steps\.source\.outputs\.sha \}\}"/);
  assert.doesNotMatch(publish, /--target "\$env:GITHUB_SHA"/);
  assert.match(publish, /\$deleteExitCode = \$LASTEXITCODE/);
  assert.match(publish, /\$createExitCode = \$LASTEXITCODE/);
  assert.match(publish, /\$artifactFiles/);
  assert.match(workflow, /persist-credentials: false/);
  const helper = readFileSync(new URL('../scripts/update-nightly-tag.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(helper, /\/releases|\/assets/);
});
