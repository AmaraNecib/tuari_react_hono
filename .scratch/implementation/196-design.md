# Design — issue #196: BootstrapPort for AuthBootstrapService

**Tier:** High-assurance (first-user bootstrap is an auth/security concern —
includes debate step)
**Base:** `develop` @ `80d4926f029c3facee7dd17eb28da174c6e01f3b` (merge-base == HEAD)
**Branch:** `refactor/issue-196-bootstrap-port`

## Scope

`AuthBootstrapService` currently depends on `AppDrizzle` + a raw better-sqlite3
handle directly. Introduce a small `BootstrapPort` seam so the service owns only
business rules (setup-key validation, result shaping) and all Drizzle/SQLite
code moves to a `SqliteBootstrapPort` adapter.

**No behavior changes.** The same queries, the same transaction
(`BEGIN IMMEDIATE` → check → insert → `COMMIT` / `ROLLBACK`), the same
conflict/uniqueness semantics. Only the seam placement changes.

## Public API

### `modules/auth/bootstrap.types.ts` (new)

```ts
export interface BootstrapUserRecord {
  id: string;
  name: string;
  phone: string;
}

export interface CreateFirstUserInput {
  name: string;          // normalized (trimmed) by the service
  phone: string;
  passwordHash: string;  // hashed by the service via BetterAuthInstance
}

export type CreateFirstUserResult =
  | { status: "created"; user: BootstrapUserRecord }
  | { status: "conflict" };

export interface BootstrapPort {
  createFirstUser(input: CreateFirstUserInput): Promise<CreateFirstUserResult>;
  hasConfiguredUsers(): Promise<boolean>;
  isBootstrapOwner(userId: string): Promise<boolean>;
}
```

**Deviation from the issue sketch** (`createFirstUser(input): Promise<UserRecord>`):
the port returns a discriminated result `{ status: "created" } | { status: "conflict" }`
instead of a bare record. The service must distinguish "already configured"
(→ Arabic CONFLICT message, a normal outcome, not an exception) from "created";
a bare `UserRecord` would force conflict to be modeled as an exception and would
lose the existing behavior where an in-transaction conflict COMMITs rather than
throws. The interface stays small (3 methods).

### `modules/auth/adapters/sqlite-bootstrap.port.ts` (new)

`class SqliteBootstrapPort implements BootstrapPort`, constructed with
`(db: AppDrizzle, raw: BetterSqliteDatabase)` — the same two handles the service
receives today. Owns:
- `createFirstUser`: the raw-SQLite transaction (BEGIN IMMEDIATE → conflict
  check → insert `app_bootstrap_state` + `user` + `account` → COMMIT /
  ROLLBACK) and the UNIQUE-constraint → `conflict` mapping (the SQLite error
  string knowledge).
- `hasConfiguredUsers`: user-table (valid phone) + bootstrap-state count.
  The old service had two byte-identical copies (`hasConfiguredUsers` and
  `hasConfiguredUsersTx`); since both ran on the same connection inside the
  transaction, the adapter collapses them into one method.
- `isBootstrapOwner`: bootstrap-state lookup, then earliest-user fallback.

### `modules/auth/bootstrap.service.ts` (refactored)

Constructor becomes `(port: BootstrapPort, authInstance: BetterAuthInstance,
bootstrapSetupKey: string | null)`. Keeps in the service (business logic):
- setup-key validation (`bootstrapFirstUser` → UNAUTHORIZED result)
- password hashing via `authInstance.$context.password.hash`
- result shaping (`BootstrapResult`, `AuthSetupStatus`, Arabic messages,
  `readAppVersion()`)

Service no longer imports `drizzle-orm`, `better-sqlite3`, or schema
definitions (acceptance criterion), and no longer needs `node:crypto`
(userId/timestamps move into the adapter).

### `app/dependencies.ts`

```ts
const authBootstrapService = new AuthBootstrapService(
  new SqliteBootstrapPort(db, sharedDatabase),
  auth,
  env.bootstrapSetupKey,
);
```

