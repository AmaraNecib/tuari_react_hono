## Summary

Unifies the app config module: deletes the hand-rolled `createEnv()` / `runtime-env`
singleton (`apps/api/src/infrastructure/config/env.ts`, `runtime-env.ts`) and rewires
`src/index.ts`, `src/infrastructure/auth/auth.ts`, and `src/app/dependencies.ts` to consume
**one injected `AppConfig`** from `createAppConfig()` (`src/config/index.ts`, Zod).

This removes the duplicate runtime computation (10 fields in `createEnv` vs 11 in
`createAppConfig`), the import-time throw when `BETTER_AUTH_SECRET` is missing, the live
inconsistency where `dependencies.ts` ignored the injected config's
`bootstrapSetupKey`/`attachmentsRootPath`, and the duplicate `env.test.ts` suite.

**Divergences resolved toward `createAppConfig`:** port bounds (rejects >65535),
`API_HOST` trimming, unified error type, config-file merge (`TUARI_CONFIG_FILE`) now
reaches the server bind / auth / dependencies path.

## Linked Issue

Closes #212 (part of #211 — Wayfinder map, six architecture-review deepenings)

## Tests Performed

- [x] Unit tests added/updated
  - `config.test.ts` — added out-of-range `API_PORT` (0 / 65536) rejection + schema-level
    port bounds (`.max(65535)`) + derived `BETTER_AUTH_URL` from overridden port
  - `dependencies.test.ts` — added tests proving the injected config is honored for
    `bootstrapSetupKey`, `attachmentsRootPath`, the real `createAuth(db, config)` branch,
    and the no-key default; removed the old `process.env.BETTER_AUTH_SECRET` workaround
  - Deleted duplicate `infrastructure/config/env.test.ts` (11 cases superseded by
    `config/config.test.ts`)
- [x] Integration tests — full API suite green (48 files / 631 tests)
- [x] E2E — no new test (pure server-side refactor, no user-facing change); existing
  `tests/e2e/foundation-smoke.spec.ts` boots the API through the new `index.ts` wiring
  (bind, auth, transport) and covers the critical sign-in path
- [x] Manual — `pnpm typecheck`, `pnpm lint`, `pnpm test:api`, `pnpm test:web` all green
  locally; pre-push hook (full pipeline) passed

## Architecture Impact

- [x] No architectural impact — consolidation of an existing deep module
  (`createAppConfig`), removing a duplicate; see design at
  `.scratch/implementation/212-design.md`
- [ ] Requires Architecture Decision Record (ADR)
- [ ] Updates existing architecture documentation

## ADR Required?

**No**

## Review Evidence

- Design: `.scratch/implementation/212-design.md`
- Test audit: `.scratch/reviews/212/b560faf-test-audit.md` (3-agent audit; findings applied)
- Code review: `.scratch/reviews/212/b560faf-code-review.md` (Standards + Spec axes; findings applied)

## Checklist

- [x] Branch naming follows `refactor/<issue-id>-<description>` convention
- [x] All acceptance criteria from the issue are met (no imports of
  `infrastructure/config/env.ts` or `runtime-env.ts` remain in `src/`; `index.ts` /
  `auth.ts` / `dependencies.ts` consume the injected `AppConfig` end-to-end)
- [x] Tests are passing (`pnpm test:api` 631, `pnpm test:web` 341)
- [x] Type checks pass (`pnpm typecheck`)
- [x] No sensitive files committed
- [x] PR description is filled out

## Known follow-ups (out of scope)

- `createDatabaseConnection()` still resolves its path from raw env via
  `resolveDatabaseEnv` — `TUARI_CONFIG_FILE` `db_path` cannot reach the SQLite connection
  yet (pre-existing seam, config-file phase).
- Flaky `sqlite-bootstrap.port.test.ts` lock-contention test (5s timeout) intermittently
  times out under full-suite load — pre-existing (base repro clean, this worktree 2/2 clean
  after); proposed fix: raise the test timeout in a follow-up.

## Coverage round (commit f2b4eeb)

Follow-up to review feedback ("tests only try the happy path"): closed the config-module
coverage gaps with variant/edge tests in `config.test.ts`, `loader.test.ts`, `url.test.ts`,
`dependencies.test.ts` (trims, truthy-variant case-insensitivity, CSV empty segments,
`pg_ssl: false`, `normalizeOrigin` empty/protocol-without-host, omitted-sqlite fallback
branch). Scoped v8 coverage for the touched files is now 100% on lines/statements/functions
where reachable; the remaining unreachable/out-of-scope branches are tracked in
**#259** (auth `phoneNumber` plugin callbacks, `normalizeBaseUrl` non-`Error` throw branch,
`config/database.ts` narrow factory branches — owned by the #198/#214 composition-root work).

## Known follow-ups (out of scope)

- `createDatabaseConnection()` still resolves its path from raw env via
  `resolveDatabaseEnv` — `TUARI_CONFIG_FILE` `db_path` cannot reach the SQLite connection
  yet (pre-existing seam, config-file phase).
- Flaky `sqlite-bootstrap.port.test.ts` lock-contention test (5s timeout) intermittently
  times out under full-suite load — pre-existing; proposed fix (raise timeout) tracked in #259.
