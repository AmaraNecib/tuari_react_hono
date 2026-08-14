# 307 — Web: WorkspaceDomain mapped type collapses to never

## Problem

In `apps/web/src/features/app-shell/workspace-keys.ts`, `WorkspaceDomain` is
derived from the query-key factory by arity:

```ts
type WorkspaceDomain = {
  [K in keyof typeof workspaceQueryKeys]: Parameters<(typeof workspaceQueryKeys)[K]>["length"] extends 1 ? K : never
}[keyof typeof workspaceQueryKeys]
```

Every flat factory is declared with a **default parameter**
(`(userId: UserId = ANONYMOUS) => ...`). A default parameter makes the tuple
element optional, so `Parameters<F>["length"]` is `0 | 1`. The conditional
`0 | 1 extends 1` is always **false** (the check is on a concrete computed
type, so no union distribution helps) → every key maps to `never` →
`WorkspaceDomain` resolves to `never`.

Consequence: `invalidateWorkspaceDomains`'s `domains` parameter becomes
`Partial<Record<never, true>>` = `{}`. Object literals are accepted against
`{}` without excess-property checking here (verified: the existing test suite
passes `{ warehouses: true, projects: true }` today), so **any key — including
typos and parameterized detail keys — compiles**. The "no typo protection"
guarantee the module documents is silently gone.

The `SNAPSHOT_BACKED_DOMAINS` set papers over the bug with `ReadonlySet<string>`
(a workaround NOTE admits it).

## Fix

Replace the arity predicate so optionality no longer matters. Two candidates
from the issue:

| Candidate | Flat check | Parity with runtime test |
|---|---|---|
| `Required<Parameters<F>>["length"] extends 1` | strips optionality, length `0 \| 1` → `1` | Breaks for a hypothetical zero-param factory (`[]` → length `0`), while the runtime test uses `factory.length <= 1` |
| `Parameters<F>["length"] extends 0 \| 1` | `0 \| 1 extends 0 \| 1` → true; `2 extends 0 \| 1` → false | **Exact** parity with `factory.length <= 1`, including the zero-param edge |

Chosen: **`Parameters<F>["length"] extends 0 | 1`**.

Rationale:
- It is the minimal change (no `Required` wrapper) and directly mirrors the
  runtime predicate `factory.length <= 1` used by the existing flat-factory
  list test — keeping the type and the runtime list in lock-step (single
  source of truth, per the issue).
- It handles every current factory correctly:
  - flat `(userId: UserId = ANONYMOUS)` → `0 | 1 extends 0 | 1` → true
  - `(userId: UserId, invoiceId: string)` → `2 extends 0 | 1` → false
  - `(userId: UserId, input: {...})` → `2 extends 0 | 1` → false
- `workspaceSnapshot` is a flat factory and joins the vocabulary — matching
  the runtime flat list, which already includes it. Its invalidation is
  harmless (it is the snapshot key itself; `SNAPSHOT_BACKED_DOMAINS` does not
  contain it, so no double-invalidation).

### Cleanup of the workaround

`SNAPSHOT_BACKED_DOMAINS` was `ReadonlySet<string>` *because* the type
collapsed. With the fix it becomes `ReadonlySet<WorkspaceDomain>` — every
member (`roles`, `employees`, `projects`, ...) is a flat domain key. The
stale NOTE comment explaining the collapse is removed.

## Tests (TDD — type-level probe first)

Add to `apps/web/src/features/app-shell/workspace-keys.test.ts`:

1. **Positive probe**: `const d: WorkspaceDomain = "roles"` compiles.
2. **Exact-union probe**: `expectTypeOf<WorkspaceDomain>().toEqualTypeOf<...>`
   pinned to the 20 flat keys (same list the runtime flat-factory test pins).
   Because `tsc --noEmit` typechecks test files (`tsconfig.json` includes
   `src`), this is enforced by `pnpm typecheck`.
3. **Negative probe**: `// @ts-expect-error` above a call passing a
   parameterized key (`inventoryAsset`) to `invalidateWorkspaceDomains`. If
   the type regresses to `never`/`{}` (any key accepted), the directive
   becomes *unused* and typecheck fails — the compile-time guard for "rejects
   a non-flat key".

No runtime behavior changes; the existing runtime tests (including the
flat-factory list test and the snapshot-backed membership behavior) are
untouched and stay green.

## Call-site audit

`invalidateWorkspaceDomains` callers live in `workspace-mutations.ts` (the
only production consumer). Grep shows every call passes a subset of
`employees / projects / warehouses / debtsSummary / debtsDetail / systemLog /
roles / externalCounterparties` — all flat keys. Expectation: zero call sites
pass a non-flat key, so no call-site edits are needed. Will verify each line
during implementation.

## Risks / scope notes

- Standard tier; no Playwright E2E needed (pure type-level fix, no user-facing
  flow).
- The `WorkspaceDomain` union now includes `workspaceSnapshot`. This is
  consistent with the runtime flat list; no caller passes it today, and doing
  so would only invalidate the snapshot key itself.
- No API/contracts changes; `packages/` untouched.

## Verification

- `pnpm typecheck` (red before fix via the probes, green after)
- `pnpm test:web` — full suite green
- `pnpm lint` — 0 errors
- Guard Phase 1 (pre-commit): contracts build, typecheck, lint, test:api, test:web
