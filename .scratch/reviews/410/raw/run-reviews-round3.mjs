// Round 3 of the four review gates for issue #410, at HEAD 69530400.
// The delta since the approved round 2 (ada25cc5) is comments, docs wording,
// and one ordering assertion in a test. Keep this round proportionate.

const REPO = "D:/projects/tuari_react_hono/worktrees/fix-encryption-ci-proof";
const HEAD = "695304008bdd490352b6acf0530d3dcd5829805e";
const PREV = "ada25cc548fd06b32a89a34841ac57c870cedd39";
const EVIDENCE = `${REPO}/.scratch/reviews/410`;

const common = [
  `REPO: ${REPO} (git worktree, branch fix/410-encryption-ci-proof). Run every shell command with that directory as the working directory.`,
  `REVIEWED HEAD (final): ${HEAD}`,
  `BASE (lane start): d6164c65. Whole change under review: \`git diff d6164c65...HEAD\`.`,
  `THIS IS ROUND 3. Round 2 reviewed ${PREV} and returned APPROVE from all four gates, with only LOW items left. The single commit ${PREV}..HEAD (\`git diff ${PREV}..HEAD\`, 5 files, all comments/docs plus one test assertion) answers those LOW items. Your job is proportionate: verify the delta does not break anything and that the round-2 approvals still stand. Do not re-litigate the design, the CI job shape, or the spec mapping unless this delta changed them.`,
  `Read \`.scratch/reviews/410/${PREV}-*.md\` for what round 2 said, and \`.scratch/implementation/410-design.md\` for the design.`,
  `ISSUE #410: prove the BUILT release artifact can encrypt - (1) sidecar built with the real SQLCipher dependency and no --allow-plaintext; (2) PRAGMA cipher_version non-empty; (3) keyed write leaves a file that is not "SQLite format 3"; (4) keyed reopen reads the row back; (5) wired into the desktop/CI path, not the publish gate only. Fail otherwise. The replaced failure mode was silent: a warning in a build log, a green release, a plaintext database for a paying customer.`,
  `TIER: High-assurance. But proportionate: a comment that says the right thing is not a finding, and re-raising a round-2 deferral is not a finding either.`,
  `CONSTRAINT: no Windows SDK on this workstation, so spec steps 1-5 execute only on the Windows runner. Say what stays unproven. Do NOT run the full api/web suites.`,
  `DO NOT EDIT ANY FILE. Return the complete markdown report as your final answer.`,
  `OUTPUT SHAPE: one-line verdict first (APPROVE or REQUEST CHANGES), then at most a short findings list, then a plain list of what you checked. Be brief. If there is nothing actionable, say so and list what you checked - do not pad.`,
].join("\n\n");

const delta = [
  "WHAT THE DELTA CHANGED (verify each; all five are responses to round-2 LOW items):",
  "1. `.github/workflows/ci.yml` - the `prove-encryption` header comment no longer claims to be 'the only non-Ubuntu job' (the conditional `runs-on` made that false). The `runs-on` expression itself is UNCHANGED from the round-2-approved value.",
  "2. `docs/development-workflow.md` section 12.6 - now says `windows-latest` applies when the change is encryption-relevant and explains the ubuntu-latest echo path.",
  "3. `apps/desktop/scripts/sqlcipher-encryption-proof.mjs` - the subset-comparison comment now gives the correct reason (the live list is read once BEFORE the snapshot, so a backup with extra tables is not a failure). The code is UNCHANGED.",
  "4. `docs/editions-and-features.md` - two `lib.rs:2052` citations dropped (they did not resolve to the `LicenseManager::initialize` handoff).",
  "5. `tests/sqlcipher-encryption-proof.test.mjs` - the probe guard now also asserts the key pragma comes BEFORE the write/query, so a reorder cannot stay green.",
  "The round-2 LOW item 'evidence is untracked' is answered by the evidence commit that follows this review; do not re-raise it as a code finding.",
].join("\n");

const tasks = [
  {
    key: "debate",
    output: `${EVIDENCE}/${HEAD}-debate.md`,
    task: [
      "Run the debate gate, proportionately. Read .agents/skills/debate/SKILL.md. The critic's job here is narrow: does any of the five delta changes make a previously-true statement now false, or introduce a claim the code does not support? Give the defender one paragraph. Keep the synthesis to what must change (if anything).",
      delta,
    ].join("\n\n"),
  },
  {
    key: "test-audit",
    output: `${EVIDENCE}/${HEAD}-test-audit.md`,
    task: [
      "Run the test audit, proportionately. Read .agents/skills/test-audit/SKILL.md and do all three roles in this context. Run `pnpm check:sqlcipher-proof` and report the count. The only test change is item 5; judge whether the ordering assertion is a real guard (would it fail if the key pragma moved after the write?) or decorative. Answer the round-2 question once more in one line: does the unit suite notice a deleted key pragma now?",
      delta,
    ].join("\n\n"),
  },
  {
    key: "code-review",
    output: `${EVIDENCE}/${HEAD}-code-review.md`,
    task: [
      "Run the two-axis code review, proportionately. Read .agents/skills/code-review/SKILL.md. STANDARDS: confirm every file in the delta commit is an allowed commit content per AGENTS.md, that no generated output was staged, and that `tests/workflow-assets.test.mjs` + `tests/repo-hygiene.test.mjs` still pass. SPEC: confirm the five #410 requirements are untouched by this delta - one line each, no re-analysis. Then re-anchor the two citations item 4 changed and say whether dropping the line numbers was the right call versus correcting them.",
      delta,
    ].join("\n\n"),
  },
  {
    key: "design-pass",
    output: `${EVIDENCE}/${HEAD}-design-pass.md`,
    task: [
      "Run the design pass, proportionately - this repository treats it as a merge gate, so the outcome must be recorded even when it is 'nothing found'. Read the three skills (domain-modeling, codebase-design, improve-codebase-architecture). Judge only the delta: do the corrected comments now state the right rule once, in the right place? Did any of the five edits create new friction? Round 2 already filed FU1/FU2/FU3 plus the `user_version` idea as follow-ups; do not re-file them. End with the explicit checked-and-found-nothing list.",
      delta,
    ].join("\n\n"),
  },
];

const results = await runs.all(
  tasks.map((entry) => ({
    key: entry.key,
    agent: "reviewer",
    task: `${common}\n\n${entry.task}`,
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
