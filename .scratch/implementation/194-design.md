# Design — issue #194: introduce UpdateHistoryPort for UpdateHistoryService

**Tier:** Standard (code/architecture change; no authz, crypto, or financial logic)
**Base:** `develop` @ `80d4926f029c3facee7dd17eb28da174c6e01f3b` (merge-base == HEAD)
**Branch:** `refactor/issue-194-update-history-port`

## Scope

`UpdateHistoryService` currently owns the `BetterSqliteDatabase` handle and
raw SQL. Per the parent issue #191 (Persistence Boundary Refactoring), extract
a small port so the service depends on an interface, and move the
SQLite-specific SQL into a dedicated adapter.

## Public API

### New: `apps/api/src/modules/update/update-history.types.ts`

```typescript
import type { RecordUpdateInput, UpdateRecord } from "@tuari/contracts";

/**
 * Persistence boundary for update-history records.
 * Deep, minimal port: hides all storage detail (raw SQL, row shape,
 * 0/1 boolean normalization, ordering) behind three domain-level methods.
 */
export interface UpdateHistoryPort {
  recordUpdate(input: RecordUpdateInput): UpdateRecord;
  getHistory(limit?: number): UpdateRecord[];
  getLatestUpdate(): UpdateRecord | null;
}
```

All shapes are the existing contract types (`@tuari/contracts`); nothing
SQLite-specific leaks across the boundary.

### New: `apps/api/src/modules/update/adapters/sqlite-update-history.port.ts`

`class SqliteUpdateHistoryPort implements UpdateHistoryPort` — constructor
takes `BetterSqliteDatabase`. The `UpdateHistoryRow` type and the three raw
SQL statements (INSERT, SELECT … LIMIT ?, SELECT … LIMIT 1) move here
**verbatim** from the service; row→domain normalization (`success === 1`)
stays inside the adapter.

### Changed: `apps/api/src/modules/update/update-history.service.ts`

Constructor becomes `constructor(private readonly port: UpdateHistoryPort)`.
The three methods delegate to the port. The file no longer imports
`BetterSqliteDatabase` and no longer references the `update_history` table —
all persistence detail moves behind the port.

### Changed: `apps/api/src/app/dependencies.ts`

Composition root wires the adapter:

```typescript
updateHistoryService: new UpdateHistoryService(new SqliteUpdateHistoryPort(sharedDatabase)),
```

### Changed: `apps/api/src/modules/update/update-history.service.test.ts`

The existing test constructs `new UpdateHistoryService(rawDb)`. Once the
constructor takes `UpdateHistoryPort`, that call cannot typecheck (a
`Database.Database` is not structurally an `UpdateHistoryPort`), so the
construction line becomes:

```typescript
const service = new UpdateHistoryService(new SqliteUpdateHistoryPort(rawDb));
```

This is the **only** test change — every test case and assertion stays
byte-identical. The service tests still exercise the full
service → port → sqlite path, so adapter behavior is covered by the existing
suite. (The issue's "tests pass unchanged" is read as "no behavior/assertion
changes"; the constructor wiring must follow the new contract.)

## Dependencies

- None added. Uses `BetterSqliteDatabase` (already shared via
  `apps/api/src/types/sqlite.ts`) in the adapter only.

## Tests

- **Unit:** existing `update-history.service.test.ts` rewired (adapter +
  port injection); all cases/assertions unchanged. No new logic → no new
  tests required by the issue ("no behavior changes").
- **E2E:** none — the update-history RPC surface (`updateHistoryList`,
  `recordUpdate`) is unchanged; no user-facing flow changes.

## Implementation risks

- **Constructor contract break** in the service test — addressed above
  (single-line rewiring).
- **Path drift** — adapter lives two levels deeper than the service; relative
  imports verified against the existing `modules/*/adapters/` convention.
- **Behavior drift** — mitigated by moving SQL verbatim and relying on the
  unchanged test suite as the regression net.

## Deviations from architecture

None. Follows the established ports & adapters pattern (cf. #177/#200):
small interface in the module's types file, SQLite implementation in
`modules/*/adapters/`, wiring at the composition root.
