# Test audit — `.scratch/reviews/466/bcc68d9e-test-audit.md`

Subject: `scripts/ci/close-linked-issues.sh` + `scripts/ci/test-close-linked-issues.sh` at
`bcc68d9e` (delta `a1fd3f6d..bcc68d9e`), PR #487 / issues #466 + #486.
Method: `.agents/skills/test-audit/SKILL.md`, three angles (edge-case hunter, coverage
analyst, quality reviewer). Recorded logs + one cheap offline probe used; the suite was
**not** re-run (budget rule).

Verdict: **no blockers.** 1 coverage gap worth a row, 1 label whose claim is not what the
row tests, 1 assertion that can pass for the wrong reason, 1 locale remark. HEAD suite
`PASS=139 FAIL=0`.

---

## 1. Edge-case hunter

### 1a. Softer sentence break: form-feed / NBSP separator — NOT pinned 🟡
- `CLOSE_SEP` is `[*_]*([[:space:]]+|:)[[:space:]]*[*_]*` (`close-linked-issues.sh:169`).
  Membership of `\f` is stable, membership of NBSP (U+00A0) is libc/locale-dependent.
- No row in the matrix exercises either (`grep -n '\\f' scripts/ci/test-close-linked-issues.sh` → no row).
- Risk: a body that uses a form feed or NBSP between keyword and reference is not extracted
  ⇒ no close. Safe direction (missed close), so 🟡 not 🟠.
- Trigger string: `Closes\f#526` (closes at HEAD; unpinned) / `Closes\u00a0#526`
  (locale-dependent; unpinned).

### 1b. Terminator at end of body — already covered, no gap ✅
- `#509` body `"This does not close #509."` (`test-close-linked-issues.sh:524-531`) and
  `#519` body `"The change is not related; Closes #519."` (`test:576-579`) both end in a
  terminator and pass. Dismissed.

### 1c. Two spaces + UPPERCASE continuation — NOT pinned 🟡
- The new `#522` row deliberately uses a **lowercase** continuation
  (`"This does not fix the parser.  closes #522. Closes #523."`, `test:594`); the
  two-space + uppercase form `"This does not fix X.  Closes #N"` has no row.
- Desired behaviour at HEAD confirmed by running the guard:
  `printf '%s' "This does not fix X.  Closes #999." | sed -E 's/([.!?;])([[:space:]]+[^[:space:][:lower:]])/\1\n\2/g'`
  → `This does not fix X.` / `  Closes #999.` (splits, so `#999` closes).
- Not a regression: the `a1fd3f6d` guard `([.!?;])([[:space:]]+[^[:lower:]])` splits the same
  body (whitespace run backtracks to one space; the second space satisfies `[^[:lower:]]`).
  This is a coverage gap against the "#486 win must survive two spaces" claim, not a defect.
- Suggested row (2 lines): `mk_issue 526 open "two spaces, uppercase continuation"` +
  `run_script "This does not fix X.  Closes #526."` + `assert_closed` … 526.

### 1d. Negator reaching a second close in an `or`-clause, and abbreviation + non-lowercase
Deferred by instruction; see `466-design.md:230-247`. **Neither is severe enough to block
this PR**: both are wrong-CLOSE, but (i) both are pre-existing at the parent/round-1
commits, (ii) both are narrower than what this delta fixed, and (iii) both are named with
proposed follow-ups in the design doc, not left silent. Judgement: merge-able; fix as
follow-ups.

---

## 2. Coverage analyst

### 2a. The `#522` row fails on `a1fd3f6d` — YES ✅
- `.scratch/reviews/466/bcc68d9e-control-a1fd3f6d-spaceguard.log:107` is the **only** FAIL
  line and it is
  `FAIL: a double space after the terminator is not a sentence break (#522) did NOT close #522`;
  summary at line 154 is `PASS=138 FAIL=1` (= expected).
- Mechanism reproduced independently: on the same body,
  `sed -E 's/([.!?;])([[:space:]]+[^[:lower:]])/…/'` (a1fd3f6d) splits at `.  closes` into
  `This does not fix the parser.` / `  closes #522.`
  while HEAD's `[^[:space:][:lower:]]` leaves it as one sentence (`grep` on the negated
  pattern then matches, so `#522` is subtracted). The row is a real regression pin for the
  gate fix, not a cosmetic addition.

### 2b. The CRLF row does exercise CRLF — the CR reaches `sed`, but the assertion cannot tell ✅/🟠
Byte-level chain (verified, not assumed):
- `run_script` (`test-close-linked-issues.sh:90-96`) writes `jq -cn --arg b "$1"` ⇒ the
  `$'…\r\n…'` argument is JSON-encoded as `\r\n` escapes.
