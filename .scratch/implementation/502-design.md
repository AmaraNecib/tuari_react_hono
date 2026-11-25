# Issue 502: abbreviation-aware negation boundaries

## Scope

Worktree: D:/worktrees/tuari_react_hono/t3-3f473dcf-b1bbbeb4df58e0a6.
Base: 853e19342a04687233133b4b9f1148aaea1269c9, fresh origin/develop.
Spec: issue 502. Mode: focused-local / CI-final-pending.
Review: debate, test-audit, code-review in distinct sessions.
Risk: CI automation closes an expressly negated issue after an abbreviation.
This is excluded from lighter routine review.

## Design

Change only body_sentences at runtime. Strip the final dot from the bounded,
case-insensitive lexicon e.g., i.e., etc., cf., vs., al., approx. before the
existing sentence split. The affirmative extraction still reads body_flat.
No placeholders or restoration are needed. Unknown abbreviations retain the
existing behavior. A known abbreviation at a true sentence end conservatively
extends negation: a recoverable skip is preferable to an unintended close.

A closing reference is a supported verb immediately preceding an issue marker.
A negated candidate is subtracted by issue number. The sentence view adapts
prose to line-based grep; it is not a general prose parser. No new module or
shared abstraction is needed. Architecture: no seam moved.

## Proof

Test all seven entries plus uppercase E.G., each with plain uppercase,
emphasized lowercase, two spaces plus uppercase, and form-feed continuation.
Each case checks exit zero, an explicit negation log, no close of an open
candidate, and a same-body affirmative control that must close.

The expected-red run against base script 853e19342a04687233133b4b9f1148aaea1269c9
with new tests is preserved at .scratch/reviews/502/red.log. It timed out after
200 seconds, after explicit failures for uppercase and form-feed e.g./i.e.
cases and uppercase etc. cases. This is partial negative proof, not a completed
suite. Same-body affirmative controls passed. This non-vacuous pin answers
that base commit; exact final-head execution is recorded separately.

Affected proof is the shell harness, bash syntax checks and diff whitespace.
Application builds, browser tests and TypeScript checks do not exercise this
shell-only change. Logs and reviewer reports remain ignored. The wisdom search
found no matching sentence-parser lesson.
