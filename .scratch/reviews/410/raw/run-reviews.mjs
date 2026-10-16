// Four independent review gates for issue #410 at HEAD 8e729c4d.
// Each `reviewer` child is read-only; the runtime persists its final answer to
// the bound evidence path, which is what the guard skill checks for freshness.

const REPO = "D:/projects/tuari_react_hono/worktrees/fix-encryption-ci-proof";
const HEAD = "8e729c4d864e288e3c28b48647f5bed1a3e4eacd";
const EVIDENCE = `${REPO}/.scratch/reviews/410`;

const common = [
  `REPO: ${REPO} (a git worktree, branch fix/410-encryption-ci-proof). Run every shell command with that directory as the working directory.`,
  `REVIEWED HEAD (final): ${HEAD}`,
  `BASE (lane start): d6164c65`,
  `DIFF UNDER REVIEW: \`git diff d6164c65...HEAD\` (31 files, about 6052 insertions, 166 deletions). Read .scratch/implementation/410-design.md before forming a view.`,
  `CONTEXT: commit 666104c6 merged branch fix/sqlcipher-fallback (the whole #402 implementation) into this lane. That merged content was already reviewed under .scratch/reviews/402/ - treat it as reviewed context, but still flag anything in the whole diff that would ship broken. The work #410 itself adds is: apps/desktop/scripts/sqlcipher-encryption-proof.mjs (new), tests/sqlcipher-encryption-proof.test.mjs (new), the prove-encryption job plus the detect.encryption output and path filter in .github/workflows/ci.yml, package.json check:sqlcipher-proof, docs/editions-and-features.md, .scratch/implementation/410-design.md.`,
  `ISSUE #410 SPEC (from GitHub, state OPEN): title "CI: prove the release artifact can actually encrypt (SQLCipher native build + cipher_version probe)". Task: on a runner with the Windows SDK installed - (1) build the sidecar with the real SQLCipher dependency, no --allow-plaintext; (2) assert PRAGMA cipher_version is non-empty against the built binding; (3) open a database with a key, write a row, close it, and assert the file does NOT start with "SQLite format 3"; (4) reopen it with the key and read the row back. Fail the job otherwise, and wire it into the desktop/CI path (not the publish gate only - a broken native build should be caught before release day). Why: the failure mode being replaced was silent - a warning in a build log, a green release, and a plaintext database for a customer who paid for encryption.`,
  `TIER: High-assurance (encryption at rest, plus a gate whose purpose is to stop a silent loss of that guarantee). Read findings strictly.`,
  `CONSTRAINT: this workstation cannot run the native path. \`node-gyp\` fails configure (missing Windows SDK) and there is no release artifact, so steps 1-5 of the spec can only execute on the Windows CI runner. State plainly what remains unproven instead of implying it was verified. Do NOT run the full api/web test suites (they are heavy and another lane holds a slot).`,
  `COMMIT 8e729c4d IS THE FIX COMMIT for a previous review round at 9e94d1fe. Verify each earlier finding against the CURRENT code and say explicitly whether it is fixed, partly fixed, or unfixed. The earlier findings are listed in your specific task below.`,
  `DO NOT EDIT ANY FILE. Return the complete markdown report as your final answer; the caller persists it.`,
].join("\n\n");

