# Adversary debate — bcc68d9e (delta a1fd3f6d..bcc68d9e, PR #487 / #466, #486)

Read-only review. HEAD `bcc68d9e`. No repo file edited; nothing committed. The only
write is this report (the run's designated output path).

Delta under review (`git diff a1fd3f6d..bcc68d9e -- scripts/ci .scratch/implementation`):
`scripts/ci/close-linked-issues.sh:88` (preflight message) and `:221` (sentence guard),
`scripts/ci/test-close-linked-issues.sh:585` (label rename) and `:589-604` (two rows),
`.scratch/implementation/466-design.md` (docs).

## Review
- Correct: the delta is monotonically safe. New split-point set ⊆ old split-point set
  (`close-linked-issues.sh:221`), so the negation pass can only ever cover *more* of the
  body, so the closed set can only shrink. No wrong close can be added. Proof below.
- Correct: `[[:space:]]+` greediness does not break the uppercase two-space win.
  Verified directly with GNU sed 4.9 (see "Verification"), and pinned by the new control
  assertion at `test-close-linked-issues.sh:596` (`#523` closed in the same body as `#522`).
- Correct: the control logs are mutually consistent and every failing row maps to a real
  behaviour difference (see "Control-log audit").
- Blocker: none.
- Note: one wrong number at HEAD in the design doc table (`466-design.md:217`), already
  corrected in the working tree but not in the commit under gate. Doc-only, low severity.
- Note: two doc/comment inaccuracies adjacent to the delta (locale direction wording,
  `PASS=91`), and one new deliberate drop class the delta does introduce (lowercase
  sentence start after a two-space gap).

## CRITIC — attack on `[^[:space:][:lower:]]`

Question 1 — "does the new class ever REMOVE a negation that `[^[:lower:]]` kept
(a new wrong close)?" **No. It cannot, in any locale.**
`body_sentences` is consumed only by the negation pass (`close-linked-issues.sh:246-252`);
the affirmative set `numbers` comes from `body_flat` (`:239-244`) and is untouched.
Subtraction (`:253-262`) only ever deletes a number. The only difference between the two
classes is that the new one rejects a `[[:space:]]` as the post-run character. At any
start position, new-match ⇒ old-match (same `[[:lower:]]` under the same locale, strictly
smaller trailing class), so the new newline-position set is a subset. Deleting an inserted
`\n` joins two lines; every negator/`CLOSE_REF` pair that matched inside a piece still
matches inside the joined piece-concatenation (the gap `[^#]*` may now cross the old
boundary, never blocked by it). So negated ⊇ old negated ⇒ closed ⊆ old closed.
Direction of the delta's only possible change is **wrong close → drop**, never
drop → wrong close.
Empirical corroboration: with the full 139-row suite, the a1fd3f6d control fails exactly
one row and it is `assert_not_closed` (#522 closed — the wrong close being fixed), not a
`assert_closed` row. `bcc68d9e-control-a1fd3f6d-spaceguard.log` = `PASS=138 FAIL=1`.
**Wrong closes added by this delta: zero.** Stated explicitly, as required.

Question 2 — separator variants (tab, form feed, vertical tab, NBSP, `\r\n\r\n`).
Tested with the exact sed expression in `/tmp` (GNU sed 4.9, `LC_CTYPE=C.UTF-8`):

| separator after `.` | OLD output | NEW output | verdict |
| --- | --- | --- | --- |
| `\t` + `TabCloses #B` | split | split | unchanged, drop-safe |
| `\f` + `FFix #B` | split | split | unchanged |
| `\v` + `VFix #B` | split | split | unchanged |
| `\xc2\xa0` (NBSP) + `Closes #B` | no split | no split | NBSP is **not** `[[:space:]]` here; one sentence ⇒ negation reaches further ⇒ drop-safe |
| `\r\n` + `Closes #B` | split | split | `\r` is `[[:space:]]`; the CRLF/JOIN pair is covered by `test-close-linked-issues.sh:601-604` |

`\t \f \v \r` are `[[:space:]]` in every POSIX locale, so the guard treats them uniformly;
NBSP is not, which lands on the safe direction (one sentence, more negation). Neither
case changes extraction relative to a1fd3f6d for `\t \f \v \r`, and NBSP is unchanged at
all (`CLOSE_SEP` at `:190` is not touched by this delta, so `Closes\u00A0#N` extracts
nothing both before and after — a pre-existing drop).

Question 3 — "body ending in `. ` with nothing after". No match under either class in the
single-space case; with a **two**-space trailer the old class did match (a space satisfied
`[^[:lower:]]`) and emitted a trailing empty line, the new class does not. Pure deletion of
a trailing empty line in the negation input; the affirmative pass reads `body_flat`. No
effect. Verified.

Question 4 — sed/`[[:space:]]` under a UTF-8 locale. `[[:space:]]` is stable (POSIX fixed
set). `[[:lower:]]` is not: `LC_ALL=C` vs `C.UTF-8` differ on `é` (verified:
`This does not fix #A. éclair closes #B.` splits under `LC_ALL=C` and does **not** split
under `C.UTF-8` / `en_US.UTF-8`). Under an ASCII-only ctype an extra split appears, i.e.
the *close* direction, not the drop direction. This is **not added by the delta** (both
classes share `[[:lower:]]`; the a1fd3f6d class splits on `é` too), but see F3.

Question 5 (load-bearing) — "did the fix break `Neither reviewer objected.  Closes #N`
with two spaces, i.e. is a lowercase word plus a two-space gap now required for the #486
win?" **No for the uppercase form; yes-by-design for the lowercase form.**
Verified with the real expression:
`Neither reviewer objected.  Closes #503.` → NEW splits at `.` (`C` is non-space,
non-lower) → `#503` closes. The #486 win survives the two-space gap. Independently
corroborated: `#503` is not in any baseline's FAIL list, and the HEAD suite is 139/0.
The genuinely new behaviour is one level narrower than the critic's hypothesis: a
**lowercase** continuation after a two-space gap no longer splits
(`This does not fix the parser.  closes #522.`), which converts a pre-delta wrong close
into a drop. That is exactly the #522 row and it is pinned
(`test-close-linked-issues.sh:594-596`). Side effect worth naming: the same swap also
converts a *legitimate* close into a drop when the gap is two-space **and** the next
sentence starts lowercase, e.g. `There is no blocker.  this Closes #B.` → #B is now
negated and dropped (it closed at a1fd3f6d). Visible (`Ignoring #B` + SKIP row,
`:258-259`), recoverable by hand, and the documented class ("a sentence that opens with a
lowercase word is not treated as a break"). It is the same trade #486 already accepted,
so it does not block.

## Control-log audit (consistency and row mapping)

All four logs in `.scratch/reviews/466/` were read; no heavy suite re-run (budget rule).

| Log | Header says | Assertion lines counted | Consistent |
| --- | --- | --- | --- |
| `bcc68d9e-tests.log` | `PASS=139 FAIL=0` | 139 assertions | yes |
| `bcc68d9e-control-8b2504e2-wordcount.log` | `PASS=124 FAIL=15` | 15 FAIL rows | yes |
| `bcc68d9e-control-bfe4c50d-trsplit.log` | `PASS=134 FAIL=5` | FAIL rows #510 #512 #513 #515 #522 | yes |
| `bcc68d9e-control-a1fd3f6d-spaceguard.log` | `PASS=138 FAIL=1` | FAIL row #522 | yes |

Arithmetic: 139 = 124+15 = 134+5 = 138+1. **All three controls are mutually consistent
and sum to the HEAD assertion count.** Every failure row maps to a real behaviour
difference, checked one by one (all are `assert_not_closed` failing = the baseline
CLOSED, or `assert_closed` failing = the baseline did not close):

- wordcount (15): #135 + its log-echo row (the #486 same-sentence trade), #490/#492
  (per-span `not only` test), #494/#497 (contractions), #499 (negator's own separator),
  #501 (`not **only**` affirmative), #503 and #504 (sentence scope — the #486 core),
  #507/#509 (summary rows), #517/#518/#519 (`?`/`!`/`;` terminators). All real.
- tr-split (5): #510 (`AGENTS.md,`), #512 (`e.g.`), #513 (`...`), #515 (`v1.2`), #522
  (double space) — all five CLOSED under the baseline, i.e. five wrong closes. Real.
- spaceguard (1): #522 CLOSED. Real — the exact hole this delta closes.

Suite growth is consistent too: the delta adds 5 assertions (2 for #522, 3 for the CRLF
row), 134 + 5 = 139, matching `a1fd3f6d-tests.log` (`PASS=134 FAIL=0`) and the doc.
Discriminating power: only the #522 row separates HEAD from both bfe4c50d and a1fd3f6d;
the CRLF row (#524/#525 + RC) passes on all three post-base baselines and only
discriminates against the pre-PR base. Coverage, not a pin — harmless.

## DEFENDER — strongest honest case that the class is now right

1. The class now matches what the code comment already claimed (`:207-213`): a terminator
   ends a sentence only when the next **non-space** character is not lowercase. Before
   this delta the comment was right and the code was wrong, which is exactly the defect
   the a1fd3f6d gate found (`This does not fix X.  closes #N` closed the issue).
2. The change is one direction only (proof in Question 1): it removes splits, never adds
   them, so it cannot create a wrong close under any locale, any runner, any class
   semantics. It is a strict improvement over a1fd3f6d with a bounded, pinned, visible
   cost (drops).
3. The residual classes are genuinely a different kind of fix, not another
   character-class patch:
   - abbreviation (`This does not e.g. Fix #N`, `466-design.md:232-237`) — deciding that
     `e.g.` is not a sentence end needs an abbreviation lexicon. More importantly the
     delta does **not** change it: I ran both classes on that exact body and both produce
     `This does not e.g.| Fix #512.| Closes #514.` — byte-identical. Not a delta finding.
   - `or`-coordination (`does not fix #A or resolve #B`, `466-design.md:238-243`) — that
     body contains no `.`/`!`/`?`/`;`, so the guard this delta edits never executes on it;
     output is identical from the guard at a1fd3f6d and bcc68d9e, and it is not a
     regression against the pre-PR base (which closed everything). A real hole, a real
     follow-up, but untouched by, and unprejudiced by, this delta.
4. Locale pin: not needed *for this delta* — both classes share `[[:lower:]]`, so the
   locale question is orthogonal to the reviewed change. It is still worth an environment
   pin on its own merits (F3), because the runner is self-hosted (issue #54) and its
   locale is not declared anywhere in `.github/workflows/auto-close-issues.yml`; the
   dangerous direction there is a wrong close arising from extra splits.
5. Runner constraints are met: only bash/curl/jq/sed are used; the delta is inside the
   `sed -E` guard, and GNU sed's `\n` in the replacement was already load-bearing before
   this commit (unchanged), with GNU sed 4.9 verified locally. No `gh`, no sudo.

## SYNTHESIS — findings

| # | Severity | Triggering body / artifact | Code path | Disposition |
| --- | --- | --- | --- | --- |
| F1 | Low (doc/evidence, this delta) | table row `466-design.md:217` claims tr-split `PASS=138 FAIL=1` and rows `#510/#512/#513/#515` | n/a — contradicts `bcc68d9e-control-bfe4c50d-trsplit.log` (`PASS=134 FAIL=5`, includes `#522`), and duplicates the gate-fix row's numbers | **Fix in this PR** — the worktree already holds the correction (`git diff` shows `PASS=134 FAIL=5` + `#522`), it is just uncommitted; commit it. Doc-only, not a code defect |
| F2 | Low (doc, pre-existing) | `466-design.md:206` "round-1 fixed script (`978cf95b`): `PASS=91 FAIL=0`" | n/a — `978cf95b-fixed.log` says `PASS=74 FAIL=0`, and the same paragraph says the suite then had 74 assertions; 91 is impossible | Fix in the same doc pass (2-word edit). Not touched by this delta |
| F3 | Low (note) | `466-design.md:93-95` / `close-linked-issues.sh:207` — `[[:lower:]]` is locale-dependent and no locale is pinned | guard at `:221`; verified `LC_ALL=C` splits on `é` where `C.UTF-8` does not. The split direction there is **close**, not drop, so the doc's wording is backwards for the LC_ALL=C case it just described | Defer: *auto-close: pin LC_ALL for the sentence guard's `[[:lower:]]` class (self-hosted runner locale)*. Not added by this delta; no blocker |
| F4 | Low (note) | `close-linked-issues.sh:88` now names sed | preflight `:86-91` checks presence only, never GNU-ness, and no test asserts the message (grep for `needs curl` in the test file: no match) | Optional: message could say "GNU sed", or an `env: LC_ALL` + a GNU-sed note in the workflow. Cosmetic |
| F5 | Note, deliberate | `There is no blocker.  this Closes #B.` (two-space gap + lowercase sentence start) — **new drop** vs a1fd3f6d | guard `:221` no longer splits; `#B` is subtracted and echoed `Ignoring #B` (`:258-259`) plus a SKIP summary row | Dismiss as a blocker: pinned and intended by `#522` (`test:594-596`), same class as the #486 trade, visible and hand-correctable. Recorded, not a regression risk |
| F6 | Dismissed | `This does not e.g. Fix #512`, `This does not e.g. **fix** #N` | guard `:221` output byte-identical at a1fd3f6d and bcc68d9e (verified) | Dismiss — deferred class, unaffected by this delta; follow-up already named (`466-design.md:236`) |
| F7 | Dismissed | `This does not fix #A or resolve #B` | body has no `. ! ? ;` so `:221` never runs on it; identical at a1fd3f6d; also not a regression vs the pre-PR base (which closed everything) | Dismiss — deferred class, pre-existing, follow-up already named (`466-design.md:243`) |
| F8 | Dismissed | `Neither reviewer objected.  Closes #503` (two spaces, uppercase) | guard `:221` splits; `#503` closes; not in any FAIL list; HEAD suite 139/0 | Dismiss — the #486 win is intact, the critic's load-bearing concern is disproved |

Is either deferred class severe enough to block? **No.** F6 is unchanged by this delta
(byte-identical guard output) and needs a lexicon; F7 is a body shape the edited guard
does not even execute on, and closing it needs a coordinated-reference pattern
(`does not fix #A or resolve #B`), not another class tweak. Both are named in
`466-design.md:226-243` with proposed follow-up titles, so neither is a silent surprise.
F7 is the more unpleasant of the two (wrong-close direction, plausible English), so if the
parent wants one thing expedited after this merge, make it the `or`-coordinated follow-up,
not the abbreviation one.

**Verdict: SHIP.** Single most important reason: the delta is provably one-directional —
the new split-position set is a strict subset of a1fd3f6d's, so negation coverage can only
grow and the closed set can only shrink; **zero wrong closes were added**, confirmed by
direct GNU-sed verification of every separator variant and by the a1fd3f6d control failing
exactly the one `assert_not_closed` row the delta fixes. The only defect found is a wrong
number in a design-doc table row already corrected in the working tree (F1) — commit that
correction, and consider F2/F3 in the same pass.

Next action (about 2 minutes): commit the already-present `466-design.md` row correction,
then `git add -p` the F2 line (`PASS=91` → `PASS=74`).

## Verification commands used (read-only)

- `git diff a1fd3f6d..bcc68d9e -- scripts/ci .scratch/implementation`, `git show bcc68d9e:...`,
  `git status --porcelain`, `git diff -- .scratch/implementation/466-design.md`
- `grep -n '^FAIL'` / `-c` over the four recorded `.scratch/reviews/466/bcc68d9e-*.log` files
- Direct GNU sed 4.9 evaluation of both guard expressions on 15 hand-built bodies
  (two-space, tab, form feed, vertical tab, NBSP, CRLF, trailing `. `, `a.1b`, `é` under
  `LC_ALL=C` vs `C.UTF-8` vs `en_US.UTF-8`), no script executed
- Not run (per budget rule): `scripts/ci/test-close-linked-issues.sh` (139/0 already
  recorded at this HEAD), `pnpm lint`, and any new probe run
