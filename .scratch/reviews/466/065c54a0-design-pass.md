# #466 design pass — `065c54a0ff63d4ec8244372c6ca022b94e7cc7f4`

Reviewed range: `073af118d4f10dd1e7c4099a36a228b2035b00bb...065c54a0` (4 files:
`scripts/ci/close-linked-issues.sh`, `scripts/ci/test-close-linked-issues.sh`,
`.github/workflows/auto-close-issues.yml`, `.scratch/implementation/466-design.md`).
Skills: `domain-modeling`, `codebase-design`, `improve-codebase-architecture`.

This is the third design pass on the branch; the first (`4ab192b5-design-pass.md`)
found the duplicated-rules drift, the second was folded into the `978cf95b`
review round. Only the delta since `4ab192b5` is re-judged here.

## What the delta did

Adjacency + negation for the closing-reference matcher, hardened over three
review rounds (punctuation gaps, line breaks, markdown separators, bare `no`,
contractions, whole-word negators, `nor`/`neither`), with the verbs and the
number-extraction pipeline each defined once (`CLOSE_VERBS`, `to_numbers`).

## domain-modeling — the rule now has one home and one vocabulary

The domain rule ("a mention or a negated close is not a close; only an adjacent
`Closes/Fixes/Resolves #N` closes") lives in the script header; the workflow
header states only the *why* and defers. The drift the first pass removed has not
returned: the code-review round at `978cf95b` and again at `ac6e55dd` both
checked header-vs-code and found them agreeing.

Vocabulary held: `CLOSE_VERBS`, `CLOSE_SEP`, `NEGATORS`, `body_flat`,
`to_numbers`, `negated` — named after what they are, not how they are matched.

## codebase-design — deletion test

The two functions added (`to_numbers`, and the pre-existing `summarize`/
`emit_summary`) earn their existence: `to_numbers` deletes a pipeline that was
written twice and had to stay in sync (the ST1 finding). No new seam was
invented: the test harness legitimately drives the whole script through the
fake-`curl` seam from #54, which is what makes an end-to-end side-effect
assertion (`$TMP/closed_N`) possible.

Shallow/dead code added and then removed by the review rounds: the
`^[[:space:]]*no[[:space:]]*,` filter (dead once bare `no` required whitespace).
Net: nothing shallow survived.

## improve-codebase-architecture — friction created

**The matcher is now at its accretion limit, and that is the finding.** Four
patches, each adding a token to one alternation, produced a ~4-line regex that
carries 91 assertions and a word-window heuristic. The three independent review
rounds converged on the same root cause from different directions:

- a negator in an *unrelated* clause within three words swallows a real close
  (`Neither reviewer objected. Closes #N`, `Not sure, but Closes #N`);
- a negated reference more than three words from its keyword is not negated
  (`This does not, in any way whatsoever, close #N`).

Widening or narrowing the window trades one class for the other — zero-sum. The
architectural fix is a scope change, not a window tweak: split the body into
sentences and require the negator and the verb to share a sentence. That is a
rewrite of the matcher, so it does **not** belong in this PR; it is recorded in
the design doc's Risks and raised with the parent as the follow-up (with its
cost: `Do not merge this until it Closes #N` becomes a logged, recoverable
drop).

Every residual is in the safe direction (a missed close is visible and logged,
a wrong close is not) and is documented rather than hidden. No finding here
leaves the codebase worse than this diff found it: the rule is single-sourced,
the pipeline is single-sourced, and the test matrix is falsifiable against three
recorded pre-fix heads.

Verdict: one architectural finding, deliberately deferred with an ask; nothing
else. The merge gate is satisfied for this diff.
