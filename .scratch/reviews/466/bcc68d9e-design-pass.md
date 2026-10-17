# Design-pass review — #466 / #486 gate on `bcc68d9e`

Scope: merge-gate design pass over the delta `a1fd3f6d..bcc68d9e` (`scripts/ci/*`, `.scratch/implementation/466-design.md`), judged at HEAD `bcc68d9e`.
Skills applied: `domain-modeling`, `codebase-design`, `improve-codebase-architecture`.

## TL;DR

The one-class change is correct and now matches its stated rule everywhere that rule is written. The headline problem in this delta is **documentation drift**, not code: the committed design doc's control table reports a number that its own recorded evidence log contradicts, and the doc's assertion count is stale. One uncommitted worktree edit fixes half of that.

| # | Question | Verdict |
| --- | --- | --- |
| 1 | Does the one-class change match its stated rule everywhere? | **Yes** — script comment, design doc, test comment all agree; 1b comment does not restate the class, so no drift there. |
| 2 | Deletion test on what the delta added | **One shallow addition** (the CRLF row — passes on every baseline). The rest earn their keep. |
| 3 | Deferred-classes section: right place, right shape? | **Right shape, under-linked place.** Shape is exactly what a named hole needs; the holes are not referenced from the code comment where the regex is edited, and carry no issue numbers. |
| 4 | Duplication or drift introduced? | **Drift found (documentation).** `466-design.md` HEAD line 36 says "134 assertions"; HEAD line 217 reports `PASS=138 FAIL=1` for the tr-split control where the recorded log says `PASS=134 FAIL=5`. There is an uncommitted worktree edit that fixes line 217 only. |
| 5 | Remaining friction; is the sed boundary adapter still the right seam? | **Right seam, keep it.** The friction is the unpinned locale behind `[[:lower:]]`; the doc asserts "Linux CI runs UTF-8" but the script pins no `LC_ALL`. |

---

## Correct (with evidence)

- **The class change is the right fix and the reasoning in the comment is exact.** `scripts/ci/close-linked-issues.sh:221` is now
  `sed -E 's/([.!?;])([[:space:]]+[^[:space:][:lower:]])/\1\n\2/g'`. The stated rule at `:207-208` ("the next **non-space** character is not a lowercase letter") is literally what the class computes: after a greedy `[[:space:]]+`, the following char must be non-space and non-lowercase. Before the change, `[^[:lower:]]` admitted the *second* space of a two-space run, so `This does not fix the parser.  closes #522. Closes #523.` split and #522 **closed** — a false CLOSE (the dangerous direction). Verified against `.scratch/reviews/466/bcc68d9e-control-a1fd3f6d-spaceguard.log:107` (`FAIL: a double space after the terminator is not a sentence break (#522) did NOT close #522`), which is the *only* failure on that baseline (`PASS=138 FAIL=1`).
- **The preflight fix is correct.** `:86` loops `curl jq sed`; `:88` now names all three ("needs curl + jq + sed"). `sed` is genuinely required at `:221`, so the old message under-reported the toolchain. Good.
- **CRLF path is sound.** `tr '\n' ' '` at `:196` turns `...\r\nCloses #525.` into `...\r Closes #525.`; `\r` is in `[[:space:]]`, so the guard splits at the terminator and keeps the negator with `#524` while `Closes #525` stays affirmative. Behavior matches the row's stated expectation.
- **No fixture-number collisions.** New fixtures `#522/#523`, `#524/#525` sit sequentially after `#521`; grep shows no reuse.
- **1b comment does not restate the character class** (`:234-249`), so the class change could not drift from it. Nothing found there.

## Fixed

Nothing. Review-only; I did not edit the tree.

## Blocker

**B1 — committed design-doc control table contradicts its own recorded evidence log.** `git show bcc68d9e:.scratch/implementation/466-design.md` line 217 reports:

```
| tr-split baseline | 139 | `bfe4c50d` (unconditional token split) | `PASS=138 FAIL=1` — the `#510`/`#512`/`#513`/`#515` wrong-close rows |
```

The evidence log this same delta records, `.scratch/reviews/466/bcc68d9e-control-bfe4c50d-trsplit.log`, ends `PASS=134 FAIL=5` and lists five failures (`#510`, `#512`, `#513`, `#515`, **`#522`**) at lines 94/108/123/139/159. So the committed row (a) carries the *gate-fix* baseline's numbers (`138/1`, identical to the row below it at line 218) and (b) omits `#522` from the failure set it names. The whole point of the round-2 gate was that the tr-split baseline is the regression witness for the `#522` row (218 of the diff: "`#510`/`#512`/`#513`/`#515`/`#522`"); the committed table hides that. Trigger is not a body string but the log line: `PASS=134 FAIL=5`.

**B2 — stale assertion count in the same doc.** HEAD line 36 still reads `# regression matrix, 134 assertions` while the suite is 139 and the doc says so at line 211 (`PASS=139 FAIL=0`). The delta bumped the prose but not the Shape-block summary.

**Note on state:** the worktree already contains an **uncommitted** edit (`git status` → ` M .scratch/implementation/466-design.md`) that rewrites line 217 to the correct `PASS=134 FAIL=5 — #510/#512/#513/#515/#522`. It does **not** touch line 36. So B1 has a ready-made patch that is not committed; B2 has no patch. At HEAD, as instructed to judge, both are live.

## Note

