# Issue #234 — Code Review Evidence

**Head**: `44d6be5f2bb696952a360552fdb2eee0e37fe511`
**Base**: `bb144f3a3a22fe5f72904aaafa511b16a9e4dec2` (merge-base with `origin/develop`)
**Diff**: `git diff bb144f3...HEAD` — 2 commits (`dbea42e`, `44d6be5`), 5 files.

Two parallel sub-agents (reviewer): STANDARDS (documented repo standards +
Fowler smell baseline) and SPEC (issue #234 + design doc).

## Standards

**No blockers. No hard violations.** Verified against AGENTS.md (commit
staging, scratch lifecycle, issue-closing convention),
`.agents/wisdom/{security,process}.md`, and the auth.ts
passwordSchema/name refine pattern.

Soft smells (all judgement calls, all dismissed — documented patterns
override the baseline):
- **Duplicated Code (soft)** — the `value.length < min` guard shape matches
  auth.ts; semantics differ (contains-any-Cf vs all-invisible), so
  cross-file extraction would be speculative coupling. The comment cites the
  pattern explicitly. Accepted.
- **Data Clumps (soft)** — `(min, label)` travel together at 4 sites; an
  options object adds ceremony without clarity. Skipped.
- **Mysterious Name (soft)** — `keyFieldSchema` doesn't name the Cf
  rejection; JSDoc + module context disambiguate. Acceptable.

Verified correct by construction: refine-guard ordering (single too_small
pinned by test), trim-before-min ordering, surrogate-pair Cf can't game the
length guard, U+FEFF edge-trim/mid-string-catch comment accuracy, ES2018
regex claim.

## Spec

**No missing requirements. No scope creep in runtime code. No
implemented-but-wrong findings.**

- Spec "reject strings containing `\p{Cf}` after trim on the recovery-key
  and DB-key input schemas" — all four fields use `keyFieldSchema`
  (security.ts:63-83); refine runs on the trimmed value (pinned by test).
- Spec "an error message telling the user the key contains invisible
  characters" — message `"<label> must not contain invisible format
  characters (e.g. zero-width space)"`; content asserted by test.
- Design-doc scope decisions honored: `changeAppPasswordInputSchema`
  untouched; non-Cf residual class documented + tracked as #334; keyId and
  currentKey included.

## Verdict

✅ **No actionable findings on either axis** — safe to push.

Notes carried forward:
- Develop still at `bb144f3` after re-fetch (base not stale).
- E2E re-run after the `fetchRpcStatus` refactor: 1 passed.
- Residual class outside `\p{Cf}` tracked as issue #334.

---
**Post-evidence delta**: evidence written against `44d6be5` (final code
head). Commits `51dec2b` (evidence) and `9a80301` (wisdom lesson, docs-only)
followed; no reviewable code changed since the review. Renamed to final SHA
per the guard's evidence-refresh pattern.
