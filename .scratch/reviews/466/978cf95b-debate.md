# #466 debate review (round 2) — `978cf95b64b24685ae0ace598ae5d25e60a51ac2`

Range: `073af118d4f10dd1e7c4099a36a228b2035b00bb..978cf95b`
Files in range: `scripts/ci/close-linked-issues.sh`, `scripts/ci/test-close-linked-issues.sh`,
`.scratch/implementation/466-design.md`.
Mode: CRITIC + DEFENDER, then SYNTHESIS. Every claim below was produced by RUNNING the
real script / the real extraction block — not by reading the regex.

## Commands actually run

| Command | Result |
| --- | --- |
| `timeout 400 bash scripts/ci/test-close-linked-issues.sh` | `PASS=74 FAIL=0` (matches commit + design claim) |
| `.scratch/reviews/466/probe-978cf95b.sh` (fake-curl harness → REAL script, `EVENT_QUALIFIED=1`) | 50 one-liner bodies; rows quoted below; log at `probe-978cf95b.log` |
| extraction block lifted verbatim out of the file (`sed -n '/^CLOSE_VERBS=/,/^numbers=$(printf/p'`) into `/tmp/x.sh`, driven with `PR_BODY=` | prints `numbers=[…] negated=[…]` per body — authoritative for which numbers can close |
| `.scratch/reviews/466/probe-978cf95b.sh /tmp/old.sh` where `/tmp/old.sh = git show f64292ec:scripts/ci/close-linked-issues.sh` | old-vs-new column |
| minimal inline fake-curl harness over `git show f64292ec:…` vs the working file | regression proof in BLOCKER-1 |

Toolchain: GNU bash 5.x, GNU grep 3.0, jq 1.7.1 (same family as the runner).

## Required re-verification of the f64292ec findings

| Finding | Claimed fix | Verified? |
| --- | --- | --- |
| C1 punctuation negation (`does not, however, close #N`, `no intention of closing`, 3-word gap, negation across a newline) | wider gap `([^[:alnum:]#]*[[:alnum:]_'-]+){0,3}` | **FIXED** — suite rows #444/#445/#446/#447 green; extractor: `does not,however,close #150` → `numbers=[]`; `does not...close #150` → `numbers=[]` |
| C2 `not only/just/merely` false drop | `grep -viE '…\b(not\|never)[[:space:]]+(only\|just\|merely\|simply)\b'` | **PARTIALLY FIXED** — `not only fixes` (extractor `numbers=[149 150]`), `not merely resolves`, `not simply closes` all close now. But the **contraction spelling is not covered**: `This doesn't just fix #150` → `numbers=[] negated=[150]` (FINDING M2) |
| C3 markdown / newline separators | `CLOSE_SEP='[*_]*([[:space:]]+\|:)[[:space:]]*[*_]*'` + `tr '\n' ' '` | **FIXED** — `**Closes** #150`, `Closes **#150**`, `Closes\n#150` all extract `150`; suite #450/#451/#452 green. Cost: it opens a NEW false close (FINDING N6) |
| C4 `Ignoring #N` printed when nothing was subtracted | `if printf … \| grep -qx "$neg"` guard | **FIXED at code level** (guard present, `grep -qx` before the echo). Note: for a body that only negates (`This does not close #150 — work still open.`) the log still shows `Ignoring #150` **and then** `No 'Closes #N' reference …` — but that Ignoring is now *true* (150 was in `numbers` and was removed), so the inaccuracy C4 named is gone. |
| ST1 verbs duplicated across the two passes | `CLOSE_VERBS` constant used by both `grep`s | **FIXED** — verified in file and in `git diff f64292ec..978cf95b` |

## CRITIC findings

### BLOCKER-1 (severity 9) — the new `No,` filter swallows a genuine negation that follows it: `No, this does not close #N` now CLOSES #N

Location: `scripts/ci/close-linked-issues.sh:189-196` —
`| grep -viE '^[[:space:]]*no[[:space:]]*,|\b(not|never)[[:space:]]+(only|just|merely|simply)\b'`
combined with bare `no` in `NEGATORS` (`:171`).

`grep -oE` returns the **leftmost-longest single match**, and the new filter deletes that
whole span. When the match *starts* at an interjection `No,` and the genuine negator sits
1–3 words later, the entire match — including the real `does not … close #N` — is thrown
away. Nothing is subtracted, the affirmative pass keeps `close #150`, and the issue closes.

Extractor (verbatim block, real file):

| Body | `numbers` | `negated` | Meaning |
| --- | --- | --- | --- |
| `No, this does not close #150.` | `[150]` | `[]` | **false close** |
| `No, it doesn't fix #150.` | `[150]` | `[]` | **false close** |
| `No, we never close #150.` | `[150]` | `[]` | **false close** |
| `No, we have decided that this does not close #150.` | `[]` | `[150]` | correct (negator is 4 words from `No`, so the match starts at `not`) |
| `No, this Closes #150.` | `[150]` | `[]` | correct (the intended `No,` case) |

