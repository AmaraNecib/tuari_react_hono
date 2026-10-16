# #466 debate review — `f64292ec2a8fd33786a5db1c0869fa1e6a985940`

Range: `073af118d4f10dd1e7c4099a36a228b2035b00bb..f64292ec`
Files in range: `scripts/ci/close-linked-issues.sh`, `scripts/ci/test-close-linked-issues.sh`,
`.github/workflows/auto-close-issues.yml`, `.scratch/implementation/466-design.md`.
Reviewer mode: CRITIC + DEFENDER, then SYNTHESIS. Every claim below was checked by
running the real script, not by reading the regex.

## Environment / commands actually run

| Command | Result |
| --- | --- |
| `git log 073af118..f64292ec --oneline` | `f64292ec`, `03fa67b5`, `4ab192b5` |
| `bash scripts/ci/test-close-linked-issues.sh` | `PASS=60 FAIL=0` (matches the claim in the task and the commit message) |
| probe harness: fake `curl` shim on `PATH` + the **real** `close-linked-issues.sh` with `EVENT_QUALIFIED=1`, one open fixture per target number | required-claim table below |
| same harness, `git show 073af118:scripts/ci/close-linked-issues.sh` as the program under test | old-vs-new column below |
| raw extractor pipes (`grep -oiE …` copied verbatim from the file) on 12 tricky one-liners | aff/neg table below |

Toolchain: `bash 5.2.37`, `grep (GNU grep) 3.0`, `jq 1.7.1` (GNU-family, same family as
`ubuntu-latest`). `\b`, `[[:space:]]`, `[[:punct:]]`, `grep -E` with `-i -o` all GNU-supported.

## Required claims — verified

| Body | Expected | Observed (real script) |
| --- | --- | --- |
| `Closes #101` | close | **CLOSED** |
| `Fixes #102` | close | **CLOSED** |
| `Resolves: #103` | close | **CLOSED** |
| `Part of #104 — lands later.` | nothing | not closed, `No 'Closes #N' reference…` |
| `A related finding is filed as #105.` | nothing | not closed |
| `Follow-up wiring is tracked in #106.` | nothing | not closed |
| `This does not close #107 — work still open.` | nothing | not closed, `Ignoring #107` echoed |
| body has no keyword, **fixture title** = `Closes #108` | nothing | not closed (title never read) |
| `This PR documents the fix for #1220 in the changelog.` | nothing | not closed |

All four acceptance shapes in issue #466 are met by the adjacency change (`close-linked-issues.sh:156-163`).

## CRITIC findings

### C1 — the negation pass is defeated by punctuation between negator and keyword; a negated close still closes (HIGH)

Location: `scripts/ci/close-linked-issues.sh:174-186` (the `([[:space:]]+[[:alnum:]_-]+){0,2}`
gap tokenises only whitespace-separated alphanumeric words).

Verified against the real script (new column = current file):

| Body | old (`073af118`) | new (`f64292ec`) |
| --- | --- | --- |
| `We have no intention of closing #443.` | CLOSED | **CLOSED** |
| `This does not, however, close #444.` | CLOSED | **CLOSED** |
| `No plans to close #445 — it stays open.` | CLOSED | **CLOSED** |
| `This does not — close #446.` | CLOSED | **CLOSED** |
| `This PR does not close #447.` | CLOSED | not closed |

The commit message for `f64292ec` states the goal as a *class*: "`This does not close #443`
extracted #443 and closed it — the same bug class as a mention". The class is fixed for one
phrasing only. Inserting a comma, an em dash, or using `no intention of` / `no plans to` puts
punctuation or a non-negator word in the gap: the subtraction pass finds nothing while the
affirmative pass still matches the adjacent `close #N`. Same script header
(`close-linked-issues.sh:28-30`) and the design doc's "Forms that extract nothing now" list
read as if the class is covered.

### C2 — the negation pass silently drops real closes for affirmative idioms (MEDIUM, new regression)

Same location. `doesn't just fix #N`, `not only fixes #N`, `not merely resolves #N` are
*affirmative* — "only"/"just"/"merely" are exactly the 1–2 gap words the pass treats as negation.

| Body | old | new |
| --- | --- | --- |
| `This doesn't just fix #455 — it replaces the whole flow.` | CLOSED | **not closed** |
| `This is not only fixes #121` (grammatically odd fixture, regex behaviour is the same) | CLOSED | **not closed** |

`#455` is a delivered issue that stays open, the job exits 0, and the only trace is the
`Ignoring #455: the PR body negates closing it` line. The design's "Risks" section covers only
the *same-number* lossy case; it does not cover losing a real close to an unrelated negation
idiom. This direction is a *new* behaviour introduced by `f64292ec` (the pre-fix script closed it).

### C3 — markdown/line-break separator forms are now false drops (MEDIUM-LOW, new regression)

