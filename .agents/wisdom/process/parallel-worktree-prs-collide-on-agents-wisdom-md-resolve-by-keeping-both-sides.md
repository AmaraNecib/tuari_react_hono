## Parallel worktree PRs collide on `.agents/wisdom/*.md`: resolve by keeping BOTH sides (🟠 Major)

On the 2026-08-10 batch (9 parallel worktrees merged sequentially), the
second and third merges each hit a CONTENT conflict in a wisdom file,
`testing.md` (between #278's toMatchObject-array lesson and #320's
no-op-rekey lesson) then `process.md` (between #278's sibling-worktree
port-squatter lesson and #284's CSS-selector lesson). Every agent in a batch
appends lessons to the same files, so the Nth squash merge into develop is
expected to conflict on `.agents/wisdom/*`.

**Always**: when a wisdom file conflicts on merge, treat the two sides as
independent durable lessons and keep BOTH, splice them side by side, never
delete either section. Expect this on any batch with ≥2 worktrees and resolve
it like a normal code conflict (fix → push → wait for CI → merge). Also: the
pre-push hook runs the full web suite, which can flake on `navigateMock`
timing under load right after a multi-PR merge. Re-run before blaming the diff.

