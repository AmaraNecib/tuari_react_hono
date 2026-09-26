# 265 — Local code review (HEAD 4c82420)

Reviewer: fresh-context `reviewer` subagent (read-only), diff `6be3497...HEAD`.

## Spec axis
- (a) `config.databaseKey ?? appConfig.databaseKey` precedence CORRECT — injection
  wins, else resolved app-config key. Production entry `index.ts:18` calls
  `createAppDependencies({}, config)` so the resolved key reaches the factory.
- (b) Desktop env-pinned path UNCHANGED — appConfig.databaseKey == env value; persister
  remains a no-op when APP_DB_KEY env set; merge keeps env-wins.
- (c) Config-file-keyed deployment can now open the DB — key no longer dropped.
- (d) Rekey/rollback semantics NOT undermined — startup resolution only; injection
  precedence preserved and tested.

## Standards axis
- Types non-breaking: `databaseKey: z.string().nullable().default(null)`.
- Existing tests stub env undefined → null → unchanged plain path.
- Factory retains its own env fallback for direct callers (key-manager scratch conns).

## Findings
- P0: none
- P1: none
- P2 (cosmetic): double blank line in config.test.ts — FIXED (removed one blank line).

Verdict: minimal, correct on both axes, well-tested. No blockers.
