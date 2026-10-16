# #466 debate (round 4) — `ac6e55dd4301999c639ac3e2e977fc9941b05c10`

Base `073af118`. Worktree `D:/projects/tuari_react_hono/worktrees/fix-autoclose-workflow`.
Diff under review: `NEGATORS` gained `nor|neither` (`scripts/ci/close-linked-issues.sh:173`),
comment updates, and 4 new assertions `#471`–`#474` (`scripts/ci/test-close-linked-issues.sh:388-401`).

## Method / exact commands

```
bash -n scripts/ci/close-linked-issues.sh
bash -n .scratch/reviews/466/ac6e55dd-probe.sh
sed -n '/^CLOSE_VERBS=/,/^if \[ -z "\$numbers" \]/p' scripts/ci/close-linked-issues.sh | sed '$d'   # the lifted block
bash .scratch/reviews/466/ac6e55dd-probe.sh   > .scratch/reviews/466/ac6e55dd-probe.log
bash .scratch/reviews/466/ac6e55dd-probe2.sh >> .scratch/reviews/466/ac6e55dd-probe.log
```

The probe evals the REAL extraction block (`CLOSE_VERBS=…` at `:161` through the numeric
sanitize at `:219`) once per body and prints the resulting `numbers` (what would be closed)
and the raw `negated` set. That list is exactly the input of the close loop
(`for num in $numbers; do` at `:226` → `PATCH issues/$num`), so a number appearing in
`numbers` **is** a close. No suite, no pnpm/turbo/playwright, no API call, nothing outside
`.scratch/reviews/466/` was written.

## 1. Claim verification (task items 1–2)

| # | body | expected | observed (`numbers`) | severity/verdict |
|---|---|---|---|---|
| N1/N2 | `This does not close #231, nor does it fix #232.` | nothing | `[]`, negated `[231 232]` | **FIXED — was the round-3 blocker** |
| N3/N4 | `No, this never fixes #239 nor closes #240.` | nothing | `[]`, negated `[239 240]` | **FIXED — was the round-3 blocker** |
| N5 | `This does not close #231, nor does it fix #232. Closes #233.` | only #233 | `[233]`, negated `[231 232]` | **PASS** |
| N6 | `Neither fixes #473 nor closes #474.` | nothing | `[]`, negated `[473 474]` | **PASS** |
| B1 | `No, this does not close #150.` | nothing | `[]`, negated `[150]` | **PASS (round-2 blocker repro)** |
| B2 | `No, it doesn't fix #150.` | nothing | `[]`, negated `[150]` | **PASS (round-2 blocker repro)** |
| B3 | `No, we never close #150.` | nothing | `[]`, negated `[150]` | **PASS (round-2 blocker repro)** |

Non-regression controls in the same runs: `No, this Closes #457.` → `[457]`;
`Note: this Closes #458.` → `[458]`; `Nobody closes #459, it is still open.` → `[459]`
(intentional round-2 decision); `Do not merge this until it Closes #135.` → `[135]`;
`This not only fixes #448, it Closes #449.` → `[448 449]` (the `not only/just` rescue survives
the new negators, since neither `nor` nor `neither` appears in the rescue regex).

**All three claimed behaviours reproduce. The round-2 blocker does not regress.**

## 2. False-CLOSE hunt (the only blocker class)

| # | body | expected | observed | severity |
|---|---|---|---|---|
| H4 | `This reverts the PR that closed #224 prematurely.` | nothing | **closes #224** | pre-existing residual (round-2 N7 / probe `#224`), documented, unchanged by this head |
| H5 | `Nothing closes #245.` | nothing | **closes #245** | low reachability; `nobody/nothing/nowhere` are deliberately not negators (round-2 test `#459`) |
| H1 | `Without closing #243 the bug persists.` | nothing | **closes #243** | low reachability; `without` absent from NEGATORS, but a real negator usually co-occurs (`cannot … without closing` → correctly negated, H19) |
| H2/H3 | `We were unable to close #253 here.` / `This failed to close #254.` | nothing | **closes #253 / #254** | low reachability; `fail`/`unable` are not negators |
| H7 | `Unless we close #261, the bug stays.` | nothing | **closes #261** | low reachability; `unless` is not a negator |
| H14 | `This does not close #231, nor does it attempt to fix #232.` | nothing | **closes #232** (negated `[231]`) | **medium-high**: the exact class this head fixes, one filler word past the window |
| H15 | `Neither closes #473 nor does it attempt to fix #474.` | nothing | **closes #474** | same hole through the new `neither` fix |
| H16 | `This does not close #231, nor, at this time, does it fix #232.` | nothing | **closes #232** | same hole (comma-blocked window) |
| H17 | `This does not close #231, nor does the reviewer believe it will fix #232.` | nothing | **closes #232** | same hole |
| H18 | `This does not, in any way whatsoever, close #280.` | nothing | **closes #280** | same hole on the plain-negation path (4 words + punctuation) |

