# #430 test audit (PR #434 review, HEAD `48d3d65d`)

Three read-only test-audit agents (edge-case hunter, coverage analyst, quality
reviewer) ran over the backup tests and their source. Findings and resolution:

## Fixed

| Finding | Fix |
| --- | --- |
| An unusable target folder is never re-run in a test, so the permanent wedge was invisible | New `replaces OUR OWN unusable snapshot…` test (red pre-fix). |
| No test that a foreign `.staging-*` folder survives; no test that a `.staging-*` file or an unreadable staging dir is left alone | Three new tests (red pre-fix). |
| No test for a directory named `tuari.sqlite` with an encrypted marker | New test (red pre-fix on POSIX). |
| No test that `lastSuccessAt` comes from the marker `takenAt`; no malformed-`takenAt` case | Two new tests (red pre-fix). |
| No test for an empty thrown reason | New test (red pre-fix). |
| No test for a `setTimer` that returns `undefined` | New test (red pre-fix). |
| No test for a failing commit-point `renameSync` | New test (coverage pin). |
| No test for a `'` in the snapshot output path | New test (coverage pin). |
| The "event loop keeps turning" test asserted `ticks > 0`, which a synchronous copy can satisfy; it also seeded 200k rows for weak signal | Replaced with a `setImmediate`-race assertion that a synchronous copy provably fails, and dropped the 200k seed (faster). |
| `backup.scheduler.test.ts` "unrefs the fallback" asserted nothing about `unref` | New `unrefs the fallback timer…` test asserts the call. |
| The keyed-path test used a bare `rejects.toThrow()` | Tightened to a matcher covering the missing `.node` / keyed-open failure. |
| No ISO-week year-boundary case | New policy test: `2025-12-29` is `2026-W01`. |
| Dead `void db;` lint silencer | Removed the unused destructure and the statement. |
| No test that a construction-time root failure is cleared once the root reads, and that a real failure survives a `not-due` start | New `clears a construction-time root failure once the root can be listed` (red pre-fix) and `keeps a real run failure across a later not-due start`; the prune-refusal test now also asserts the prune failure survives a later not-due start. |
| Retention assertion had no comment explaining the weekly-in-daily-window quirk | Added the comment. |

## Dismissed with evidence

- **"100% coverage is hollow because the worker body is an eval'd string."**
  The body is executed for real by `backup.snapshot.test.ts` (real temp DB, real
  worker, `integrity_check`, quoted path, timeout). v8 cannot instrument the
  string; the behavior is covered.
- **"Criterion 2 is approximated (no write during the copy)."** The test holds a
  `BEGIN IMMEDIATE` writer with an uncommitted insert open across the copy and
  asserts the committed row is present and the uncommitted row absent — the
  consistency property the criterion is about.
- **"`router.test.ts` injects a stub backupService."** That is the router's auth
  + passthrough seam; the real service is covered by the backup module tests and
  the composition-root typecheck.

## Residual

- The 30-minute watchdog is tested with `timeoutMs: 0`; the production value
  (30 min) is not exercised end-to-end (no plausible way to make a real copy
  hang).
