# #466 design pass — `4ab192b5c2050dc3377c80dc952d40ed449117d4`

Reviewed range: `073af118d4f10dd1e7c4099a36a228b2035b00bb...4ab192b5` (3 files,
+65/−13). Skills: `domain-modeling`, `codebase-design`,
`improve-codebase-architecture`.

## What the diff did

`scripts/ci/close-linked-issues.sh` — the reference extractor now requires the
closing keyword to be adjacent to `#N` (`[[:space:]:]+`, no `[^#]*` gap).
`scripts/ci/test-close-linked-issues.sh` — 9 scenarios / 10 assertions added.
`.github/workflows/auto-close-issues.yml` — comments only.

## domain-modeling — the vocabulary is now stated once

The rule "a mention is not a close; only an adjacent `Closes/Fixes/Resolves #N`
closes" is the domain rule of this module. Before this diff it was written twice
(the workflow header's numbered rules 1–5 and the script header's rules 1–5) and
the two copies had **already drifted**: the workflow said it honors only
`Closes #N`, the script honored `Closes/Fixes/Resolves`.

Fix in this diff: the workflow header now states the *why* (why a workflow
exists at all, why it is conservative, the AGENTS.md convention) and points at
the script header for the enumerated rules. One home for the rule; the drift is
gone. Comment-only, no behaviour change.

## codebase-design — deletion test on what was added

Nothing shallow was added. The extractor stays inline in the script it belongs
to; the test drives the whole script through the existing fake-`curl` seam
(added in #54), so the new scenarios cost one `mk_issue` + one `run_script` each
and no new seam. No duplication introduced — the new tests each pin a distinct
input shape (long prose gap, short prose gap, `filed as`, `Part of`, bare
mention, three affirmative forms, title-only).

## improve-codebase-architecture — friction created

None new. The one friction the diff *exposes* is the negated phrasing
(`This does not close #443` still extracts #443). It is out of the ticket's
stated scope, the adjacency change does not make it worse, and fixing it well
needs per-occurrence context (a negator immediately before the keyword), which
would push this from a one-line contract change into a small parser. Recorded in
`.scratch/implementation/466-design.md` (Risks) and raised with the parent as a
possible follow-up rather than folded in here.

Verdict: no other findings. One cleanup done (rule single-sourced), nothing
left worse than the diff found it.
