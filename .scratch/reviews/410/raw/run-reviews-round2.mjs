// Round 2 of the four review gates for issue #410, at HEAD ada25cc5.
// Round 1 ran at 8e729c4d; its findings were fixed in ada25cc5, and these
// children verify the fixes rather than re-litigating the whole stack.

const REPO = "D:/projects/tuari_react_hono/worktrees/fix-encryption-ci-proof";
const HEAD = "ada25cc548fd06b32a89a34841ac57c870cedd39";
const PREV = "8e729c4d";
const EVIDENCE = `${REPO}/.scratch/reviews/410`;

const common = [
  `REPO: ${REPO} (a git worktree, branch fix/410-encryption-ci-proof). Run every shell command with that directory as the working directory.`,
  `REVIEWED HEAD (final): ${HEAD}`,
  `BASE (lane start): d6164c65. The whole change under review is \`git diff d6164c65...HEAD\`.`,
  `ROUND 2: this is a re-review. Round 1 ran at ${PREV} and its findings were fixed in the single commit ${PREV}..HEAD. Read the whole change for context, then spend your effort on (a) whether each round-1 fix is correct and complete, and (b) whether the fix commit introduced anything new. Read \`.scratch/reviews/410/raw/8e729c4d864e288e3c28b48647f5bed1a3e4eacd-*.md\` for the round-1 findings and \`.scratch/implementation/410-design.md\` for the design.`,
  `ISSUE #410 SPEC (GitHub, state OPEN): title "CI: prove the release artifact can actually encrypt (SQLCipher native build + cipher_version probe)". Task: on a runner with the Windows SDK installed - (1) build the sidecar with the real SQLCipher dependency, no --allow-plaintext; (2) assert PRAGMA cipher_version is non-empty against the built binding; (3) open a database with a key, write a row, close it, assert the file does NOT start with "SQLite format 3"; (4) reopen it with the key and read the row back. Fail the job otherwise, and wire it into the desktop/CI path (not the publish gate only). Why: the failure mode replaced was silent - a warning in a build log, a green release, and a plaintext database for a customer who paid for encryption.`,
  `TIER: High-assurance (encryption at rest, plus a gate whose purpose is to stop a silent loss of that guarantee). Read findings strictly, but do not invent findings to look thorough: if the fix is right, say it is right.`,
  `CONSTRAINT: this workstation cannot run the native path (\`node-gyp\` fails configure, no Windows SDK, no release artifact), so spec steps 1-5 execute only on the Windows runner. State plainly what remains unproven instead of implying it was verified. Do NOT run the full api/web test suites (heavy, and another lane holds a slot).`,
  `DO NOT EDIT ANY FILE. Return the complete markdown report as your final answer; the caller persists it.`,
  `OUTPUT SHAPE: 'Verdict' first - a one-line APPROVE or REQUEST CHANGES. If you find nothing actionable, say so explicitly and list what you checked. Do not pad.`,
].join("\n\n");

