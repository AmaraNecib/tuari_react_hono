## Two parallel agents editing the same Rust file: disjoint regions + parent-owned conflict resolution (💡 Design Principle)

#273 (desktop secrets at rest) and #279 (Tauri command gating) both edited
`apps/desktop/src-tauri/src/lib.rs` in parallel worktrees. Both design docs
explicitly declared DISJOINT line regions (#273: secrets section ~1082–1141
+ tests; #279: command handler area) and named the sibling in their design
docs. Each agent pushed its branch without conflicts; the parent resolves
any merge conflict sequentially at integration time, in favor of the owning
issue's design.

**Always**: when worktree designs unavoidably touch the same file, require
BOTH design docs to declare exact disjoint regions AND acknowledge the
sibling issue by number before implementation starts. Two agents editing
disjoint hunks of one file are safe; two agents editing overlapping logic
are not. The design doc is the contract that makes this safe.