End-to-end, real script + fake curl (`EVENT_QUALIFIED=1`, fixture #150 open):

```
No, this does not close #150.   →  CLOSED #150
No, it doesn't fix #150.        →  CLOSED #150
No, we never close #150.        →  CLOSED #150
```

Same bodies against `f64292ec` (previous head) and the working file, same harness:

```
--- f64292ec ---          --- 978cf95b ---
No, this does not close #150.   closed=[]     No, this does not close #150.   closed=[150]
No, it doesn't fix #150.        closed=[]     No, it doesn't fix #150.        closed=[150]
No, we never close #150.        closed=[]     No, we never close #150.        closed=[150]
```

**This is a regression introduced by 978cf95b**, in the exact failure class the ticket
exists to kill ("a mention is not a close" → now "an explicit refusal is a close"): the
issue is closed, the run log shows `CLOSED #150` with no warning, the job exits 0. The
`No, #457` test does not cover it because the disqualified interjection there sits on its
own without a second, genuine negator later in the same window.

Cheapest correct fix (two edits, no new machinery):

1. `NEGATORS`: replace the bare alternative `|no|` with `|no[[:space:]]+|` — an interjection
   `No,` then stops starting a match at all, so the match begins at the real negator.
2. Delete the `^[[:space:]]*no[[:space:]]*,` branch of the filter (no longer needed). The
   `not only/just/merely` branch keeps the same whole-match hazard in principle; I could
   not reach it with any body I tried (`Not merely a rename - it does not close #150.`,
   `This is not just a rename. It does not close #150.`, `Not only cosmetic: it does not
   fix #150.` all negate correctly, because the earlier `not`-match cannot reach the verb
   within 3 words), but the safe shape is to filter on the *negator that started the match*
   rather than on the whole span.
3. Add the three bodies above to the suite as `assert_not_closed`.

### N2 (severity 6, false drop) — `doesn't just fix #N` is still dropped (C2 fixed for one spelling only)

`:195` filter only matches the literal `(not|never)[[:space:]]+(only|just|merely|simply)`.
Contractions are in `NEGATORS` but not in the filter: `This doesn't just fix #150 — it
rewrites it.` → extractor `numbers=[] negated=[150]`; probe row G6 `closed=[]`. Not new in
this head (f64292ec also dropped it), but the C2 claim as written ("`not only/just/merely
fixes #N` is filtered back out") is only true for the uncontracted spelling. Add `doesn't|
isn't|won't|didn't` to the filter or state the limitation.

### N3 (severity 5, false drop) — bare `no` also fires INSIDE words (`\bno` has no trailing boundary)

`:171` `\bno` matches the first two letters of any word starting with "no":
`Nobody closes #150.` → `numbers=[]`; `Nothing closes #150 …` → `[]`;
`Notably, this Closes #150.` → `[]` (measured; probe rows A3/A4/B5). `no[[:space:]]+` (fix 1
above) removes this whole class too. Low realism individually, but it is the same one-token fix.

### N4 (severity 5, false drop) — realistic "No …" openers drop a later close

Measured with the extractor, all `numbers=[]`:

| Body | verdict |
| --- | --- |
| `There is no bug; this Closes #150.` | false drop |
| `No changes needed elsewhere; Closes #150.` | false drop |
| `No test changes; this Closes #150.` | false drop |
| `No - it Closes #150.` (interjection, no comma) | false drop |
| `Hardly any change; Closes #150.` | false drop |

The `No,` filter only rescues the *comma* form. These are ordinary PR-body shapes
(2–3 words then a verb inside the 3-word window), so the widening from two words to three
plus bare `no` increased the false-drop rate materially. Drop ≠ blocker, but the design's
Risks section lists only "Not sure, but Closes #N" and does not mention these.

### N5 (severity 5, note) — the three-word boundary is one word away from flipping a legitimate close

`Do not merge until it Closes #150.` (3 words between) → dropped; `Do not merge this until
it Closes #150.` (4 words) → closes. Measured both ways, and the suite pins only the 4-word
side (#135). So "three words" is verified as implemented, but it is a brittle cliff, not a
safety margin.

### N6 (severity 5, NEW false close, MEDIUM) — the newline flattening turns a wrapped mention into a close

`body_flat=$(printf '%s' "$PR_BODY" | tr '\n' ' ')` (`:173`) is new in this head, and it is
what makes the split-line C3 cases work. The same mechanism closes a hard-wrapped mention:

```
the bug that the earlier PR closes
#150 was reopened
```

extractor on the flattened body: affirmative grep → `closes #150`, i.e. `numbers=[150]`;
end-to-end probe row I2 → `closed=[150]`; the **same body against f64292ec (line-based) →
`closed=[]`**. So this is a false close introduced by 978cf95b, relative to both the base and
f64292ec. It needs an unlucky wrap (verb last token on a line, `#N` first on the next), so
frequency is low — but it is the ticket's own failure mode with no operator signal. Either
accept it and write it into the design's Risks (the honest option, since distinguishing it
from the pinned `Closes\n#N` case requires semantics the regex does not have), or close only
the split-line form when the keyword line does not continue a sentence (not expressible in
grep -E).

### N7 (severity 3, pre-existing residual) — narrative past tense still closes

`PR #41 closed #150 prematurely; this reopens it.` → `CLOSED #150` on both f64292ec and this
head (probe row I1). Known C5 residual, GitHub-parser parity, out of this diff's scope.
Record in Risks; no fix now.

### N8 (severity 2) — `Closes:#150` (no space) still closes; `Closes : #150`, `Closes - #150`, `Closes.** #150` do not

Measured (probe rows C1–C4). All over-/under-matches on an explicit keyword pair; safe
direction; the C3 `Closes - #N` drop is already listed in the design's Risks.

### N9 (severity 2) — `#` inside the negator gap is genuinely protected

`This does not Close #151, so #150 stays open.` → `numbers=[]` (nothing closed at all):
`#151` is correctly negated and `#150` is not falsely closed. `This will not fix#150.` and
`There is no #150 close to make.` also extract nothing. Requirement met.

### N10 (no finding) — CRLF

`Closes #150\r\nmore`, `Closes\r\n#150`, `This does not\r\nclose #150.`, `No,\r\nit Closes
#150.` all behave correctly (`\r` is in `[[:space:]]`), measured end-to-end.

### N11 (severity 2) — conservative tie-break holds

`This does not close #150. Later: Closes #150.` and `Closes #150. (Well, it does not close
#150.)` → not closed (probe rows F1/F2); `… but Closes #151.` → #151 only. As documented.

## DEFENDER

- **D1 (the C1/C2/C3 fixes are real):** every one of the previous round's concrete bodies is
  now correct, verified by running the script: `does not, however, close`, `no intention of
  closing`, `does not, in any way, close`, negation split across a newline, `not only fixes`,
  `**Closes**`, `Closes **#N**`, `Closes\n#N`. 74/74 suite assertions green.
- **D2 (BLOCKER-1 is narrow):** the losing shape needs `No,` + a second negator within three
  words. The `No,` filter exists because `No, this Closes #N` was itself a false drop after
  bare `no` was added; the fix direction (two edits, no new parser) is cheap and the
  regression is fully pinned by three one-line tests. A `grep -E` script cannot be expected to
  score "is this `no` an interjection or a quantifier" in general — but it can require `no` to
  introduce a phrase (`no[[:space:]]`), which costs nothing and kills N3 as well. So the design
  is not wrong, the token is under-specified.
- **D3 (false drops are the safe direction):** the ticket says explicitly that a missing close
  "is at least visible", a wrong close is not. N2/N4/N5/N7 are all drops, each logged
  (`Ignoring #N`) and each recoverable by hand. N6 is the only new false close, and it costs
  an unlucky wrap.
- **D4 (blank `Ignoring` log):** the `grep -qx` guard is the right shape; a log line now always
  corresponds to a real subtraction.
- **D5 (workflow/merge path):** untouched; the swallow bug lives only in the extractor, which is
  a pure function of the PR body.

## SYNTHESIS

| # | Finding | Class | Reachable today? | Action |
| --- | --- | --- | --- | --- |
| BLOCKER-1 | `No, this does not close #N` → **CLOSES #N** (new in this head; f64292ec dropped it) | **false CLOSE** | **Yes — proven end-to-end** | **Fix before merge**: `no[[:space:]]+` in `NEGATORS`, drop the `No,` filter branch, add the 3 tests |
| N2 | `doesn't just fix #N` dropped | false drop | yes (not new vs f64292ec) | Widen the `not only/just` filter to contractions, or restate the claim |
| N3 | `Nobody/Notably/Nothing … closes #N` dropped (`\bno`) | false drop | yes | Fixed for free by the BLOCKER-1 fix |
| N4 | `No changes needed; Closes #N`, `No - it Closes #N`, `There is no bug; this Closes #N` dropped | false drop | yes, realistic | Same fix; add one test; document |
| N5 | 3-word boundary: `Do not merge until it Closes #N` dropped, +1 word closes | false drop | yes | Document; boundary is verified as specified |
| N6 | `…closes\n#150 …` (hard-wrapped mention) closes | **false CLOSE (new)** | yes, low frequency | Document in Risks, or restrict the join (hard in grep) |
| N7 | `PR #41 closed #150 prematurely` closes | false close (pre-existing) | yes | Already a documented residual (C5); keep in Risks |
| N8/N9/N10/N11 | `Closes:#N`; `#` in gap blocked; CRLF; conservative tie-break | — | verified correct/safe | None |

**Verdict reasoning.** The adjacency fix and every fix the previous round asked for are real
and now pinned by a green suite (74/0) against the real script. But the C1 fix added bare `no`
plus a whole-match `No,` filter, and that pair converts an explicit refusal into a close:
`No, this does not close #150.` closes #150 on this head while `f64292ec` (and the base) did
not. It is a false close, it is in the ticket's failure class, it is invisible in the log, and
it is a regression this head introduced — so it blocks. The companion finding (N6, the
newline join) is a second new false close, low frequency, and can be documented rather than
coded around.

VERDICT: BLOCKER
