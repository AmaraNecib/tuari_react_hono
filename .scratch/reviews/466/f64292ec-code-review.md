# Code review — #466, range 073af118 → f64292ec (two axes)

Reviewer: two-axis code reviewer (Standards + Spec), fresh context.
Skill: `.agents/skills/code-review/SKILL.md`.
Range: `git diff 073af118..f64292ec`, `git log 073af118..f64292ec --oneline`
= `f64292ec fix(ci): a negated close is not a close (#466)`, `03fa67b5 docs(review)`,
`4ab192b5 fix(ci): close an issue only on an adjacent closing keyword (#466)`.

Files in range: `.github/workflows/auto-close-issues.yml`, `scripts/ci/close-linked-issues.sh`,
`scripts/ci/test-close-linked-issues.sh`, `.scratch/implementation/466-design.md`,
`.scratch/reviews/466/4ab192b5-design-pass.md`.

Verdict: **NO BLOCKER**

---

## Evidence run (all commands actually executed)

| command | result |
| --- | --- |
| `timeout 900 bash scripts/ci/test-close-linked-issues.sh` | exit 0, `PASS=60 FAIL=0` (wall 3m20s) |
| `bash -n scripts/ci/close-linked-issues.sh` / `test-close-linked-issues.sh` | both syntax OK |
| `printf … \| grep -oiE '<file regex>'` probes | see probe table below |
| `od -c` on worktree + `git show f64292ec:…` | `\n` only — blob is LF, no CRLF |

