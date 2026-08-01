# Design — issue #202: data-layer edge cases (follow-up from #200 audit)

**Tier:** Standard (config + data-layer code; no authz/security/RBAC)
**Base:** `develop` @ `33d8d2bf97fc57c3f28ce9cd095200aec6fc6eff` (merge-base == HEAD)
**Branch:** `refactor/issue-202-data-layer-edge-cases`

## Scope

Five findings deferred from the #200 test audit / code review. Items 1–4 are
implemented; **item 5 (ESLint for apps/api) is deferred** to a follow-up issue —
see "Deferred" below.

---

## Item 1 — Empty-string `BETTER_AUTH_URL` crashes instead of defaulting

**Where:** `apps/api/src/config/index.ts` (`createAppConfig`), and the legacy
`apps/api/src/infrastructure/config/env.ts` (`createEnv`) which shares the same bug.

**Fix:** use `||` instead of `??` so an empty string is treated as unset, matching
every other field (`.trim() ||`):

```ts
const betterAuthUrl = effectiveSource.BETTER_AUTH_URL?.trim() || `http://${host}:${port}`;
```

(The Zod schema still validates/normalizes the result.)

## Item 2 — Loopback /8 hosts rejected as non-local + duplicated URL checks

**Where:** `isLocalHostname` in both `config/index.ts` and
`infrastructure/config/env.ts`; `create-app.ts` imports `normalizeOrigin` from
`env.ts`.

**Fix (two parts):**

1. **Dedupe** the URL helpers into one module:
   `apps/api/src/infrastructure/config/url.ts` exporting `normalizeOrigin`,
   `normalizeOriginList`, `isLocalHostname`, `normalizeBaseUrl`.
   - `config/index.ts` imports from `url.ts` (consistent with its existing
     `../infrastructure/config/database-env` import).
   - `env.ts` imports from `url.ts` and re-exports `normalizeOrigin` (keeps
     `create-app.ts` working without an import change; the module keeps its
     `createEnv` for `runtime-env`).
2. **Loopback /8:** `isLocalHostname` additionally accepts any `127.x.y.z`
   address (full loopback /8), not just `127.0.0.1`:

```ts
const isLoopbackAddress = (hostname: string) => {
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.slice(1).every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
  );
};
```

## Item 3 — In-memory re-end / re-void not guarded

**Decision: add idempotency guards to BOTH the in-memory and SQLite adapters**
(defense-in-depth at the data layer; the service layer already enforces the
business rule and is unaffected).

- `endManagerAssignment`, `endProjectAssignment`, `endWarehouseAssignment`:
  if `cur.status !== "ACTIVE"` → return `cur` unchanged (no timestamp overwrite).
- `voidDebtEntry`: if `cur.status !== "LIVE"` → return `cur` unchanged.

**Files:** `inmemory-workforce.repository.ts`, `inmemory-operations.repository.ts`,
`inmemory-finance.repository.ts`, `sqlite-company.repository.ts`.

**Safety check:** service callers only reach these with ACTIVE/LIVE records
(`operations.service.ts` throws BUSINESS_RULE otherwise; `finance.service.ts`
filters LIVE before the void cascade; `assignEmployeeWorkplace` uses
`getActive*AssignmentBy*` results), so the guards are pure defense-in-depth.

## Item 4 — Duplicated ownership-history helpers across in-memory repos

**Where:** byte-identical private helpers in `inmemory-workforce.repository.ts`
and `inmemory-operations.repository.ts`.

**Fix:** move `insertProjectManagerOwnershipHistory`,
`endActiveProjectManagerOwnershipHistory`, `insertWarehouseManagerOwnershipHistory`,
`endActiveWarehouseManagerOwnershipHistory` into `InMemoryStore`
(`inmemory-store.ts`) as public methods, alongside `normalizeAudit`/`now`/`newId`.
Both repos call `this.store.<helper>(...)`; private copies deleted.
(`insertStateHistory`/`endActiveStateHistory` are workforce-only — not duplicated —
so they stay in the workforce repo.)

## Item 5 — ESLint for apps/api — **DEFERRED**

117 `any` usages across 16 non-test files (≈96 in orpc handler signatures like
`({ context, input }: any)` plus `rawDb: any` handles). Adding
`@typescript-eslint/no-explicit-any` at error level with CI green requires a
full `any` sweep — a large, orpc-type-sensitive refactor disproportionate to a
"data-layer edge cases" follow-up. Tracked as a new follow-up issue; the PR
description documents the deferral.

---

## Tests

| Item | Test file | Cases |
|---|---|---|
| 1 | `config/config.test.ts` | `BETTER_AUTH_URL=""` defaults to `http://127.0.0.1:4318` |
| 1 | `infrastructure/config/env.test.ts` | same for `createEnv` |
| 2 | `infrastructure/config/url.test.ts` (new) | `isLocalHostname`: `127.0.0.1`, `127.0.0.2`, `127.255.255.254`, `::1`, `[::1]`, `localhost`, `0.0.0.0`, `tauri.localhost` → true; `10.0.0.1`, `127.999.1.1`, `example.com` → false; `normalizeBaseUrl` accepts `http://127.0.0.2:4318` |
| 2 | `config/config.test.ts` | `BETTER_AUTH_URL=http://127.0.0.2:4318` accepted (no https requirement) |
| 3 | `config/database.test.ts` | in-memory re-end keeps original `endDate`; re-void keeps original `voidedAt` (idempotent no-op) |
| 3 | `modules/company/sqlite-company.repository.test.ts` (new) | SQLite re-end / re-void are idempotent no-ops |
| 4 | existing suites | behavior-preserving; covered by `database.test.ts` shared-store test + full suite |

**E2E (Playwright):** not applicable — no user-facing flow changes (backend
config/data-layer hardening only). Documented in the PR description.

## Risks

- URL-helper extraction could miss a subtle behavioral difference between the
  two copies → mitigate: both copies are byte-identical; new module tested via
  `url.test.ts` + existing `config.test.ts`/`env.test.ts` suites.
- Item-3 guards could break a caller that relied on overwrite semantics → audit
  found none; full test suite + typecheck guard this.
- Typed-store helper move (item 4) could hit literal-widening issues on
  `status: "ENDED"` (per wisdom) → the moved code is unchanged; typecheck will
  catch any widening; use `as const` if needed.