- The script reads it back through the API shim + `jq -r` (`close-linked-issues.sh:135-136`).
  I ran that exact round-trip: `od -c` of `jq -r '.body'` shows real `\r` bytes.
- `body_flat=$(printf '%s' "$PR_BODY" | tr '\n' ' ')` (`close-linked-issues.sh:212`) replaces
  only LF, so the CR survives into `sed`; `od -c` of `body_flat` shows `#524.\r\r Closes`
  and the guard output splits at `#524.` / `^M^M Closes #525.`.
  ⇒ Nothing normalises the CR away. Answer to the question: **really exercises CR**.
- 🟠 Caveat: the row's assertions pass with or without the CR
  (`".  Closes"` and `".\r Closes"` both split), and `#524/#525` PASS on **all three**
  baselines, so the row would stay green against a `tr -d '\r'` regression — it cannot
  detect CR stripping. It is new coverage of the CR path, not a pin of it.
- Sharper pin available (verified offline): use the CR as the keyword/reference separator —
  `printf 'Closes\r#526' | grep -oiE '<CLOSE_REF>'` **matches** at HEAD (CR satisfies
  `[[:space:]]+`); strip the CR and `Closes#526` matches nothing (design: `Closes#12` is not
  a close). A row body `$'Closes\r#526'` + `assert_closed` would genuinely fail a CR-stripping
  script.

### 2c. Three control logs internally consistent? YES ✅
| log | summary | FAIL lines | consistent |
| --- | --- | --- | --- |
| `bcc68d9e-control-a1fd3f6d-spaceguard.log` | `PASS=138 FAIL=1` (l.154) | 1 — `#522` (l.107) | ✅ |
| `bcc68d9e-control-bfe4c50d-trsplit.log` | `PASS=134 FAIL=5` (l.206) | 5 — `#510,#512,#513,#515,#522` (l.94,108,123,139,159) | ✅ |
| `bcc68d9e-control-8b2504e2-wordcount.log` | `PASS=124 FAIL=15` (l.288) | 15 (l.37…243) | ✅ |
All three sum to 139 = HEAD total. `466-design.md:216-218` reproduces each number and its
row list **verbatim** (I checked the file text against the logs after a suspicious first
read of the diff — no mismatch).

### 2d. Any ADDED row vacuous on all three baselines? YES, four assertions ✅(by design) / 🟠(one)
- `#522` negative assertion: discriminating (fails on 2 of 3).
- `#523`, `#524`, `#525`, `check "CRLF body exits 0"`: green on all three baselines.
  `#523`/`#525` are the deliberate paired anti-vacuity controls
  (`test:430-435` states the convention). Only `#524`'s *negative* assertion carries
  informative intent that no baseline exercises — see 2b.
- Duplicate-coverage note: `#513` (`"…it does not... close #513."`) and `#522` exercise the
  same mechanism ("terminator + whitespace + lowercase continuation"); only `#522` pins the
  multi-space run, so the pair is not redundant, just overlapping.

### 2e. #486 acceptance criteria ↔ rows (coverage)
| #486 criterion | row(s) |
| --- | --- |
| negator in an earlier sentence must not reach a later close | `#503` (`test:489-493`) |
| negation past the old 3-word window must still negate | `#504` (`test:495-500`) |
| `?`/`!`/`;` end a sentence | `#517`,`#518`,`#519` (`test:568-579`) |
| token-internal terminator must not end a sentence | `#510`,`#512`,`#513`,`#515` (`test:543-564`) |
| boundary = terminator + whole whitespace run | `#522` (this gate) |
| documented conservative drop is logged | `#135`, `#456` (`test:271-275`, `424-428`) |

One criterion has **no** row: the locale claim in `466-design.md:88-91` — see §4.

---

## 3. Quality reviewer

Grade: **A−** (names/structure/isolation strong; two deductions below).

### 3a. Renamed `#520` label — partly describes the row, one clause is not tested 🟠
- Row: `test:581-586`, body `"The change is not related; this does not close #520. Closes #521."`,
  assertions `assert_not_closed … 520` + `assert_closed … 521`.
  New label: `a lowercase clause after the ';' is one sentence, and its negation still negates (#520)`.
