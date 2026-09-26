# Crew dispatch: visible by default, headless only on explicit opt-in

## Visible Herdr lanes are the default for mutation work: headless needs the captain's word (🟠 Major)

On #234/#263/#265/#289/#321/#322/#333, the captain asked to "complete the work
on the worktrees" and the lanes were launched headless (subagent children)
instead of the visible Herdr shape. The captain caught it: the crew-dispatch
skill's default is visible agents for mutation lanes with a present captain.
Headless is for scouts/read-only probes or explicit opt-in. Rationalizing with
"run-to-completion" or the skill's Windows-preview trap note was wrong: the
trap is a reason to use the verified recipe (workspace create → pane run →
agent prompt), NOT a reason to abandon visibility.

**Always**: captain present + mutation lanes → visible agents (one Herdr
workspace per lane, one live agent session per worktree). Headless children
only for read-only probes/scouts, or with the captain's explicit "run
headless" / "don't use herdr" instruction, which always wins. When the skill
default and your convenience disagree, ask the captain; never silently switch
shapes. Record the chosen shape in the preflight notes.

**Launch lanes and reviewers through `scripts/crew/launch-lane.mjs`.** The
visible path must be one command, never a multi-step friction gap an agent
can skip around. If you are launching without it, you are doing it wrong.