`[[:space:]:]+` (`close-linked-issues.sh:158`) cannot cross `**`, a newline, or `- `.

| Body | old | new |
| --- | --- | --- |
| `The fix is **Closes** #449` | CLOSED | **not closed** |
| `…ends with:\nCloses\n#110` (keyword and ref on separate lines) | CLOSED | **not closed** |
| `Closes - #116` | CLOSED | **not closed** |

The design's "Risks and non-goals" section lists the mention-side residuals but not these
false-drop shapes, and no test pins them.

### C4 — `Ignoring #N` is echoed even when nothing was subtracted (LOW)

`close-linked-issues.sh:182-185` loops over every *negated* number and echoes before it knows
whether that number was ever a candidate. Observed on the real script:
body `This does not close #107 — work still open.` prints `Ignoring #107: …` **and**
`No 'Closes #N' reference in PR body #42 — nothing to close.` — the log claims something was
ignored that was never considered. `test-close-linked-issues.sh:239` asserts this line, so the
inaccuracy is now pinned by a test.

### C5 — a past-tense keyword in narrative prose still closes (MEDIUM, pre-existing, in the ticket's failure class)

| Body | old | new |
| --- | --- | --- |
| `PR #442 closed #452 prematurely; this reopens the work.` | CLOSED | **CLOSED** |

`closed`/`fixed`/`resolved` remain in the keyword list and adjacency does not distinguish a
historical statement from a delivery claim. This is the same "a mention is not a close"
failure mode #466 describes; the fix does not narrow it. Not a regression (old also closed),
and it is GitHub-parser parity, but the ticket's stated goal is only partially reached.

### C6 — `Closes:#N` (no space) closes (LOW)

Raw extractor: `Closes:#115` → aff `[115]`. GitHub requires the space; harmless over-match,
but the separator comment claims "only an optional `:` and whitespace" as *GitHub's* accepted
forms.

### C7 — test coverage gaps that make the suite's green signal misleading (MEDIUM as a signal)

- No punctuation variant of a negated close (`does not, however, close #N`) — see C1. The
  suite is fully green while a common negation phrasing still closes.
- `test-close-linked-issues.sh:266-268` is labelled "a negator **three** words from the
  keyword"; the fixture `Do not merge this until it Closes #135` has **four** words between
  (`merge this until it`). The design/commit claim "two words, no more… three words out is a
  different clause" is therefore not pinned at the boundary it names — and 1–2 word gaps are
  exactly where C2 lives.
- No test asserts the *absence* of `Ignoring #N` when nothing was subtracted (C4).
- No test for a `Closes #N` inside a fenced code block or a quoted earlier PR body (a
  documented residual in the design, but unpinned).

### C8 — guard interaction, verified benign (LOW)

The PR-body self-reference guard (`:254`) and issue-body remaining-work guard (`:233`) still
run after extraction; because `Part of #N` no longer extracts, guard 4 now only fires on bodies
that say both (`Closes #107 — Part of #107`, suite line 167-170, still SKIPs). No double-counting
or dead code introduced. Workflow header change is comments-only (`git diff` confirms no `on:`,
`env:`, `if:` or `runs-on:` change), so the merge path has no new failure mode.

### C9 — portability / quoting (no finding)

`grep -oiE` with `\b` and `[[:space:]]` is GNU-supported (verified with GNU grep 3.0); pipelines
carry `|| true` so `pipefail` cannot kill the run; `grep -vx "$neg"` only ever receives digits
(from `grep -oE '#[0-9]+' | tr -d '#'`), so no injection/glob risk; the empty-`numbers` path
still terminates at `:186-190` (test `no refs exits 0` and probe `Part of #104` both exit 0).
`grep -c` arithmetic, `as_num`, `mktemp`, `trap` unchanged. Note (pre-existing, not this diff):
the workflow comment insists the job "MUST stay self-hosted" while `runs-on: ubuntu-latest`.

## DEFENDER — strongest argument for the design as written

- **D-C1 (negation punctuation):** The ticket's spec (`gh issue view 466`) asks for one thing —
  keyword *immediately* before the reference — and explicitly says a bare `#N`, `filed as #N`
  and `part of #N` must not close. Negation handling was a parent add-on, and every C1 row
  already closed before this commit: the change is strictly non-regressive for those bodies
  and closes 100% of the negation forms it enumerates in the header. A closed negator
  vocabulary cannot be complete; the alternative is a natural-language parser.
- **D-C2 (affirmative idiom dropped):** The repo's stated preference is explicit — the ticket
  says a missing close "is at least visible", a wrong close is not; the design says the
  subtraction is deliberately conservative. `Ignoring #N` is printed for the operator, so the
  drop is visible in the run log, not silent-and-invisible. And the pre-fix matcher was no
  better on the false-*close* side, which is the direction that motivated the ticket.