- The second clause is exactly what the row exercises. The first clause ("is one sentence") is
  an interpretation of the guard, and the assertion cannot see it: the row passes unchanged on
  `bfe4c50d`, where `;` **does** split the sentence
  (`bcc68d9e-control-bfe4c50d-trsplit.log` has no `#520` FAIL line). The design doc is candid
  about this — `466-design.md:197` calls it "(control — passes on every baseline)".
- Verdict on the question: the rename is an improvement (it no longer implies the row pins the
  `;`-boundary), but "is one sentence" overstates what is verified. Either drop that clause or
  add a discriminating body — verified offline that
  `This does not, strictly speaking; anyway Closes #520.` **discriminates**:
  HEAD guard leaves it one sentence ⇒ negated span `#520` found ⇒ drop;
  tr-split ⇒ `This does not, strictly speaking` / ` anyway Closes #520.` ⇒ no negated span ⇒
  `#520` closes. (Output captured in the probe run.)

### 3b. Assertions that can pass for the wrong reason
1. `#524` `assert_not_closed` — passes for the wrong reason (CR presence untested); the
   `#525` control proves the body was processed but not that the CR survived. §2b.
2. `#520` — see 3a.
3. General `assert_not_closed` vacuity (passes if the number was never extracted) is *not* newly
   introduced: every new block pairs its must-NOT with a same-body must-close, and `#522` was
   demonstrably extracted (the `a1fd3f6d` log prints `CLOSED #522`).
4. Isolated and clean: `reset_state` deletes `summary*.md` (`test:98-104`), and both new blocks
   call it ⇒ no cross-row summary leakage. Names cite the issue number; no async; no
   duplicated setup beyond the existing per-block pattern.
   **Nothing else found** that can pass for the wrong reason.

### 3c. Preflight message change (delta item 2) — unpinned, low risk 🟡
- `close-linked-issues.sh:85-90` now says `auto-close needs curl + jq + sed`; no row asserts
  the preflight message text (`grep -n 'not found on runner\|curl + jq' test-close-linked-issues.sh`
  → no row). Pre-existing gap for all three tools, widened by one word. Cosmetic.

---

## 4. Locale (flagged as requested) 🟠
- The script pins no locale: `grep -n 'LC_ALL\|LANG\|locale' scripts/ci/close-linked-issues.sh .github/workflows/auto-close-issues.yml` → nothing.
- The guard's `[[:lower:]]` (`close-linked-issues.sh:220`) is locale-sensitive. Under
  `LC_ALL=C` fewer characters are `[:lower:]` ⇒ `[^[:space:][:lower:]]` matches more ⇒ the
  guard splits **more** eagerly ⇒ token-internal splits ⇒ the dangerous **wrong-CLOSE**
  direction. Under UTF-8 the extra characters are `[:lower:]` ⇒ splits less ⇒ drop direction.
- `466-design.md:88-91` documents the class but asserts "the failure direction there is a
  drop, not a close" — that is true for the *non-split* direction only; the C-locale split
  direction is a close. The sentence is imprecise even if the residual exposure is tiny
  (needs an accented-lowercase continuation inside a token, e.g. after `e.g.`).
- Recommendation (non-blocking): either `export LC_ALL=C.UTF-8` near the top of the script or
  tighten the doc sentence. Current dev box is `LC_CTYPE=C.UTF-8`, i.e. UTF-8, so local runs and
  CI agree today.

## 5. Repo hygiene note (pre-existing, not this delta) 🟡
`git check-ignore -v .scratch/reviews/466/x.md` → not ignored, and
`466-design.md` is inside the reviewed commit range, so `.scratch` is **tracked** here. Not
introduced by `bcc68d9e`; raised only because the working rule expects `.scratch` scratch files
to stay untracked/ignored.

---

## Ranked fix list
1. Add a two-space + uppercase row (`assert_closed`), and either add `Closes\r#526` or delete
   the claim that the `#524` row pins CRLF handling. — 10 min.
2. Drop "is one sentence" from the `#520` label, or add the discriminating body above. — 10 min.
3. Pin the locale or reword `466-design.md:88-91`. — 5 min.
4. (Optional) a row asserting the preflight message names all three tools. — 5 min.

## Correct (verified good)
- The gate fix itself: `[^[:space:][:lower:]]` matches the comment it carries, and the `#522`
  row is a true regression pin (fails on both older baselines, passes at HEAD).
- The CR really reaches `sed`; the CRLF row is not a normalised-away no-op.
- All three control logs and the design-doc table are mutually consistent (139/138+1, 134+5,
  124+15).
- The renamed `#520` label no longer implies the row pins the `;` boundary; the design doc
  labels the row a control.
- Deferred wrong-close classes are named with follow-ups; not blockers.
