import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

async function readRepoFile(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

test('delivery plan documents phase workflow expectations', async () => {
  const plan = await readRepoFile('plans/tuari-multi-agent-delivery-plan.md');

  assert.match(plan, /## Branch Naming Rules/);
  assert.match(plan, /agent\/phaseN-short-description/);
  assert.match(plan, /integration\/phaseN-short-description/);
  assert.match(plan, /Phase 0/);
  assert.match(plan, /Phase 1/);
  assert.match(plan, /automated validation/i);
});

test('branch verification checklist captures required review prompts', async () => {
  const checklist = await readRepoFile('plans/templates/branch-verification-checklist.md');

  assert.match(checklist, /## Branch Context/);
  assert.match(checklist, /## Verification Checklist/);
  assert.match(checklist, /Branch naming matches the documented phase convention/);
  assert.match(checklist, /At least one automated validation command exists/);
  assert.match(checklist, /## Validation Log/);
});

test('branch workflow doc and PR templates stay aligned', async () => {
  const packageJson = JSON.parse(await readRepoFile('package.json'));
  const readme = await readRepoFile('README.md');
  const workflowDoc = await readRepoFile('docs/branch-workflow.md');
  const agentTemplate = await readRepoFile('.github/PULL_REQUEST_TEMPLATE/agent-branch.md');
  const integrationTemplate = await readRepoFile('.github/PULL_REQUEST_TEMPLATE/integration-branch.md');

  assert.equal(packageJson.scripts['check:workflow-assets'], 'node --test ./tests/workflow-assets.test.mjs');
  assert.match(packageJson.scripts.lint, /check:workflow-assets/);
  assert.match(readme, /docs\/branch-workflow\.md/);
  assert.match(readme, /plans\/tuari-multi-agent-delivery-plan\.md/);
  assert.match(workflowDoc, /Phase 1 establishes reusable workflow assets/);
  assert.match(workflowDoc, /pull request should state the gap explicitly/i);

  for (const template of [agentTemplate, integrationTemplate]) {
    assert.match(template, /## Summary/);
    assert.match(template, /## Validation/);
    assert.match(template, /## Review Notes/);
    assert.match(template, /pnpm check:workflow-assets/);
  }
});

test('CI/CD workflow files exist and have correct triggers', async () => {
  const release = await readRepoFile('.github/workflows/release.yml');
  const nightly = await readRepoFile('.github/workflows/nightly.yml');
  const beta = await readRepoFile('.github/workflows/beta.yml');

  // Release: tag push trigger
  assert.match(release, /on:/);
  assert.match(release, /tags:[\s\S]*?'v\*\.\*\.\*'/);
  assert.match(release, /windows-latest/);
  assert.match(release, /environment: stable/);
  assert.match(release, /softprops\/action-gh-release/);
  assert.match(release, /sign-update\.mjs/);
  assert.match(release, /verify-release-assets\.mjs/);
  assert.match(release, /Swatinem\/rust-cache/);
  assert.match(release, /cache: pnpm/);
  assert.match(release, /Rust Core boundaries/);

  // Nightly: schedule + workflow_dispatch
  assert.match(nightly, /schedule:/);
  assert.match(nightly, /cron:.*0 0/);
  assert.match(nightly, /workflow_dispatch/);
  assert.match(nightly, /environment: nightly/);
  assert.match(nightly, /sign-update\.mjs/);
  assert.match(nightly, /verify-release-assets\.mjs/);
  assert.match(nightly, /Rust Core boundaries/);

  // Beta: manual dispatch with version input
  assert.match(beta, /workflow_dispatch/);
  assert.match(beta, /version/);
  assert.match(beta, /environment: beta/);
  assert.match(beta, /sign-update\.mjs/);
  assert.match(beta, /verify-release-assets\.mjs/);
  assert.match(beta, /Rust Core boundaries/);
});

test('publish workflows run the installer smoke test after packaging and before the upload', async () => {
  const channels = [
    { name: 'beta.yml', channel: 'beta', uploadMarker: 'gh release create' },
    { name: 'release.yml', channel: 'stable', uploadMarker: 'softprops/action-gh-release' },
    { name: 'nightly.yml', channel: 'nightly', uploadMarker: 'gh release create' },
  ];

  for (const { name, channel, uploadMarker } of channels) {
    const source = await readRepoFile(path.join('.github/workflows', name));
    const lines = source.split('\n');

    // Find a real step by name. A commented-out step does not match, because the
    // regex requires the line to START with `- name:` (a `# - name:` line is a
    // comment, not a step) — plain text search would happily match the smoke
    // command inside a comment.
    const stepStart = (needle) =>
      lines.findIndex((line) => /^\s*- name:/.test(line) && line.includes(needle));
    const stepAt = (index) => {
      const indent = lines[index].match(/^\s*/)[0];
      let end = lines.length;
      for (let i = index + 1; i < lines.length; i += 1) {
        if (lines[i].startsWith(`${indent}- name:`)) {
          end = i;
          break;
        }
      }
      return lines.slice(index, end).join('\n');
    };
    const stepContaining = (needle) =>
      lines.findIndex((line, index) =>
        /^\s*- name:/.test(line) && stepAt(index).includes(needle),
      );

    const smokeStep = stepStart('Run installer smoke test');
    assert.ok(smokeStep !== -1, `${name} must have a 'Run installer smoke test' step`);
    const smokeBlock = stepAt(smokeStep);

    // The gate must run the built artifact. An index of -1 means the workflow
    // does not run it at all.
    assert.ok(
      smokeBlock.includes('scripts/smoke/installer-smoke.mjs'),
      `${name} must run scripts/smoke/installer-smoke.mjs`,
    );

    // A disabled step is not a gate: `if: false` (or a false expression) would
    // keep the command in the file while skipping it at run time.
    assert.doesNotMatch(
      smokeBlock,
      /^\s*if:\s*(false|\$\{\{\s*false\s*\}\})\s*$/m,
      `${name} must not disable the installer smoke test step`,
    );

    // It must run after packaging (no rebuild) and before the release upload,
    // or a non-starting installer can still be published.
    const packageStep = stepContaining('portable:only');
    assert.ok(packageStep !== -1, `${name} should build the portable package`);
    assert.ok(
      packageStep < smokeStep,
      `${name} must run the installer smoke test after packaging`,
    );

    const uploadStep = stepContaining(uploadMarker);
    assert.ok(uploadStep !== -1, `${name} should upload a release`);
    assert.ok(
      smokeStep < uploadStep,
      `${name} must run the installer smoke test before the release upload`,
    );

    // It must point at the staged artifact the release uploads, not at a
    // rebuild in the bundle directory. These arguments are asserted INSIDE the
    // smoke step: searching the whole file would pass if the smoke command lost
    // its arguments while the same filenames appeared elsewhere in the workflow.
    assert.match(
      smokeBlock,
      new RegExp(`tuari-\\$version-${channel}-portable\\.zip`),
      `${name} must point the installer smoke test at the staged portable zip`,
    );
    assert.match(
      smokeBlock,
      /--installer/,
      `${name} must pass the staged NSIS installer to the smoke test`,
    );
  }
});

test('the gated release workflow owns publication', async () => {
  // A tag push runs release.yml (with the smoke gate) and release-metadata.yml
  // at the same time. If metadata publishes the release, a tag can go public
  // while the gate is still running — or after it failed, because the gate only
  // stops the binary upload. Publication therefore belongs to the gated
  // workflow, and metadata must never un-draft a release.
  const release = await readRepoFile('.github/workflows/release.yml');
  const metadata = await readRepoFile('.github/workflows/release-metadata.yml');

  const lines = release.split("\n");
  const smoke = lines.findIndex((l) => /^\s*- name:/.test(l) && l.includes('Run installer smoke test'));
  const publish = lines.findIndex((l) => /^\s*- name:/.test(l) && l.includes('Publish release'));
  assert.ok(smoke !== -1, 'release.yml must run the installer smoke test');
  assert.ok(publish !== -1, 'release.yml must publish the release');
  assert.ok(smoke < publish, 'release.yml must publish only after the smoke gate');
  assert.match(
    lines.slice(publish, publish + 24).join("\n"),
    /--draft=false/,
    'release.yml must un-draft the release after the gate passes',
  );

  assert.doesNotMatch(
    metadata,
    /--draft=false/,
    'release-metadata.yml must not publish the release: release.yml owns publication after the smoke gate',
  );
});

test('workflow files do not embed a column-0 PowerShell here-string terminator', async () => {
  const workflowDir = path.join(rootDir, '.github/workflows');
  const entries = await readdir(workflowDir);
  const workflows = entries.filter((name) => name.endsWith('.yml'));

  assert.ok(workflows.length > 0, 'expected workflow files to exist');

  for (const name of workflows) {
    const source = await readRepoFile(path.join('.github/workflows', name));
    // A `'@` at column 0 ends a YAML block scalar early and makes the whole
    // workflow unparseable. This is the regression that broke beta, release,
    // and nightly before they could parse at all.
    assert.doesNotMatch(source, /^'@/m, `${name} has a column-0 here-string terminator`);
  }
});

test('release workflows join the generated key output before splitting', async () => {
  for (const name of ['beta.yml', 'release.yml', 'nightly.yml']) {
    const source = await readRepoFile(path.join('.github/workflows', name));

    // Node prints each PEM on its own line and PowerShell captures that as a
    // string array, so the output must be joined before `-split`. Without the
    // join, $parts[0] holds only the first PEM line and signing uses a
    // truncated private key.
    assert.match(
      source,
      /\$result = \(node -e \$nodeScript\) -join "`n"/,
      `${name} must join the key output before splitting it`,
    );
    assert.doesNotMatch(
      source,
      /\$result = node -e \$nodeScript\n\s*\$parts =/,
      `${name} must not split the unjoined key output`,
    );
    assert.match(source, /\$parts\[0\] \| Out-File -FilePath \(Join-Path \$env:RUNNER_TEMP "signing-key\.pem"\)/);
    assert.match(source, /\$parts\[1\] \| Out-File -FilePath \(Join-Path \$env:RUNNER_TEMP "verification-key\.pem"\)/);
  }
});

test('release guard aborts when the main fetch fails', async () => {
  const release = await readRepoFile('.github/workflows/release.yml');

  // A failed fetch must abort before merge-base reads FETCH_HEAD. Otherwise a
  // stale FETCH_HEAD left by checkout can satisfy the ancestry check and let
  // an off-main tag through.
  const fetchIndex = release.indexOf('git fetch --no-tags');
  const mergeBaseIndex = release.indexOf('git merge-base --is-ancestor HEAD FETCH_HEAD');

  assert.ok(fetchIndex !== -1, 'release.yml should fetch main');
  assert.ok(mergeBaseIndex !== -1, 'release.yml should check ancestry against FETCH_HEAD');
  assert.ok(fetchIndex < mergeBaseIndex, 'the fetch must run before merge-base');

  const between = release.slice(fetchIndex, mergeBaseIndex);
  assert.match(between, /if \(\$LASTEXITCODE -ne 0\)/, 'the fetch must be followed by an exit-code check');
  assert.match(between, /exit 1/, 'a failed fetch must abort the job');
});