Note on earlier runs: `timeout 120` and `timeout 180` both returned 124 (killed mid-suite, after
#109 / after #132). The suite is **not** hung — it is process-spawn bound on Windows Git Bash
(~4.5 s per check, each check forks bash + fake-curl + jq). Reviewers on Windows must allow
≥ 5 min. ([Note 3](#standards-axis))

---

## Spec axis — does it match `gh issue view 466`?

### Probe results against the exact regex in the file

Affirmative `\b(close[sd]?|closing|fix(e[sd])?|fixing|resolve[sd]?|resolving)[[:space:]:]+#[0-9]+`:

| body | extracted |
| --- | --- |
| `Closes #9` / `closes #9` / `CLOSES #9` / `Fix #9` / `FIXED #9` | `#9` ✅ case-insensitive |
| `Closes:#9` / `Resolves:#9` / `Closes   #9` | `#9` ✅ optional `:`, ≥1 space |
| `the fix for #9` / `filed as #9` / `Part of #9` / `bare #9` | nothing ✅ |
| `unresolved #9` / `prefix #9` / `affix #9` | nothing ✅ `\b` still blocks mid-word |
| `Closes\n#9` (keyword at EOL, ref on next line) | nothing — line-based grep, conservative |

Negation regex (line 176 probes):

| body | negated |
| --- | --- |
| `This does not close #9` / `never fixes #9` / `not going to close #9` / `no longer resolves #9` / `does not  resolve  #9` | matches ✅ |
| `Do not merge until it Closes #9` | no match ✅ (stays a real close) |

### Criterion → pinning test map

| #466 acceptance criterion | pinned by (file `scripts/ci/test-close-linked-issues.sh`) | status |
| --- | --- | --- |
| keyword immediately before the reference | `#122` L193, `#1220` L198 (both are the old `[^#]*`-gap regressions) | tested ✅ |
| keyword must be `Closes`/`Fixes`/`Resolves` (the 3 verbs) | `#124` L208, `#125` L213, `#126` L218 | tested ✅ |
| optionally followed by `:` | `#126` `"Resolves: #126"` L218-222 | tested ✅ |
| case-insensitive | — | **no test** ([Finding S1](#spec-findings)) |
| bare `#N` mention never closes | `#123` L203 | tested ✅ |
| `filed as #N` never closes | `#120` L182 | tested ✅ |
| `Part of #N` never closes | `#121` L188 | tested ✅ |
| title match must not close | `#127` L225-231 (fixture carries `title:'Closes #127'`, body has none) | tested ✅ |
| `does not close #N` (parent decision) | `#128` L235 (+ `assert_has "Ignoring #128"` L239) | tested ✅ |
| `does not resolve #N` | `#129` L242 | tested ✅ |
| `never fixes #N` | `#130` L247 | tested ✅ |
| negation must not suppress a different affirmative close | `#131`/`#132` L252-256, `#133`/`#134` L259-263 | tested ✅ |
| a negator in another clause is not a negation | `#135` L266-268 (`"Do not merge this until it Closes #135."`) | tested ✅ |
| merged PR + open issue required (issue's "consider whether") | pre-existing: `#102` closed-skip L112-118, `#115`/`#116` unmerged L330-350 | tested ✅ |

No scope creep: the diff touches only extraction/negation, headers, and tests. Skip logic
(open sub-issues, remaining-work, self-reference) is untouched.

### Spec findings

- **S1 (minor, test gap)** — `scripts/ci/test-close-linked-issues.sh:178-268`: the issue explicitly
  says "case-insensitive", and no test exercises an upper- or lower-case keyword (`#124` uses
  `Closes`, `#125` `Fixes`, `#126` `Resolves` — all canonical caps). The behaviour is correct
  (probe: `CLOSES #9`, `closes #9`, `FIXED #9` all match), so this is coverage only. Fix: one test
  `run_script "CLOSES #136"` → `assert_closed`.
- **S2 (note)** — colon-without-space (`Closes:#9`) works by probe but has no test; the header
  says "optional ':'" without stating whether the space is optional. Same for a body that puts the
  reference on the next line: `Closes` at EOL + `#9` on the following line extracts nothing
  (grep is line-based). Conservative and defensible, but undocumented.
- **S3 (note, judgement)** — the negation window `([[:space:]]+[[:alnum:]_-]+){0,2}`
  (`close-linked-issues.sh:176`) treats the idiom `not only closes #N` as a negation, so a real
  close phrased that way is dropped. Consistent with the script's own "deliberately conservative"
  stance (`:170-174`); flagging as a known trade-off, not a defect.
- **S4 (note, doc drift risk)** — the adjacency rule is a behaviour break for authors: bodies that
  said `Closes issue #443` / `Closes the #443 work` no longer close anything. `AGENTS.md`
  ("Issue-closing convention") still shows only the bare `Closes #N` / `Fixes #N` forms and never
  states the adjacency or negation rules. AGENTS.md is outside this diff; adding one line there
  ("the keyword must be adjacent, and a negated close does not close") would prevent the next
  drift. Not blocking — the documented form already matches the code.

---

## Standards axis

### Correct (verified)

- **The two headers no longer contradict.** `auto-close-issues.yml:7-10` now defers ("Read that
  header for the safety rules; this file deliberately does not restate them (they drifted apart
  once already)"), and the workflow retains only the convention note (`:19-21`) plus the
  "deliberately CONSERVATIVE" framing (`:15`). `close-linked-issues.sh:28-31` rule 1 states the
  adjacency rule **and** the negation rule, and both match the code at `:158` (adjacency) and
  `:163-186` (negation). Single-sourced, no contradiction. This is a genuine improvement.
- **Minimum toolchain preserved.** New code adds no dependency: only `grep`/`tr`/`sort`/`printf`.
  No `gh`, no `perl`, no python. `curl + jq` contract (`:19-25`) is untouched.
- **Locale-safe.** `[[:space:]]` / `[[:alnum:]]` / `[[:punct:]]` probes return identical results
  under `LC_ALL=C` and `LC_ALL=en_US.UTF-8`.
- **No CRLF hazard.** `git ls-files --eol` misleadingly reports `w/crlf` for the scripts, but
  `od -c` on both the worktree file and the blob `f64292ec:scripts/ci/close-linked-issues.sh` shows
  `\n` only, `bash -n` is clean, and the suite passes 60/60 — the line continuations before the
  `grep` pipelines are safe. `.gitattributes` forces `eol=lf` for `*.yml`/`.github/**`.
- **Negation echo is honest.** Any negated match necessarily also matches the affirmative regex
  (the keyword+ref substring is shared), so the `Ignoring #N` line at `:184` never fires for a
  number that was not extracted.
- **Commit hygiene.** The `.scratch/implementation/466-design.md` and
  `.scratch/reviews/466/4ab192b5-design-pass.md` files in the range are exactly what AGENTS.md
  ("What belongs in a commit", "Scratch lifecycle") sanctions for the current issue. Nothing staged
  by this review; no `git add -A`.
- **Test style matches the file.** Fixture/`reset_state`/`assert_*` helpers reused as-is; the
  title case writes PR fixture `42` with `jq` the same way `run_script` does.

### Standards findings

- **ST1 (minor, Duplicated Code)** — `scripts/ci/close-linked-issues.sh:158` and `:176` both
  hard-code the full keyword alternation `close[sd]?|closing|fix(e[sd])?|fixing|resolve[sd]?|resolving`,
  and `:159-160` / `:178-179` duplicate the extractor chain
  (`grep -oE '#[0-9]+' | tr -d '#' | sort -un`). If the close vocabulary ever changes, two regexes
  and two extractor chains must change together — the exact drift class AGENTS.md's design-pass
  bullet calls out ("did it introduce duplication that will drift?"). Fix (small): hoist
  `KW='close[sd]?|closing|fix(e[sd])?|fixing|resolve[sd]?|resolving'` and a small
  `extract_numbers()` helper, interpolate into both `grep -oiE` calls. Judgement call, not a hard
  violation; the two comments do explain the split.
- **ST2 (note, pre-existing, in a touched file)** — `.github/workflows/auto-close-issues.yml`:
  the `# MUST stay self-hosted (issue #54)` comment sits directly above `runs-on: ubuntu-latest`.
  The comment and the value disagree. Not introduced by this diff (only the header block changed),
  so out of scope for #466 — flagging because #466's portability question depends on which runner
  is real. `\b` in the unchanged anchors is a GNU-grep extension; it is correct on `ubuntu-latest`
  and on Git Bash, and would need `[[:<:]]`-style handling only on BSD grep (macOS).
- **ST3 (note, test runtime)** — the suite spawns bash + fake-curl + jq per check: 60 checks in
  3m20s here. Any caller using a short timeout will see truncated output and a false failure; the
  header comment (`test-close-linked-issues.sh:1-8`) says "Run from anywhere" but not "allow ~5 min
  on Windows".

Nothing found on: shellcheck-visible quoting issues, `set -euo pipefail` interactions (the new
pipelines end in `|| true`, and `grep -vx "$neg"` with an empty `$numbers` is filtered by `:186`),
unknown/mysterious naming, feature envy, speculative generality, or menu of switches.

---

## Blocker check

- No criterion from #466 is unimplemented. All are implemented and, except case-insensitivity,
  pinned by a named test.
- No wrong-close path opened: adjacent-keyword gating plus number-level negation subtraction is
  strictly more conservative than the pre-diff matcher.
- No regression in the untouched skip paths (suite covers them; 60/60).

**Verdict: NO BLOCKER**

Smallest follow-ups, in order: (1) add the case-insensitivity test (S1); (2) hoist the duplicated
keyword alternation/extractor (ST1); (3) one line in AGENTS.md stating the adjacency + negation
rules (S4).

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Two-axis report written to .scratch/reviews/466/f64292ec-code-review.md with severity-tagged findings citing file:line; residual risks listed there and in residualRisks."
    }
  ],
  "changedFiles": [
    ".scratch/reviews/466/f64292ec-code-review.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "timeout 900 bash scripts/ci/test-close-linked-issues.sh",
      "result": "passed",
      "summary": "exit 0, PASS=60 FAIL=0, 3m20s wall (earlier timeout 120/180 returned 124 mid-suite - slow, not hung)"
    },
    {
      "command": "bash -n scripts/ci/close-linked-issues.sh && bash -n scripts/ci/test-close-linked-issues.sh",
      "result": "passed",
      "summary": "both scripts syntax-clean under CRLF-suspect worktree, confirming no line-continuation break"
    },
    {
      "command": "printf '%s\\n' '<case>' | grep -oiE '<exact regex from lines 158/176>'",
      "result": "passed",
      "summary": "probes: CLOSES/closes/Closes:#9/FIXED #9 match; bare #N, filed as #N, Part of #N, the fix for #N, unresolved #N match nothing; negation matches the 5 negated forms and not 'Do not merge until it Closes #9'; identical under LC_ALL=C and en_US.UTF-8"
    },
    {
      "command": "git diff 073af118..f64292ec / git log --oneline / git status --short",
      "result": "passed",
      "summary": "3 commits, 5 files; nothing staged, no file touched outside .scratch/reviews/466/"
    }
  ],
  "validationOutput": [
    "SPEC: all #466 criteria implemented; each pinned by a test except case-insensitivity -> test-close-linked-issues.sh:178-268 (120/121/122/1220/123/124/125/126/127/128/129/130/131-132/133-134/135)",
    "STANDARDS: workflow header defers to script header (auto-close-issues.yml:7-10) and script rule 1 (close-linked-issues.sh:28-31) matches the code at :158 and :163-186 - no contradiction",
    "Portability: bash + curl + jq only, no new dependency; locale-stable; blob is LF (od on git show f64292ec:...)"
  ],
  "residualRisks": [
    "S1 minor test gap: no test pins case-insensitivity (#466 says case-insensitive); behaviour probed correct, coverage missing",
    "S2 note: 'Closes:#9' works but untested; keyword-at-EOL + ref-on-next-line extracts nothing (line-based grep), undocumented",
    "S3 note: 'not only closes #N' is treated as negated and will not close - conservative trade-off, documented in the script",
    "S4 note: AGENTS.md issue-closing convention not updated with the adjacency/negation rules; bodies like 'Closes issue #443' no longer close",
    "ST1 minor duplication: keyword alternation + extractor chain duplicated at close-linked-issues.sh:158/159-160 and :176/178-179 - drift risk",
    "ST2 pre-existing, out of scope: '# MUST stay self-hosted' comment sits above runs-on: ubuntu-latest in auto-close-issues.yml",
    "ST3: test suite takes ~3m20s on Windows Git Bash; short timeouts produce truncated false failures"
  ],
  "noStagedFiles": true,
  "diffSummary": "Review-only: added one markdown report under .scratch/reviews/466/; no source file modified, nothing staged, committed, pushed or merged.",
  "reviewFindings": [
    "no blockers",
    "minor: scripts/ci/test-close-linked-issues.sh:178-268 - no test pins case-insensitive keywords (spec criterion)",
    "minor: scripts/ci/close-linked-issues.sh:158,:176 (plus :159-160,:178-179) - duplicated keyword alternation and extractor chain, drift risk",
    "note: .github/workflows/auto-close-issues.yml - '# MUST stay self-hosted' comment contradicts runs-on: ubuntu-latest (pre-existing, not introduced by this diff)",
    "note: negation window at close-linked-issues.sh:176 also swallows the idiom 'not only closes #N' (conservative, documented)"
  ],
  "manualNotes": "Suite is slow on Windows (~4.5s/check), so timeout 120 and timeout 180 both returned 124 mid-suite; the 900s run is the authoritative PASS=60 FAIL=0. Review-only task, so no progress.md was written; the report itself is the artifact. Report path is git-root relative .scratch/reviews/466/f64292ec-code-review.md (distinct from the pre-existing f64292ec-debate.md and f64292ec-test-audit.md, nothing overwritten)."
}
```