- **N1 — the CRLF row is a control, not a regression pin.** `.scratch/reviews/466/bcc68d9e-control-bfe4c50d-trsplit.log` (5 fails), `...-8b2504e2-wordcount.log` (15 fails) and `...-a1fd3f6d-spaceguard.log` (1 fail) contain **no** `#524`/`#525`/CRLF failure. The new row at `test-close-linked-issues.sh:597-603` therefore fails on **no** baseline; it asserts behavior nobody got wrong. That is the one shallow addition in the delta (deletion test: removing it removes 5 assertions and loses a future guard, but it currently distinguishes nothing). Compare the `#520` row the delta correctly relabelled "control — passes on every baseline" (`466-design.md:197`). Either label the CRLF row a control too, or state in the comment *why* a CRLF body is a real shape given the GitHub REST API returns `\n`-normalised bodies. Not a blocker.
- **N2 — locale is unpinned behind a locale-sensitive class.** `grep -n 'LC_ALL\|LANG\|locale' scripts/ci/close-linked-issues.sh` returns nothing; the script sets `set -euo pipefail` at `:48` and nothing else. `[[:lower:]]` is locale-sensitive, so the guard's behavior depends on the runner env. The doc (`466-design.md:94-96`) asserts "Linux CI runs UTF-8, and the failure direction there is a drop, not a close" — that is an **unverified runner property**, and the runner is the fixed self-hosted box already documented as a constraint (`:22-27`, issue #54). Failure-direction check: a terminator followed by an accented lowercase word (e.g. `This does not fix the café. élan Closes #N`) does **not** split under UTF-8 (negator reaches `Closes #N` → drop) but **does** split under `LC_ALL=C` (`é` ∉ `[[:lower:]]` → negator isolated → `#N` **closes**). So a C-locale runner flips a drop into a false CLOSE. Cheap insurance: `export LC_ALL=C.UTF-8 2>/dev/null || export LC_ALL=C` near the top, which makes the class independent of ambient env. I do not think this alone must block merge (the operator controls the runner), but the doc's UTF-8 assertion should be a pinned fact, not a hope.
- **N3 — deferred holes are named in the right shape but are not reachable from the code.** The section `466-design.md` "Known remaining wrong-close classes (deferred, named — not silent)" (HEAD lines 226-243) is the correct shape: each entry gives the class, a triggering body (`This does not e.g. Fix #N`; `This does not fix #A or resolve #B`), why a character-class patch cannot fix it, and a proposed follow-up title. The place is defensible (the file is *tracked*, per `git status` `M`), but `.scratch/` is a scratch path, and neither hole is mentioned in `scripts/ci/close-linked-issues.sh` near the regex where the next editor will work (`:207-220`), and neither carries an issue number. Per `domain-modeling`, a durable decision like the sentence-scoped-negation trade-off belongs in `docs/adr/` with the glossary only in `CONTEXT.md`; these two holes are consequences of that decision. Minimal durable fix: add two lines at `:220` ("known holes, deliberately not fixed here: abbreviation-continuation, `or`-coordination — see #<issues>") and file the two follow-up issues so the titles become real. Not a blocker.
- **N4 — the sed boundary adapter has one consumer, but that is fine.** `body_sentences` (`:221`) is read only by the negated pass (`:250-256`); the affirmative pass deliberately reads `body_flat` (`:227-232`, justified at `:204-205`) because `#` can never sit between verb and ref. By `codebase-design` "one adapter = hypothetical seam," but this is a single inline `sed`, not an extracted module — there is nothing to collapse and unifying both passes onto one representation would not buy locality. Keep the seam. The real friction is locality of knowledge: the sentence rule lives 30 lines above the grep that depends on it, so a reader must scroll to learn why `body_sentences` exists. A one-line pointer at `:250` would fix that.
- **Deferred classes are not re-opened.** Both holes the task asked me not to re-open (`e.g.` before a non-lowercase continuation; a negator not reaching a second `or`-coordinated close) are real, both are documented at `:232-243`, and **neither is severe enough to block this PR**: the abbreviation case needs a non-lowercase continuation after the abbreviation (`This does not e.g. Fix #N`), and the `or` case is pre-existing since round 1 and its naive fix breaks the pinned `does not close #A, but Closes #B`. Both are narrower than what this delta fixed. I do **not** escalate either.
- **Nothing found** for: new false CLOSE introduced by this delta (the class change strictly narrows when a split can occur, so it can only turn a false CLOSE into a drop, never the reverse in UTF-8); accidental duplication of the control table; fixture reuse; a mismatch between the 1b comment and the code.

## Next action (under two minutes)

Commit the uncommitted `.scratch/implementation/466-design.md` table fix **and** change HEAD line 36 `134 assertions` → `139 assertions` in the same commit — one `sed -i 's/134 assertions/139 assertions/'` plus `git add`, then push. B1 and B2 both clear.

---

### Evidence used
- `.scratch/reviews/466/bcc68d9e-control-bfe4c50d-trsplit.log` → `PASS=134 FAIL=5`
- `.scratch/reviews/466/bcc68d9e-control-a1fd3f6d-spaceguard.log` → `PASS=138 FAIL=1` (only `#522`)
- `.scratch/reviews/466/bcc68d9e-control-8b2504e2-wordcount.log` → `PASS=124 FAIL=15`
- `.scratch/reviews/466/bcc68d9e-tests.log` → `PASS=139 FAIL=0`
- `git show bcc68d9e:.scratch/implementation/466-design.md`, `git diff a1fd3f6d..bcc68d9e`, `git status --porcelain`