- **D-C3 (markdown/line-break):** Adjacency is exactly what GitHub itself requires and what the
  ticket's convention assumes; a keyword broken across a line or bolded inside `**…**` is not a
  canonical closing line. Matching `**` would mean re-opening the gap the ticket exists to close.
- **D-C4 (`Ignoring #N` over-reporting):** It is an audit line, not a decision; the authoritative
  output is the `CLOSED`/`SKIP` summary table, which stays correct.
- **D-C5 (past tense):** GitHub's own parser accepts `closed`/`fixed`/`resolved`, so this is
  intentional parity, pre-existing, and out of the ticket's scope.
- **D-C6 (`Closes:#N`):** Over-closing on an explicit keyword+number pair is far less harmful
  than the mention-closes that motivated the ticket; GitHub tolerates `Closes: #N`.
- **D-C7 (tests):** 12 new scenarios drive the **real script** end-to-end through the fake-curl
  seam, not a copy of the regex; the required four shapes are all pinned; the suite is green
  and reproducible (`PASS=60 FAIL=0`).
- **D-C8/C9:** The affirmative pass is byte-identical to the previous commit's, so nothing
  downstream of extraction changed; the workflow diff is comments only — merge-path risk is
  effectively zero.

## SYNTHESIS

| # | Finding | Severity | Real against current file? | Action |
| --- | --- | --- | --- | --- |
| C1 | `does not, however, close #N` / `no plans to close #N` / `does not — close #N` still CLOSE | **High (7)** as a claim-vs-behaviour gap, Medium (6) as ticket scope | **Real** — proven by running the current script; D-C1 only argues scope, it does not disprove the behaviour | Fix before merge *or* narrow the header/design claim. Cheapest honest fix: make the gap punctuation-tolerant (`[[:punct:]]*` before/inside the gap, e.g. `\b(not\|…)[[:punct:]]*([[:space:]]+[^[:space:]]+){0,2}[[:space:]]+(keyword)[[:space:]:]+#`) and, if `no … of closing` is wanted, add a scoped `no[[:space:]]+[[:alnum:]]+[[:space:]]+(of\|to)` form — **never bare `no`**, which would false-drop `There is no bug; this Closes #N`. Add the punctuation variants to the suite. |
| C2 | `doesn't just fix #455` / `not only fixes #N` — real close silently dropped | **Medium (6)** — new regression | **Real** — old CLOSED, new not-closed, probed on both scripts | Fix the negator scoping (require the negated keyword to not be modified by `only/just/merely`, or treat `not only` / `not just` as affirmative), or drop the subtraction pass and keep only the adjacency rule. Add a test. |
| C3 | `**Closes** #N`, `Closes\n#N`, `Closes - #N` — real close dropped | **Medium-Low (4)** — new regression, cheap to note | **Real** — old CLOSED, new not-closed | Accept as an intended strictness *and record it in the design's Risks*; optionally allow `[*_`]` around the keyword. No functional fix required if documented. |
| C4 | `Ignoring #N` printed when nothing was subtracted | **Low (2)** | **Real** — reproduced (`Ignoring #107` + "nothing to close") | Print only when the number was actually present in `numbers` (compare before/after), or reword the echo. |
| C5 | `PR #442 closed #452` narrative still closes | **Medium (5)**, pre-existing, out of ticket scope | **Real** — old and new both CLOSED | GitHub-parity; document as a residual (the "convention enforced by review" note already covers "do not narrate a close"). No code fix now. |
| C6 | `Closes:#N` with no space closes | **Low (1)** | **Real** (raw extractor) | No fix; over-match is on an explicit keyword pair. |
| C7 | Coverage gap: no punctuation-variant test; `#135` fixture is 4 words, not 3; no negative assertion on `Ignoring` | **Medium (5) as a signal** | **Real** — counted the fixture words; grepped the suite | Add the C1/C2 fixtures; add `assert_not_has "$OUT" "Ignoring #132"` on an affirmative-only body; fix the "three words" wording. |
| C8 | Guard interaction | — | **Dismissed** — `Part of #N` self-reference guard still exercised by suite line 167-170; workflow diff is comments-only | None |
| C9 | Shell/portability/quoting | **Low (1)** | **Dismissed** — GNU grep/bash verified; `|| true` on every pipeline; digits-only input to `grep -vx` | None |

**Verdict reasoning.** The ticket's four acceptance shapes are met and pinned by a green,
high-quality suite (`PASS=60 FAIL=0`, real script end-to-end). The defects live in the
*added* negation pass: C1 shows it does not deliver the class it claims in the script header
and commit message, and C2/C3 show it introduces two new ways to lose a real close. Neither
breaks the adjacency fix, and every C1 body already mis-closed before the commit, so the
net direction on the merge path is an improvement — but the two new false-drop regressions
(C2, C3) and the unstated incompleteness (C1) should be fixed or explicitly documented in the
design's Risks before this is called done. No blocker for the ticket's own criteria.

VERDICT: NO BLOCKER