const tasks = [
  {
    key: "debate",
    output: `${EVIDENCE}/${HEAD}-debate.md`,
    task: [
      "Run the ADVERSARIAL DEBATE gate. Read .agents/skills/debate/SKILL.md and follow it exactly: take a critic position and a defender position in turn, then synthesize with severity scores.",
      "EARLIER DEBATE FINDINGS TO RE-VERIFY (from the round at 9e94d1fe):",
      "H1 (score 9): the prove-encryption job would die before reaching the proof because packages/contracts dist was never built before `pnpm --filter @tuari/desktop sidecar:build`. Check whether a contracts build step now precedes it in the job.",
      "H2 (score 8): `check:sqlcipher-proof` was missing from the CI lint job, so the new unit test never ran in CI (the root `lint` script is bypassed because `pnpm turbo lint` never reaches the root package). Check the lint job step list in .github/workflows/ci.yml.",
      "M1 (score 7): the artifact claim is proven nowhere except the Windows job. Decide what that means for this PR - is it a blocker or a known-and-reported gap?",
      "M2 (score 6): whether `node-gyp rebuild` can fetch SQLCipher sources under pnpm's blocked build scripts (pnpm-workspace.yaml only approves better-sqlite3 and prisma). Try to settle it by reading node_modules/better-sqlite3-sqlcipher/binding.gyp if it exists.",
      "M3 (score 5): the proof accepted a looser notion of the daily backup than the service does (any YYYY-MM-DD folder with tuari.sqlite, with no snapshot.json marker). Check findSnapshotDatabase in apps/desktop/scripts/sqlcipher-encryption-proof.mjs against apps/api/src/modules/backup/backup.service.ts.",
      "L1 (score 3): BETTER_AUTH_SECRET and NODE_ENV=development coupling in the sidecar boot inside the proof script.",
      "L2 (score 2): parseArgs produced NaN timeouts and threw a bare TypeError for a missing flag value. Check the new valueFor/timeoutFor helpers and their tests.",
      "Also scrutinize what 8e729c4d ADDED: the keyedTableNames helper and the new live-vs-backup table-list equality assertion, the BACKUP_MARKER_FILE_NAME requirement, and the doc rewrite in docs/editions-and-features.md.",
      "OUTPUT SHAPE: 'Verdict first' (approve, or request changes with a numbered list of one-line fixes), then critic findings with scores, then the defender's case, then a synthesis naming exactly what must change before merge and what may be deferred.",
    ].join("\n\n"),
  },
  {
    key: "test-audit",
    output: `${EVIDENCE}/${HEAD}-test-audit.md`,
    task: [
      "Run the TEST AUDIT gate. Read .agents/skills/test-audit/SKILL.md and follow it, doing all three roles yourself in this one context: edge case hunter, coverage analyst, quality reviewer. Do not spawn sub-agents.",
      "Run the pure-logic suite yourself: `node --test tests/sqlcipher-encryption-proof.test.mjs` (cheap, no slot needed). Report the real pass/fail count.",
      "THE CENTRAL QUESTION: would these tests fail if the guarantee were removed? Delete `db.pragma(\"key = ...\")` from WRITE_ROW_PROBE_SOURCE mentally, or ship plain better-sqlite3, and say which tests would notice. Answer it per assertion, not as a slogan.",
      "EARLIER TEST-AUDIT FINDINGS TO RE-VERIFY (round at 9e94d1fe):",
      "H1: the unit tests never ran in CI (missing `- run: pnpm check:sqlcipher-proof` in the lint job of .github/workflows/ci.yml).",
      "H2: assertion 2 (non-empty PRAGMA cipher_version) could pass vacuously. Check whether probeSqlcipherBinding in apps/desktop/scripts/sqlcipher-availability.mjs now rejects an empty version.",
      "M1: assertEncryptedDatabase was not exported and had no test. Check whether it is now exported and covered, including the empty and truncated cases.",
      "M2: the backup assertion ignored the app's own snapshot.json marker. Check whether the marker is now required and whether the marker's own contents are asserted.",
      "M3: the live-database check was only 'at least one table'. Check what replaced it (the table-list equality between the live database and the backup).",
      "OUTPUT SHAPE: verdict line; a table of assertion -> enforced by -> vacuous risk; then the three role sections; then findings graded HIGH/MEDIUM/LOW, each with the exact test to add and the exact file to add it to.",
    ].join("\n\n"),
  },
  {
    key: "code-review",
    output: `${EVIDENCE}/${HEAD}-code-review.md`,
    task: [
      "Run the TWO-AXIS CODE REVIEW gate. Read .agents/skills/code-review/SKILL.md and follow it, doing both axes yourself in this one context, in this order: STANDARDS first, then SPEC.",
      "STANDARDS means: does this change follow the repository's documented rules? Read AGENTS.md, docs/engineering-workflow.md, docs/development-workflow.md, .agents/wisdom/*.md, and the enforcement tests tests/workflow-assets.test.mjs and tests/repo-hygiene.test.mjs. Cite the rule you are applying.",
      "SPEC means: does it deliver issue #410 as written (the five requirements in the shared context)? Mark each requirement satisfied, partial, or missing, and name the code path that enforces it.",
      "EARLIER FINDINGS TO RE-VERIFY (round at 9e94d1fe):",
      "S1/H1 (medium): the new unit test never ran in CI, and the design doc claimed it did.",
      "S2/H2 (medium): the Windows runner was paid for on every PR because checkout/setup-node/pnpm install were not gated on the detect output. Check every step of the prove-encryption job, not just the ones the diff touched.",
      "S3 (medium): docs/editions-and-features.md contradicted itself about remaining work to ship encrypted_db.",
      "S4 (low): parseArgs did not guard a missing flag value or a NaN timeout, and neither case was tested.",
      "S5 (low): inconsistent file citations left by the merge resolution.",
      "Also check the new code on its own terms: does the job's required status check always report (a genuinely skipped job is not the same as a job that never runs)? Is the `encryption` path filter complete - would a change to tests/sqlcipher-encryption-proof.test.mjs alone pull the job in? Does the detect job's output actually exist for every ref?",
      "OUTPUT SHAPE: verdict first; Standards table with # / grade (high, medium, low) / finding / fix; Spec axis with each of the five requirements; then a consolidated HIGH/MEDIUM/LOW list. Cite file:line for every claim.",
    ].join("\n\n"),
  },
  {
    key: "design-pass",
    output: `${EVIDENCE}/${HEAD}-design-pass.md`,
    task: [
      "Run the mandatory DESIGN PASS, which this repository treats as a merge gate. Read and apply all three of these skills to THIS DIFF (not only to the new modules): .agents/skills/domain-modeling/SKILL.md, .agents/skills/codebase-design/SKILL.md, .agents/skills/improve-codebase-architecture/SKILL.md.",
      "The bar is INCREMENTAL. Fix nothing - you are read-only - but classify each finding as fix-now (cheap, in-scope for this PR) or file-a-follow-up-issue (with the exact proposed issue text). A finding whose fix would sprawl belongs in its own issue; say so rather than proposing the refactor.",
      "The repository's AGENTS.md says the outcome must be recorded even when the answer is 'nothing found' - silence is not evidence the pass ran. So end with an explicit list of what you checked and found nothing on.",
      "POINTS WORTH EXAMINING (verify, do not assume):",
      "- apps/desktop/scripts/sqlcipher-encryption-proof.mjs duplicates the backup-folder layout that apps/api/src/modules/backup/backup.policy.ts and backup.service.ts own: BACKUP_DIRECTORY_NAME_PATTERN, the file name tuari.sqlite, and the snapshot.json marker. Is that duplication deliberate and fail-closed, or should the rule be single-sourced - and if single-sourced, where would the seam go?",
      "- The plaintext predicate SQLITE_HEADER_MAGIC is deliberately NOT shared with the API's own check in apps/api/src/infrastructure/database/backup.service.ts or modules/backup. Is that a real decision or accidental duplication? Apply the deletion test to the shared-constant question.",
      "- Are findSnapshotDatabase, assertEncryptedDatabase and keyedTableNames deep or shallow modules? Are their names the project's vocabulary, or invented vocabulary that competes with backup.policy.ts / backup.service.ts?",
      "- Does the new prove-encryption job and the new detect.encryption output duplicate path-filter or detect rules that already exist elsewhere in .github/workflows/ci.yml in a way that will drift?",
      "- What friction did this diff create for the next person changing the backup layout, or the next person changing the CI job graph?",
      "OUTPUT SHAPE: Outcome first (clean / cheap fixes identified / follow-up issues needed); then one section per skill with file:line findings, each marked fix-now or file-follow-up; then the explicit 'checked and found nothing' list.",
    ].join("\n\n"),
  },
];

const results = await runs.all(
  tasks.map((entry) => ({
    key: entry.key,
    agent: "reviewer",
    task: `${common}\n\nYOUR SPECIFIC TASK\n\n${entry.task}`,
    output: entry.output,
  })),
);

return results.map((result, index) => ({
  key: tasks[index].key,
  ok: result.ok,
  runId: result.runId,
  outputReference: result.outputReference,
  outputPathMapping: result.outputPathMapping,
  error: result.error,
}));