## Dependencies

- Service → `BootstrapPort` (types only) + `BetterAuthInstance` (stays a
  service dependency: it is auth, not persistence).
- Adapter → `AppDrizzle`, `BetterSqliteDatabase`, schema tables
  (`user`, `account`, `appBootstrapState`), drizzle-orm operators.
- `AuthBootstrapService` public surface (`getSetupStatus`, `bootstrapFirstUser`,
  `isBootstrapOwner`) is unchanged, so `router.ts`, `rpc-middleware.ts`,
  `create-app.ts` and their tests are untouched.

## Planned tests

### Unit — `bootstrap.service.test.ts` (updated plumbing, same scenarios)

The existing 5 tests mock the Drizzle db / raw handle; after the refactor they
mock the `BootstrapPort` (unavoidable — the mock shape is the seam). Test names
and behavioral assertions stay:

1. `reports whether configured phone users already exist` — port
   `hasConfiguredUsers` → false/true.
2. `creates the first auth user with phone credentials inside a transaction` —
   port `createFirstUser` → `{status:"created", user}`; asserts `hash` called
   with the password and the port received `{name, phone, passwordHash}`.
   Transaction-statement assertions move to the new adapter test (real DB).
3. `refuses bootstrap after the system is already configured` — port →
   `{status:"conflict"}`.
4. `returns a conflict when the bootstrap lock is already taken concurrently` —
   port → `{status:"conflict"}` (adapter normalizes the UNIQUE race; real-race
   behavior now covered by the adapter test against real SQLite).
5. `requires the optional bootstrap setup key when configured` — unchanged.

### Unit — `adapters/sqlite-bootstrap.port.test.ts` (new)

Real `better-sqlite3` `:memory:` DB built from `schemaStatements` + drizzle
(pattern: `recovery-key.service.test.ts`). Covers what the old service-test
mocks could only fake:

- creates first user atomically (user + account + bootstrap state rows,
  `phoneNumberVerified=1`, `providerId="credential"`, hashed password stored);
  `hasConfiguredUsers` flips true afterwards.
- conflict when a user with a valid phone already exists (no state row).
- conflict when the bootstrap state row already exists.
- conflict + full rollback when an insert violates a UNIQUE constraint
  (deterministic simulation of the concurrent race: pre-seed a user with an
  empty-string phone, which the "valid phone" pre-check ignores, then bootstrap
  with the same empty phone → user insert collides → ROLLBACK → no bootstrap
  state row remains).
- `isBootstrapOwner`: true for the created user; false otherwise; earliest-user
  fallback when no bootstrap state row exists.

### E2E (Playwright)

**Not applicable / already covered** — no user-facing flow changes. The
first-user bootstrap flow is exercised end-to-end by the existing
`tests/e2e/foundation-smoke.spec.ts` (`bootstrapOrSignIn` in
`tests/e2e/helpers/session.ts` creates the first account through the real UI).
Same rationale as #202/#204.

## Implementation risks

- **Behavior drift in transaction handling.** Mitigate: adapter preserves the
  exact statement order (BEGIN IMMEDIATE → check → inserts → COMMIT; ROLLBACK
  on error; COMMIT on in-tx conflict) and the exact queries; real-DB adapter
  tests pin the observable behavior.
- **`$client` vs raw handle:** the adapter takes the raw handle explicitly
  (mirrors today's wiring), avoiding reliance on drizzle's `$client` beyond the
  existing type.
- **UNIQUE-race path hard to trigger deterministically.** The empty-phone
  pre-seed trick exercises the same code path (insert raises UNIQUE → ROLLBACK
  → conflict) deterministically on one connection.
- **Test-file change despite "tests pass unchanged".** The unit test mock shape
  must change from Drizzle-db to port; this is the seam the issue itself
  introduces. Test names/assertions/scenarios are preserved and coverage is
  strengthened (real-SQLite adapter tests replace mock transaction assertions).
  Documented in the PR description.
