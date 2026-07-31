# Test Audit — issue #200

**Tier:** Standard
**Base SHA:** `d41e3e8d3d6a5d88614a1edf3e6afbfb30bda64f`
**Head SHA:** `1b1ccf7b0b076d52120cdba5f548cddeb2391121`

## Method

Three parallel sub-agents (Edge Case Hunter, Coverage Analyst, Quality
Reviewer) reviewed the changed test files:
- `apps/api/src/config/config.test.ts` (new `appConfigSchema betterAuthUrl validation` block)
- `apps/api/src/app/dependencies.test.ts` (new — config injection)
- `apps/api/src/config/database.test.ts` (existing in-memory adapter tests)

## Findings → Actions

| # | Finding (agent) | Risk | Action |
|---|---|---|---|
| 1 | Empty-string `BETTER_AUTH_URL` crashes instead of defaulting (`??` skips `""`) | 🟠 pre-existing behavior, unchanged by this diff | Deferred — documented below, not fixed (out of issue #200 scope) |
| 2 | `ftp://`/non-http(s) protocol branch of `normalizeBaseUrl` untested | 🟠 | **Fixed** — added schema test `"rejects a non-http(s) protocol via the schema alone"` |
| 3 | `127.0.0.2` (loopback /8) rejected as non-local | 🟠 pre-existing | Deferred — documented below |
| 4 | Uppercase-scheme normalization unpinned | 🟡 | Accepted as-is (URL canonicalization is standard) |
| 5 | Default ports silently stripped by `new URL` | 🟡 pre-existing | Accepted as-is (semantically equal for better-auth) |
| 6 | `dependencies.test.ts` default-path test coupled to ambient `process.env` (DB_ADAPTER / TUARI_CONFIG_FILE / NODE_ENV pollution → false green or failure) | 🟠 | **Fixed** — `vi.stubEnv` pins the env; `afterEach` unstubs |
| 7 | Credentials+query test uses one URL with both — shared error message masks a regression of only the query check | 🟠 | **Fixed** — split into `"rejects credentials"` and `"rejects query parts"` |
| 8 | Re-end/re-void idempotency not guarded in-memory (no status check; second call overwrites) | 🟠 pre-existing, mirrors SQLite adapter behavior | Deferred — documented below |
| 9 | Typed Maps + `status: "ENDED" as const` / `"VOIDED" as const` overrides unpinned by runtime tests | 🟡 | **Fixed** — added `"inmemory end/void mutations persist typed status transitions"` in `database.test.ts` |
| 10 | `expect(deps.rawDatabase).toBeDefined()` noise assertion | 🟡 | **Fixed** — removed |

## Acceptance-criterion coverage

1. **Typed Maps, no `any`** — compile-time (tsc) + source inspection + functional
   in-memory tests (`database.test.ts`); no runtime test can assert "no `any`".
   Adequate; note: `apps/api` has no ESLint config, so "no `any`" relies on review discipline.
2. **Optional `config` param** — positive test (injected inmemory config selects the
   in-memory adapter) + negative test (omitted config defaults to sqlite → hits the
   schema-less `:memory:` db). Complementary pair.
3. **Zod-validated betterAuthUrl** — 6 schema-level tests: normalization, insecure-http,
   malformed, non-http protocol, credentials, query parts.
4. **Existing tests unchanged** — full suite 559/559 green (556 baseline + 3 net new).

## Deferred follow-ups (pre-existing behavior, out of issue #200 scope)

- `BETTER_AUTH_URL=""` (empty string) crashes startup instead of defaulting to
  `http://host:port`; every other field treats empty as unset. Consider `||` instead
  of `??` in the factory.
- `isLocalHostname` only accepts `127.0.0.1` (and `::1`), not the full loopback /8.
- In-memory `end*Assignment` / `voidDebtEntry` have no status guard; re-ending or
  re-voiding overwrites timestamps (SQLite adapter behaves the same — parity, not a regression).
