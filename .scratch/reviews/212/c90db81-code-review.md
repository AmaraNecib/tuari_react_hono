# Code Review — Issue #212 (config unification)

**Base:** `f93c37c` | **Head:** `b560faf` | **Tier:** Standard

Two-axis review (Standards + Spec) run as parallel sub-agents against
`git diff f93c37c...HEAD` (commits 5dfc606, 1530d6c, b560faf).

## Standards

No hard violations. Repo conventions matched (`as const` returns, JSDoc on exports,
behavior-first `it` names, `vi.stubEnv`/`unstubAllEnvs` isolation, correct `vi.hoisted` +
`importOriginal` mock pattern). No Fowler baseline smells observed (the Duplicated Code the
change was about is gone; the `createAppDependencies` 4-positional-param Data Clump is
pre-existing with an intentionally unchanged signature).

Judgement-call notes — both addressed in `b560faf`:
- `createAuth` JSDoc was shortened and lost `@param` documentation → restored with
  `@param drizzleDb` / `@param config`.
- A test comment claimed the real-auth test "pins baseURL/secret/trustedOrigins" but the
  assertion only checks `handler` is a function → comment softened to state what it proves.

## Spec

Every issue requirement verified present:
- `createEnv()` / `runtime-env` singleton deleted; zero imports of
  `infrastructure/config/env.ts` or `runtime-env.ts` remain in `src/`.
- `index.ts` consumes injected `AppConfig` for serve bind (host/port) and transport
  security (allowedOrigins/trustProxyHeaders).
- `auth.ts` consumes `config.betterAuthUrl` / `betterAuthSecret` / `allowedOrigins`.
- `dependencies.ts` consumes `config.bootstrapSetupKey` / `attachmentsRootPath`.
- `env.test.ts` deleted; `config.test.ts` is the single suite (11 deleted cases have exact
  analogues there).
- Divergences resolved toward `createAppConfig` (port bounds, `API_HOST` trim, error type).
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (api 631 + web 341) green.

Spec reviewer flagged one drift: `appConfigSchema.port` lacked `.max(65535)` so a direct
schema parse accepted 65536 while the factory rejected it → fixed in `b560faf`
(`z.coerce.number().int().positive().max(65535)`) plus schema-level tests.

## Residual risks (documented, out of scope)

- `createDatabaseConnection()` still resolves its path from raw env via
  `resolveDatabaseEnv` — pre-existing seam; config-file `db_path` cannot reach the SQLite
  connection yet. Noted as follow-up for the config-file phase (see design doc).
- `.scratch/implementation/212-design.md` and the `url.ts` doc-comment refresh are
  process artifacts beyond the issue's code asks — trivial and justified.

---

## Post-evidence delta (7459eb4 — final head)

Head moved b560faf → f2b4eeb (coverage round: test-only additions in config.test.ts,
loader.test.ts, url.test.ts, dependencies.test.ts — no production code changed) →
7459eb4 (wisdom docs). Production code under review is unchanged since b560faf;
Greptile re-reviewed the final head (5/5, no actionable findings). Coverage round
closed the remaining in-scope branches (API_HOST trim, truthy-variant case-insensitivity,
CSV empty segments, pg_ssl false, normalizeOrigin empty/protocol-without-host, omitted
sqlite fallback). Deferred branches tracked in #259.

---

## Post-evidence delta (c90db81 — final evidence commit)

Evidence commit c90db81 (this rename + PR body) is scratch-only; Greptile re-review on
the final head covers c90db81, matching the PR head exactly.
