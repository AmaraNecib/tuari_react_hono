# 265 — Test audit (HEAD 4c82420)

Reviewer: fresh-context `reviewer` subagent (read-only).

## Verdict: ADEQUATE

Core regression + all precedence branches covered via `dbKeyCapture` factory mock
(the real DB-open seam).

## Coverage confirmed
- config.test.ts: default null, env resolution, config-file key when env unset,
  env-wins-over-config, blank env → null.
- dependencies.test.ts: config-file key reaches factory when no injection (#265 gap);
  injected key wins over config-file key; injection forwarding parity; null (no-key)
  reaches factory.
- loader.test.ts: db_key → APP_DB_KEY when env absent; env wins over db_key.

## Minor P2 gaps (addressed)
- P2-1 blank/empty env key edge — ADDED config test (blank APP_DB_KEY → null).
- P2-2 null factory-call path — ADDED deps test (no key → factory receives null).
- P2-3 real SQLCipher restart-open — acceptable unit tradeoff; would require an
  integration test (out of scope for this unit-level fix).