const round1 = [
  "ROUND-1 FINDINGS THAT THE FIX COMMIT MUST HAVE ANSWERED (verify each against the CURRENT code; say fixed / partly fixed / unfixed / dismissed-with-reason):",
  "1. code-review S-1 (medium): `runs-on: windows-latest` was unconditional, so a Windows VM was provisioned and billed for every same-repo PR even when every step was skipped. Fix claimed: a conditional `runs-on` expression that falls back to ubuntu-latest.",
  "2. code-review S-2 (low): stale line citations in docs/editions-and-features.md (`lib.rs:2102`, `:2025`, `license.ts:168`). Fix claimed: the line numbers were dropped.",
  "3. code-review S-3 / debate N5 (low): docs/editions-and-features.md said the publish workflows 'keep shipping the fallback', which no workflow does. Fix claimed: the sentence was rewritten.",
  "4. code-review S-4 (low): the AGENTS.md design-pass artefact was missing and .scratch/reviews/410/ was untracked. Fix claimed: the artefact exists and the evidence is staged for commit.",
  "5. code-review filter gap (low): `tests/**` was not in the `encryption` path filter, so a proof-test-only change left encryption=false. Fix claimed: tests/sqlcipher-encryption-proof.test.mjs was added to the filter.",
  "6. test-audit MEDIUM-1: deleting the keyed pragma from the write probe failed no unit test - only the Windows runner noticed. Fix claimed: the probe sources are exported and a structural test asserts both apply `key` and `cipher_compatibility`.",
  "7. test-audit MEDIUM-2 / debate N3 / E6: the live-vs-backup comparison was schema-only, so an empty-but-schema-complete backup passed. Fix claimed: documented as an accepted limitation in the design doc, and the comment now says it is a schema check.",
  "8. test-audit MEDIUM-3 / E1: the newest-invalid-folder fallback in findSnapshotDatabase was untested. Fix claimed: a test pins the newest *complete* backup as the contract.",
  "9. test-audit LOW-1 / E2: a mis-resolved runtime path (a directory) produced a raw EISDIR with no label. Fix claimed: assertNotPlaintextDatabase now reports 'found a directory'.",
  "10. test-audit LOW-2 / E4: parseArgs silently ignored a single-dash typo and a bare positional. Fix claimed: any unrecognised argument throws.",
  "11. test-audit LOW-3 / E3: the 16-byte acceptance boundary was unasserted. Fix claimed: added.",
  "12. debate N1 (score 3): wrong line citation in the doc rewrite. Covered by item 2.",
  "13. debate N2 (score 4): the live-vs-backup equality could go red spuriously because liveTables was read before waitForSnapshot. Fix claimed: the comparison is now a subset test (every live table must be present in the backup).",
  "14. debate N4 (score 2): docs said node-gyp is a 'pinned devDependency' when package.json uses a caret. Fix claimed: reworded to say the lockfile pins it.",
  "15. design-pass F1: rename assertEncryptedDatabase to assertNotPlaintextDatabase (the old name over-claimed). Fix claimed: renamed in the script and the tests.",
  "16. design-pass F2: add an owner-side pointer comment in apps/api/src/modules/backup/backup.policy.ts.",
  "17. design-pass F3: record in the design doc why the duplicated backup-layout names and the deliberately un-duplicated SQLITE_HEADER_MAGIC are opposite answers to the same question.",
  "18. design-pass FU1/FU2/FU3 and test-audit's PRAGMA user_version idea were proposed as FOLLOW-UP issues, deliberately out of scope for this PR. That deferral is the design pass's own recommendation; do not re-raise them as blockers unless the deferral itself is wrong.",
].join("\n");

