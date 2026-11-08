## Collapsing a "primitive family" means choosing ONE owner and moving, not just deleting the duplicate (💡 Design Principle)

Issue #243: two parallel table/pagination/filter primitive families lived in
`features/app-shell/` (AppShellTable* + TablePaginationControls + usePaginatedRows)
and `features/shared/` (record-page-frame + a cursor-based PaginationControls).
Consumers spanned EVERY feature folder (audit, debts, employees, externals,
inventory, reports), so "app-shell" was a historical misnomer, not an owner.
The correct collapse was NOT deleting one family and re-pointing. It was moving
both primitive files into `features/shared/` and making shared the single owner,
resolving the shared→app-shell dependency inversion (record-page-frame imported
the app-shell primitives). Then delete genuinely dead members: zero-consumer
`AppShellSectionSurface`/`AppShellSectionBody` and the orphan cursor
`PaginationControls` (verified zero production imports via repo-wide grep +
`git log -S` before deleting). Keep component identifiers stable (the `AppShell*`
prefix avoided colliding with shadcn `Table*` names imported in the same files);
rename is a cosmetic follow-up, not the collapse.

**Always**: when an issue says "collapse the X/Y primitive families", (1) map every
import of both families + count consumers per member first (find dead code), (2) pick
one physical owner by where the consumers live, not by folder name, (3) move+tests
BEFORE deleting, (4) confirm zero residual refs (grep) after migration, (5) keep a
public-API rename (prefix that collides with the design-system's own names) out of the
collapse so behavior preservation stays provable.

