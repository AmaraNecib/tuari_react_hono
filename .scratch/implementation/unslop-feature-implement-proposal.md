# Unslop proposal: `.agents/skills/feature-implement/SKILL.md`

Proposal only. No edits made to the skill file. Grounded in the numbered rules in
`.agents/skills/unslop/SKILL.md`.

## Summary

`feature-implement/SKILL.md` is 274 lines, ~1,550 words. It is structurally sound
and mostly concrete, but it pads itself in three places: principle statements that
restate the phase headings, scene-setting sentences that argue a point the heading
already makes, and back-to-back rule lists that say the same thing twice. Cutting
those and fixing the headlines gets the file under ~1,300 words with zero loss of
instructional content. Estimated reduction: 300–350 words (~20–22%).

## Pattern-by-pattern findings

### Rulet 13, em dashes (6 occurrences)

The headings use " — " as an ellipsis-like joiner: "### 4. Guard Phase 1:
pre-review", "### 6. Debate: High-assurance only", "### 7. Test audit: Standard
and High-assurance", "### 9. Guard Phase 2: local pre-report gate", "### 10.
Greptile review: CLI, not PR comments", "### 11. Guard Phase 3: local
pre-report". Same fix as the wisdom files: replace the dash with a colon before an
example ("Guard Phase 1: pre-review") or a period when the tail is a full clause.
Colons are rule 14-legal before examples.

### Rule 16, inline bold labels (2 header-like bold lead-ins)

"**Start here for every code, test, workflow, configuration, or skill change.**" is
a bold sentence that restates the file's purpose before the prose that follows. It
can go; the next sentence ("Read `docs/engineering-workflow.md` ... first") is the
actual instruction. "**must never merge**" and "**ready for later integration**,
not merged" are emphasis on real prohibitions (rule 15), keep.

### Rule 27, say what it does (padded principle sentences)

The essay-style sentences that precede the commands carry no instruction:

- "Do not skip or reorder the applicable gates." before the numbered lifecycle.
  The numbered phases and "Run the `guard` skill before any review" already say
  this. Cut.

- The paragraph after the `git rev-parse` block ("Use the local `develop` ref as
  the base when it exists ... Never silently use a stale remote ref as if it were
  live.") is the durable rule, keep. But "At the start of a run:" and the code
  fence around it can be folded into one line: "At the start of a run, pin the
  base:".

- Section 10's intro, "Greptile review is now performed locally from the checkout,
  not by scraping PR comments," restates the phase heading "Greptile review: CLI,
  not PR comments". One of the two goes.

- The wiring sentence in section 10, "In a visible crew lane, delegate this step
  to the lane when practical..." duplicates the crew-dispatch skill and AGENTS.md
  verbatim. It adds nothing the lane handoff protocol does not already say. Cut (or
  replace with a one-line pointer).

### Rule 3, -ing filler and rule 23, filler phrases

"fixing it" / "regenerate evidence" / "rerun" appear in tight sequence in
sections 8 and 9 ("Fix actionable findings, rerun the local checks, and regenerate
evidence after any reviewable-file change"; "If the code changes after review,
evidence is stale and must be regenerated"). These are two statements of one rule.
Merge into one sentence.

### Rule 24, hedge stacks

"may be used only as an explicitly recorded fallback" and "must not attempt to
fetch" are firm; but "The parent aggregates that report and reruns only when the
lane is blocked, the result is stale, or an independent review is required" lists
three conditions where the last ("independent review is required") is implied by
"reruns only when". Trim to the two concrete cases.

### Rule 11 and duplication, the largest single win

The lifecycle is stated three times: as the numbered phases, in the "Review tiers"
table, and in the "Local-only completion rules" bullets. The table and the numbered
phases already overlap; the completion bullets re-state gates 1–11. Convert the
completion bullets to a short checklist of the few things that differ there ("the
latest Greptile result is clean and corresponds to the final code", "working tree
state is reported accurately") and drop the rest. Same for the last three lines of
section 12 ("Report: ..."), which re-list the fields already listed in the section
body.

## Suggested concrete edits (token-saving only)

1. Headings: replace the 6 em dashes with colons (rule 13).
2. Cut the bold purpose sentence at the top (rule 16).
3. Cut "Do not skip or reorder the applicable gates.", "Do not proceed while a
   required local check fails." is redundant with Guard Phase 1's run-fail-stop
   wording. Keep one.
4. Merge section 8's "Fix actionable findings..." and section 9's "If the code
   changes after review..." into one regenerate-evidence rule.
5. Delete the section 10 delegation paragraph, keep the CLI commands and the
   "clean is 5/5 with zero findings" verdict rule.
6. Collapse the "Local-only completion rules" into the review tiers note; drop the
   duplicated gate list.
7. Replace "It must not:" bullet list in section 10 with the single sentence from
   AGENTS.md: "no push, no PR, no comments, no `git add -A`."

Net result: same coverage, fewer words, no em dashes, no padded principle
sentences.

## Files touched

- Proposal only: `.scratch/implementation/unslop-feature-implement-proposal.md`
  (this file).
- Applied: `.agents/skills/feature-implement/SKILL.md` (implemented 2026-08-19 per
  the proposal; preview copy at `C:/Users/sensei57/AppData/Local/Temp/unslop-feature-implement-SUGGESTED.md`).