## "Align storage adapters" includes the in-memory double, not just the sqlite file (💡 Design Principle)

Issue #209 said "align the remaining rbac storage adapters with `adapters/`" and
named only `sqlite-role.repository.ts`. The debate (critic, severity 5) forced the
full read: the module's **in-memory test double** (`InMemoryRoleRepository`) was
still embedded in `role.module.ts` while every other module keeps doubles in
`adapters/` (`workforce/adapters/in-memory-role.repository.ts`, `company/adapters/inmemory-*`).
The finished change extracted BOTH implementations to `adapters/`, keeping only the
deep module + its `RoleRepository` seam at the root, the same shape as
`company.repository.ts` at root with sqlite/inmemory implementations in `adapters/`.

**Always**: when an issue says "align adapters", enumerate every implementation of
the module's ports (sqlite + in-memory + any others), not just the file the issue
names. The interface/seam stays with the deep module at the root; implementations
live in `adapters/`.