const tasks = [
  {
    key: "debate",
    output: `${EVIDENCE}/${HEAD}-debate.md`,
    task: [
      "Run the ADVERSARIAL DEBATE gate. Read .agents/skills/debate/SKILL.md and follow it: critic, then defender, then synthesis with severity scores.",
      round1,
      "PAY SPECIAL ATTENTION to the three changes that alter behaviour rather than wording: the conditional `runs-on` expression (does it actually avoid the Windows VM, and can it break the required status check or the detect contract?), the subset comparison (does it still catch a backup that is missing tables? does it now let something through?), and the parseArgs strictness (does it break the documented CLI?).",
      "Also decide whether the round-1 'PROVE IT ON THE RUNNER' gap (no green prove-encryption run has ever been observed) is a blocker for this PR or a stated, accepted gap that belongs in the PR body.",
      "OUTPUT SHAPE: verdict first; then a table of the 18 round-1 items with fixed/partly/unfixed plus evidence; then any NEW findings with scores; then the synthesis naming what must change before merge and what may be deferred.",
    ].join("\n\n"),
  },
  {
    key: "test-audit",
    output: `${EVIDENCE}/${HEAD}-test-audit.md`,
    task: [
      "Run the TEST AUDIT gate. Read .agents/skills/test-audit/SKILL.md and follow it: edge case hunter, coverage analyst, quality reviewer, all three roles in this one context. Do not spawn sub-agents.",
      "Run the pure-logic suite yourself: `pnpm check:sqlcipher-proof` (or `node --test tests/sqlcipher-encryption-proof.test.mjs`). Report the real pass/fail count and the test names.",
      round1,
      "THE CENTRAL QUESTION, re-asked: with the round-1 fix in place, would the UNIT suite now notice if the keyed write lost its key pragma? Verify the structural guard actually fails when the pragma is removed - read the assertion, and if you can, reason precisely about which regex would stop matching. Say clearly whether this is a real guard or a test that would pass on a broken probe for another reason.",
      "Also check the new tests for the failure mode the audit exists to catch: a test that asserts the shape of an error message but not the behaviour, or a test that cannot fail. Grade each new test on that.",
      "OUTPUT SHAPE: verdict line; assertion -> enforced by -> would-it-fail table; the three role sections; findings graded HIGH/MEDIUM/LOW with the exact test to add. Explicitly list what you checked and found nothing on.",
    ].join("\n\n"),
  },
  {
    key: "code-review",
    output: `${EVIDENCE}/${HEAD}-code-review.md`,
    task: [
      "Run the TWO-AXIS CODE REVIEW gate. Read .agents/skills/code-review/SKILL.md and follow it, both axes in this one context, STANDARDS then SPEC.",
      round1,
      "STANDARDS: re-check the fix commit against the repo's own rules - AGENTS.md commit-content list (is every file in the fix commit one of: source, tests, CI config, docs, the issue's design doc, review evidence?), the source-only staging rule (the commit must contain no generated output), and tests/workflow-assets.test.mjs + tests/repo-hygiene.test.mjs. Run those two suites.",
      "SPEC: re-mark the five #410 requirements against the CURRENT code, and say whether the fix commit changed any of them.",
      "Check the conditional `runs-on` expression specifically: is it valid GitHub Actions syntax, does the `needs` context resolve there, and is the terminal 'skipped' step still correct now that it may run on Ubuntu?",
      "OUTPUT SHAPE: verdict first; Standards table (# / grade / finding / fix); Spec axis with the five requirements; consolidated HIGH/MEDIUM/LOW list with file:line. Explicitly list what you checked and found nothing on.",
    ].join("\n\n"),
  },
  {
    key: "design-pass",
    output: `${EVIDENCE}/${HEAD}-design-pass.md`,
    task: [
      "Run the mandatory DESIGN PASS (this repository treats it as a merge gate). Read and apply all three skills to the fix commit and the whole diff: .agents/skills/domain-modeling/SKILL.md, .agents/skills/codebase-design/SKILL.md, .agents/skills/improve-codebase-architecture/SKILL.md.",
      round1,
      "Judge the three fix-now items on their merits, not on whether they were implemented: (a) is `assertNotPlaintextDatabase` now the right name, or did the rename trade one imprecision for another? (b) does the owner-side pointer comment in backup.policy.ts point at the right place and say the right thing? (c) does the design doc now state the two-duplications rationale in a way that stops the next reviewer re-litigating it?",
      "Then ask the outward question again about the fix commit itself: did it create friction for the next person - in the CI job graph, in the proof script's interface, or in the docs?",
      "The bar is INCREMENTAL. Findings whose fix would sprawl belong in their own issue; say so with the exact proposed issue text rather than proposing the refactor. End with an explicit 'checked and found nothing' list - AGENTS.md requires the outcome to be recorded even when the answer is nothing.",
      "OUTPUT SHAPE: Outcome first (clean / cheap fixes identified / follow-up issues needed); then one section per skill with file:line findings marked fix-now or file-follow-up; then the explicit checked-and-found-nothing list.",
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
  error: result.error,
}));
