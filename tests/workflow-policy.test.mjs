import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('review reports are ignored and not tracked without deleting local history', () => {
  const tracked = execFileSync('git', ['ls-files', '.scratch/reviews'], { cwd: root, encoding: 'utf8' });
  assert.equal(tracked.trim(), '');
  const ignored = execFileSync('git', ['check-ignore', '.scratch/reviews/policy/example.md'], { cwd: root, encoding: 'utf8' });
  assert.equal(ignored.trim(), '.scratch/reviews/policy/example.md');
  assert.doesNotMatch(read('AGENTS.md'), /keep committed while the PR is open/);
});

test('active lifecycle instructions require affected proof, not automatic full-suite hooks', () => {
  const workflow = read('docs/engineering-workflow.md');
  assert.match(workflow, /Activation is pending/);
  assert.match(workflow, /Background verification and records/);
  assert.match(workflow, /elapsed duration/);
  assert.match(workflow, /one\s+fresh combined-delta review/);
  assert.match(workflow, /three distinct initial sessions/);
  for (const file of ['.husky/pre-push', '.agents/skills/implement/SKILL.md']) {
    assert.doesNotMatch(read(file), /pnpm test:api|pnpm test:web|full test suite once/);
  }
  for (const skill of ['feature-implement', 'guard']) {
    const content = read(`.agents/skills/${skill}/SKILL.md`);
    assert.match(content, /committed/);
    assert.match(content, /bounded|correction/i);
    assert.match(content, /ignored/);
    assert.doesNotMatch(content, /Greptile is not part of the gate|Greptile replaced/);
  }
  assert.match(read('docs/ci-final-activation.md'), /15368/);
  assert.match(read('docs/ci-final-activation.md'), /strict\/up-to-date/);
});

test('always-running lint gates include the copied encrypted runtime after installation', () => {
  const lint = read('.github/workflows/ci.yml').split('\n  lint:')[1].split('\n  typecheck:')[0];
  assert.match(lint, /pnpm install --frozen-lockfile[\s\S]*run: node --test apps\/desktop\/scripts\/runtime-staging\.test\.mjs tests\/sidecar-encryption\.test\.mjs/);
  assert.doesNotMatch(lint, /continue-on-error: true|\n    if:/);
  assert.match(read('tests/sidecar-encryption.test.mjs'), /assert\.ok\(!process\.env\.CI/);
});

test('Nightly diagnostics cannot execute the release job or use release credentials', () => {
  const nightly = read('.github/workflows/nightly.yml');
  const diagnostic = nightly.split('\n  portable-diagnostics:')[1].split('\n  nightly:')[0];
  assert.match(nightly, /diagnostic_only:[\s\S]*?type: boolean[\s\S]*?default: false/);
  assert.match(diagnostic, /if: github\.event_name == 'workflow_dispatch' && inputs\.diagnostic_only == true/);
  assert.match(nightly.split('\n  nightly:')[1], /if: github\.event_name != 'workflow_dispatch' \|\| inputs\.diagnostic_only != true/);
  assert.match(diagnostic, /permissions:\s*\n\s*contents: read/);
  assert.match(diagnostic, /persist-credentials: false\s*\n\s*ref: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(diagnostic, /secrets\.|GH_TOKEN|gh release|sign-update|version\.outputs|contents: write/);
  assert.match(diagnostic, /if: always\(\)[\s\S]*actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  assert.match(diagnostic, /path: \$\{\{ runner\.temp \}\}\/portable-diagnostics\//);
  assert.match(diagnostic, /retention-days: 3/);
  assert.match(nightly, /group: \$\{\{ inputs\.diagnostic_only && 'nightly-diagnostics' \|\| 'nightly' \}\}/);
});

test('portable trace preserves packaging exit and stops only its started recording', () => {
  const script = read('scripts/smoke/trace-portable-packaging.ps1');
  assert.match(script, /if \(Test-Path -LiteralPath \$OutputDirectory\).*Refusing to overwrite/);
  assert.match(script, /-start FileIO -start Minifilter -start Handle -filemode/);
  assert.match(script, /\$record\.packagingExitCode = \$LASTEXITCODE/);
  assert.match(script, /finally\s*\{\s*if \(\$traceOwned\)/);
  assert.doesNotMatch(script, /& \$wpr -cancel|CommandLine/);
  assert.match(script, /\$inspectionRoot = Join-Path \(\[System\.IO\.Path\]::GetTempPath\(\)\)/);
  assert.match(script, /Get-ChildItem -LiteralPath \$mode\.root -Recurse -File/);
  assert.doesNotMatch(script, /Copy-Item|Compress-Archive/);
  assert.match(script, /exit \$exitCode/);
});

test('portable diagnostics distinguish archive contents from both extraction modes', () => {
  const script = read('scripts/smoke/trace-portable-packaging.ps1');
  for (const evidence of ['zip-central-directory.json', 'producer-exe.json', 'tar-result.json', 'expand-original.stderr.log', 'expand-strict.stderr.log']) {
    assert.ok(script.includes(evidence), evidence);
  }
  assert.match(script, /ZipFile\]::OpenRead\(\$portableZip\)/);
  assert.match(script, /if \(\$record\.artifact\.tuariExeEntries\.Count -eq 0\)\s*\{\s*\$record\.inspectionExitCode = 1/);
  assert.match(script, /elseif \(-not \$extractedExe\.original -or -not \$extractedExe\.strict\)\s*\{\s*\$record\.inspectionExitCode = 1/);
  assert.match(script, /if \(\$record\.inspectionExitCode -ne 0 -and \$exitCode -eq 0\) \{ \$exitCode = 1 \}/);
});

test('Greptile is the scored gate without an extra local confidence step', () => {
  assert.match(read('docs/engineering-workflow.md'), /Greptile is the scored review gate/);
  assert.match(read('docs/engineering-workflow.md'), /No local score or separate confidence/);
});

test('wisdom is indexed by topics and every category link resolves', () => {
  const base = path.join(root, '.agents/wisdom');
  const flat = readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => entry.name);
  assert.deepEqual(flat, ['README.md']);
  let lessons = 0;
  for (const category of readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const dir = path.join(base, category.name);
    const index = readFileSync(path.join(dir, 'README.md'), 'utf8');
    const links = [...index.matchAll(/\]\(([^)]+\.md)\)/g)].map((match) => match[1]);
    assert.ok(links.length, `${category.name} needs indexed topics`);
    for (const link of links) {
      assert.ok(existsSync(path.join(dir, link)), `${category.name}/${link}`);
      lessons++;
    }
  }
  assert.ok(lessons > 0);
  assert.match(read('.agents/skills/capture-wisdom/SKILL.md'), /Only the parent writes/);
});

test('updated skill references and delegation template exist', () => {
  const skills = ['feature-implement', 'guard', 'implement', 'code-review', 'debate', 'test-audit',
    'capture-wisdom', 'crew-dispatch', 'writing-for-agents', 'improve-codebase-architecture'];
  for (const skill of skills) {
    const content = read(`.agents/skills/${skill}/SKILL.md`);
    assert.match(content, /^---\r?\nname:/);
    assert.match(content, /description:/);
  }
  const template = read('.agents/skills/writing-for-agents/delegation-template.md');
  for (const heading of ['Goal', 'Worktree and revision', 'Required reading', 'Scope and authority', 'Verification', 'Completion']) {
    assert.ok(template.includes(`## ${heading}`));
  }
});
