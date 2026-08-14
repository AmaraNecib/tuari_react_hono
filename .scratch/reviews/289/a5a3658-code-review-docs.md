# Code-review evidence — docs PR: #289 wisdom capture (agent/wisdom-issue-289)

**Head:** `a5a3658` (single docs commit on top of develop `3c14490`)
**Scope:** `.agents/wisdom/architecture.md` + `.agents/wisdom/testing.md` (+39 prose lines)

> SHA refreshed after `git rebase origin/develop` (was `8b37835`): the wisdom commit
> was re-created on the new base `3c14490` (merged #234 security). Content of the
> reviewed entries is unchanged; the rebase also folded the merged #234
> "Stale contracts dist" section into testing.md (kept, different topic).

## Verdict: no blockers

- **Spec:** both entries accurately reflect #289 events, verified against the merged code
  (transaction.immediate() at payment.repository.ts; .int() at contracts/src/payment.ts + index.test.ts).
- **Standards:** capture-wisdom conventions followed (🟠 severity, format, placement —
  transaction lesson in architecture.md, test-double lesson in testing.md); no duplicates of existing entries.

## Tier note

Docs-only (prose markdown, no code/tests/config). Test-audit N/A — the diff contains
no test files; the entries' claims are pinned by the tests referenced in the text.
