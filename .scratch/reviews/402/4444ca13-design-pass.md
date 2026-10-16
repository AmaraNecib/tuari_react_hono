# Design pass — #402 SQLCipher build/runtime gate

- issue: #402 (build-sidecar silently ships without SQLCipher while APP_DB_KEY is set)
- tier: High-assurance (crypto / licensing)
- mode: remote
- branch: `fix/402-encryption-fallback`
- base: `ec369a303301fb61259a61c532753fea723d75fd` (merge-base with origin/develop)
- reviewed HEAD: `4444ca133d0857e7a63e2ab1e2290251d0dd35b7`
- skills: `domain-modeling`, `codebase-design`, `improve-codebase-architecture` (fresh context)
- scope: full branch diff + the round-5 delta `2201983c..4444ca13`

## Verdict

**No blockers. HEAD leaves the codebase no worse; the delta is test-only plus a
rename and strictly increases regression detection.**

## Confirmed correct

- The delta adds no production code path; the pragma shape matches
  better-sqlite3 (`integrity_check` → row array, `user_version` → scalar,
  `key` / `busy_timeout` → `[]`), so the fake no longer accepts a probe that
  forgot `{ simple: true }`.
- The rename keeps the option (`backup.snapshot.ts:108`) distinct from the
  default implementation (`:127`), which is what the round-4 note asked for.
- Prior rounds' duplications stay single-sourced: `sqlcipherPlaintextWaiver`
  owns the release rule, `escapeSqliteString` owns key escaping, and
  `assertDatabaseFileMatchesKey` owns the header rule.
- The `resolveDriverModule` seam is optional and defaults to the real resolver,
  so production behaviour is unchanged; no production caller passes it.

## Findings

| Sev | Location | Claim | Action |
| --- | --- | --- | --- |
| Low | `apps/api/tsup.config.ts:16` | The comment cites `resolveDriverModule`; the rename moved the guarded code to `defaultResolveDriverModule`. The name still resolves to the option at `backup.snapshot.ts:108`, so the citation is imprecise, not broken. | Dismissed for this PR: the symbol exists in the same file; a one-word comment polish is not worth another reviewable change at the gate. |
| Low | `backup.snapshot.test.ts:171,187` | The specifier assertion pins only the keyed direction; the keyless `"better-sqlite3"` string is not asserted. | Dismissed: five keyless tests exercise the default resolver end to end, so a broken plain path fails them. |
| Note | `backup.snapshot.test.ts:33-38` | The fake only honours `simple` for `cipher_version`; `user_version` ignores it. | No production impact (the worker's `Number(...) \|\| 0` is shape-insensitive). |

## Residual risk

The native keyed-write proof is out of this diff's reach and owned by #410; the
design record states that limit in the probe doc comments, the docs, and the
test titles.
