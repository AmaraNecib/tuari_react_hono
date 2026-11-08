# Dockan workflow adoption

Reference source: `D:/worktrees/mani-project/agent-v11-batch-coordination`,
commit `ca84fb31e14f10a880317fea3cc947fb6393c452`.
The older `../mani-project` root at `2204f4f` is not the current policy source.
Owner requested the workflow first, with existing PR work paused and no
publication until acceptance.

## Updated skills

The adoption updates `feature-implement`, `guard`, `implement`,
`code-review`, `debate`, `test-audit`, `capture-wisdom` and `crew-dispatch`.
It adds `writing-for-agents`, including readable delegation instructions.
The owner excluded the local scored-review step and its skill; Greptile is
sufficient as the scored review gate. These are adapted phase instructions, not a blind repository
copy. The source's code-review/test-audit and writing references are retained
with Tuari execution boundaries.

## Deliberate differences

- Keep pnpm, existing Tuari workspace names, Node and Tauri/Rust jobs. Do not
  import Bun scripts, Dokan ports, vault contracts or generated skill mirrors.
- Keep all three initial review lenses here under global repository policy.
  Adopt bounded correction review without importing Dockan's routine-only
  exception or automatically enabling OpenCode.
- Keep review reports ignored and local. Existing tracked reports are removed
  from the index only, preserving their physical files. No reports are posted.
- Move full checks to hosted CI while retaining affected local negative proof.
  Do not copy Dockan's red-on-parent implementation or claim it already exists
  here. Ordinary failing-first development remains required.
- CI-final activation remains pending this repository's own current-head run,
  owner acceptance and verified protection. Dockan's accepted protection is not
  evidence for Tuari. Existing hosted-review and owner-only decisions remain.

The source's small `implement` skill still mentioned a full local suite at
completion. That instruction is not carried over: the current workflow's
explicit affected-local policy takes precedence.