Why H14–H18 are **not** a new blocker from this head:

1. The window used by the negated pass is `([^[:alnum:]#]*[[:alnum:]_'-]+){0,3}`
   (`:205-207`) — 3 words *including* fillers such as `to`. The idiomatic continuation after
   `nor` is a multi-word infinitive (`nor does it attempt to fix`, `nor do we plan to fix`,
   `nor is it intended to fix`), which puts the verb in slot 4+, so the close survives. This is
   the "3-word cliff" already found and accepted in round 2 as **N5 (severity 5, "brittle
   cliff, not a principled rule"; decision: document, boundary verified as specified)** — the
   same cliff reached through a different door, not a new regression.
2. `grep -o` matches are leftmost-longest and cannot cross a `#`, so the `not` in
   `does not close #231, nor … fix #232` can never reach `#232`: the nor-clause number must be
   caught by the `nor`/`neither` alternative itself (it is, for ≤3 words).
3. This diff is **monotone with respect to false closes**: adding `nor|neither` only adds
   members to the `negated` set, and `negated` is only ever *subtracted* (`:210-219`). No body
   that closed an issue before this head closes one after it. Every measurable regression
   introduced here is a **false drop** (medium), never a false close.

Verdict on the hunt: no *new*, realistic false close was produced by this head. The surviving
false closes are the two documented residuals (H4 past-tense narration, and the flattened
hard-wrapped mention `…the earlier PR closes\n#223…` from round 2 N6) plus the documented
window cliff, plus four semantically-negated phrasings (`without`, `unable to`/`failed to`,
`nothing`, `unless`) that a closing PR body realistically would not use in place of
`does not close #N`. Reported, not blocking.

## 3. False DROPS found (medium at worst, by instruction)

| # | body | expected | observed | severity |
|---|---|---|---|---|
| D1 | `This is neither large nor risky. Closes #249.` | closes #249 | **dropped** (negated `[249]`) | **medium, NEW from this head** |
| D2 | `Neither reviewer objected. Closes #259.` | closes #259 | **dropped** (negated `[259]`) | **medium, NEW from this head** |
| D3 | `This does not touch the API; Closes #269.` | closes #269 | dropped | medium, pre-existing (`not` window crosses `;`) |
| D4 | `It does not matter; Closes #270.` | closes #270 | dropped | medium, pre-existing |
| D5 | `No follow-up needed. Closes #236.` | closes #236 | dropped | medium, pre-existing (`no[[:space:]]+`) |
| D6 | `Caveat: this does not address the docs. Closes #271.` | closes #271 | dropped | medium, pre-existing |
| D7 | `The issue is open; this never touches it. Closes #272.` | closes #272 | dropped | medium, pre-existing |
| D8 | `This does not fail to close #247.` (double negation) | closes #247 | dropped | low, contrived |
| D9 | `Do not forget to close #249 before merge.` | closes #249 | dropped | low, contrived |

D1/D2 are the only *new* behaviour introduced by `nor|neither`: the negator reaches across a
sentence terminator (`. ` / `; `) into the next clause's closing line because
`[^[:alnum:]#]*` happily eats `.`/`;`/`,`. Each drop is echoed (`Ignoring #N: the PR body
negates closing it`, `:212`) and is hand-recoverable, so medium is the right ceiling. If the
parent wants zero new drops, the cheap narrowing is to forbid `.`/`;`/`!`/`?` inside the
negator-gap class — but see the next section: that is another patch on the same coin.

## 4. Are the 3-word window, the whole-word rule and the nor/neither fix mutually consistent?

Consistent, yes; *principled*, no.

- The whole-word wrapper `\b(NEGATORS)\b` (`:207`) is coherent with the added words:
  `nor`/`neither` cannot match as a prefix of anything else, so the round-2 blocker class
  (`No,` / `notably` / `nobody` prefix matches) is untouched.
- `no[[:space:]]+` inside a `\b…\b` group is well-behaved: the trailing `\b` requires a word
  character after the space, so `no #N` and `no, #N` cannot match as negators.
- The 3-word window is the only *load-bearing heuristic* left, and widening/narrowing it is a
  **zero-sum trade**, demonstrated above: 4 words = H14–H18 false closes at 3 words become
  H14/H16/H18 closed at 3; 2 words would fix D3/D6 but reopen
  `does not, however, close #N` (suite `#444`) and `does not, in any way, close #N` (`#446`).
  A 4th patch therefore buys local coverage and pays elsewhere.

**Recommendation — stop patching the window; change the scope unit once.** Scope the negation
to the *sentence* (split the flattened body on `[.!?;]` and require the negator and the close
verb in the same sentence) instead of counting words. That single change:
- fixes H14–H18 (any number of fillers),
- fixes D1–D7 (negator in sentence A cannot touch the close in sentence B),
- keeps N1–N6, `No, this does not close #150`, and `does not, however, close #N` correct.
Known cost to accept explicitly: `Do not merge this until it Closes #135.` (suite `#135`)
becomes a *drop* — one sentence, negated, whereas the parent ruled a 4-word gap is "a different
clause". That is a documented medium, logged, hand-recoverable drop traded for the whole
unbounded false-close class. Note also that the round-2 N6 residual (newline flattening at
`:177`) is a *different* mechanism and would need its own decision: restricting the join to
`Closes\n#N` is not expressible in grep, so either accept it or move the matcher to `awk`/`jq`.

## 5. Test coverage note (minor)

The four new assertions (`:388-401`) cover "nor clause, second reference" and "neither/nor",
matching the round-3 finding. Missing: an assertion that an affirmative close *in the same
body* as a nor-clause survives with the nor numbers dropped — probe N5
(`…nor does it fix #232. Closes #233.` → `[233]`) passes but is untested in the suite; the
nearest row is `#131/#132` (`but Closes`). One `mk_issue 233`/`assert_closed` pair would lock
that in.

## Findings summary for synthesis

| finding | class | in scope? | action |
|---|---|---|---|
| Round-3 nor-clause second reference | false close | yes | **fixed** by `ac6e55dd`, probe-verified |
| Round-2 `No, …` blocker repros | false close | yes | still fixed, probe-verified |
| H14–H18 window cliff (4 words / filler `to`) | false close | yes | round-2 N5, accepted as documented; do not re-patch — scope by sentence (follow-up issue) |
| H4/H5/H1/H2/H3/H7 narration & non-list negators | false close | pre-existing/contrived | document in Risks; no new action |
| D1/D2 `neither`/`nor` crossing `.`/`;` | false drop | yes, new | medium, logged (`Ignoring #N`), recoverable — fix opportunistically, not as a blocker |
| D3–D9 | false drop | pre-existing/contrived | document |

VERDICT: NO BLOCKER

## Post-evidence delta — `065c54a0`

Reviewed code: `ac6e55dd`. The only later commit, `065c54a0`, is test-only +
design-doc: `scripts/ci/close-linked-issues.sh` is byte-identical to the reviewed
`ac6e55dd`, so this verdict stands for `065c54a0`.

- `scripts/ci/test-close-linked-issues.sh`: +2 scenarios (nor-block anti-vacuity
  control `#480`, `Closes:#N` `#481`) → `PASS=91 FAIL=0` (single run, filtered
  output).
- `.scratch/implementation/466-design.md`: assertion count, real `NEGATORS`
  string, nor/neither rows, and a Risks entry for the word-window limitation.
- The residual false closes and false drops this review listed are NOT fixed
  here; they are the proposed sentence-scoped follow-up in the design doc.
- Pre-fix control for the 91-assertion suite: PENDING A SLOT (owner's CPU
  policy; not retried).
