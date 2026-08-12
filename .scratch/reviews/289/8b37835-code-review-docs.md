# Code-review evidence — docs PR: #289 wisdom capture (agent/wisdom-issue-289)

**Head:** `8b37835` (single docs commit on top of develop `004e2e56`)
**Scope:** `.agents/wisdom/architecture.md` + `.agents/wisdom/testing.md` (+39 prose lines)

## Verdict: no blockers

- **Spec:** both entries accurately reflect #289 events, verified against the merged code
  (transaction.immediate() at payment.repository.ts; .int() at contracts/src/payment.ts + index.test.ts).
- **Standards:** capture-wisdom conventions followed (🟠 severity, format, placement —
  transaction lesson in architecture.md, test-double lesson in testing.md); no duplicates of existing entries.

## Tier note

Docs-only (prose markdown, no code/tests/config). Test-audit N/A — the diff contains
no test files; the entries' claims are pinned by the tests referenced in the text.
