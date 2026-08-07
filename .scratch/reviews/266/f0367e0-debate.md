# #266 Debate evidence (inline, child-agent execution)

Head SHA: `f0367e0` · Base SHA: `9aac620` · Tier: High-assurance
Executed inline by the implementing agent (child agents cannot spawn the
`debate` subagent in this environment). Lifecycle note recorded for guard.

## Decision under debate

Issue #266 asks: *"dedup + filter in the adapters, or tighten the guard?"*
Three data-integrity gaps in `apps/api/src/modules/rbac/`.

## Positions

**A — Dedup + filter in the adapters (chosen)**
- `groupRoles` (repository) dedups `(role, permission)` rows per role.
- `SqlitePermissionResolver` filters rows through `isPermission`.
- Rationale: the two read adapters must agree on one canonical gate. The
  repository already guarded; the resolver leaked. `role_permission` has a
  surrogate `id` PK and no `(role_id, permission)` uniqueness constraint —
  duplicates are physically possible at rest, so read-time dedup is real
  defense-in-depth, not paranoia.

**B — Tighten the guard only**
- `isPermission` multi-colon tightening was already shipped at HEAD
  (`7d34ccb`, #290): exactly-one-colon check + pinned tests. Nothing left
  to tighten for point 3.
- Rejected as the *sole* answer: it does nothing for duplicate rows (point 1)
  and would leave the resolver's leak open (point 2).

## Edge cases considered

1. **First-seen ordering** — dedup uses a per-role `Set`; only first sighting
   pushes. Query-level `ORDER BY role_permission.permission` makes the input
   deterministic, so output order is stable. Existing order-pinning test
   (role-1 `read` before `create`) stays green.
2. **Duplicate rows across distinct roles** — dedup is scoped per role id;
   two roles holding the same permission both keep it. Covered by test with
   role-1 + role-2 sharing `employees:read`.
3. **Resolver dedup + filter interaction** — filter runs before/while
   inserting into the Set; canonical duplicates still collapse. Pinned by the
   new combined test.
4. **Bootstrap owners** — unaffected: short-circuit returns `ALL_PERMISSIONS`
   before the row loop. Existing test stays green.
5. **#210 pass-through pin flip** — the resolver test that pinned unknown
   string pass-through is deliberately inverted. The pin's own comment
   anticipated the flip ("if the resolver gains an isPermission() filter,
   this expectation flips to []"). No downstream consumer relies on unknown
   strings: `SessionService` forwards the resolved list verbatim and the
   middleware only matches known permissions.
6. **Empty/zero-row results** — resolver returns `[]`; repository returns
   empty array. Existing tests unchanged and green.

## Risks accepted

- Contract change on the resolver's dirty-row behavior (documented in PR).
  Not exploitable today (seeds/migrations write canonical colon-form) and
  strictly a read-time hardening for the stated dirty-data cases.
- No schema/migration change — dedup/filter are read-path only, avoiding any
  data migration risk for rows that a future normalisation pass will rewrite.

## Verdict

Position A. No behavior change for canonical data; both dirty-data gaps
closed consistently with the repository's existing guard.
