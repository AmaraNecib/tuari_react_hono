# #430 code review — PR #434 aggressive local review + fixes

- reviewed code HEAD (final): `8408c4e0`
- base: `origin/develop` @ `edf1e5b3` (the branch contains it; `git rev-list --left-right --count origin/develop...HEAD` = `0 11`)
- tier: Standard (new module + config + contract + docs; no authz/crypto/finance)
- PR: #434 (parent-owned; a lane never merges)
- lane: `worktrees/feat-daily-backups`, branch `feat/430-daily-backups`
- fixes: `9f6116cb` (target replace / staging sweep / status) and `8408c4e0` (worker watchdog)
- prior evidence: `8e240048-*` (now superseded)

This round ran three independent reviews on a fresh context (debate, code-review
two-axis, test-audit) and then fixed every finding. Findings table:

| # | Sev | Finding | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| 1 | High | A folder at the target date that carries OUR marker but is unusable (truncated/partial copy) makes every start fail `refusing to overwrite` forever. | **Fixed** `9f6116cb` | Test `replaces OUR OWN unusable snapshot at the target…` fails on pre-fix code. |
| 2 | High | A hung output mount (SMB) leaves `runDueBackup` pending forever: no backup, no failure, scheduler latch stuck. | **Fixed** `8408c4e0` | Test `terminates the worker and rejects when the copy times out` fails on pre-fix code. |
| 3 | Med | `.staging-*` sweep deletes by name alone — a shared backups root with a foreign `.staging-*` folder loses it; the one place the marker rule was dropped. | **Fixed** `9f6116cb` | Tests `keeps a foreign .staging-* directory…` and `keeps a .staging-* file and an unreadable .staging-* directory` fail pre-fix. |
| 4 | Med | `setTimer(run, ms).unref?.()` throws if an injected timer returns nothing (a boot path). | **Fixed** `9f6116cb` | Test `tolerates an injected timer that returns nothing` fails pre-fix. |
| 5 | Low-Med | A *directory* named `tuari.sqlite` counts as a usable encrypted snapshot (size > 0, header check skipped). | **Fixed** `9f6116cb` | `hasSnapshotDatabase` now requires `isFile()`. Test fails pre-fix on POSIX; on Windows a dir's `stat.size` is 0 so it already rejected — the guard is the portable fix. |
| 6 | Low | Seeded `lastSuccessAt` is the folder mtime though the marker already carries the real `takenAt`. | **Fixed** `9f6116cb` | Test `seeds lastSuccessAt from the marker's takenAt…` fails pre-fix. |
| 7 | Low | A clock corrected backwards hides real (future-dated) backups from `getStatus()`. | **Fixed** `9f6116cb` | Status now lists without the clock ceiling; test asserts `lastBackupPath` is the future fixture pre-run; fails pre-fix. |
| 8 | Low | A thrown `""` makes `lastFailure.reason` empty → `backupStatus` fails its `.min(1)` output → 500. | **Fixed** `9f6116cb` | Test `reports a non-empty reason for a thrown empty string` fails pre-fix. |
| 9 | Low | `docs/backups.md` said "the newest is yesterday **or newer** → do nothing", contradicting the future-date handling. | **Fixed** `9f6116cb` (docs) | Wording rewritten; corrected-clock orphaning documented as a limitation. |
| 10 | Low | The commit-point `renameSync` failure, a quoted output path, the fallback `unref`, the ISO-week year boundary, and the keyed rejection were under-asserted. | **Fixed** `9f6116cb` (tests) | New tests; the rename/quote tests pass pre-fix (coverage pins, not behavior changes). |
| 11 | Med | The `backupStatus` RPC has no web/desktop consumer, so a failure is only in the sidecar log. | **Dismissed — documented scope.** | Issue #430 acceptance is "log it, surface it non-fatally"; the RPC is that surface and `docs/backups.md`/the design record the UI as a later consumer; `docs/backups.md` says "available to the UI", not "shown". |
| 12 | Low | No in-flight guard on `runDueBackup`; two concurrent calls could race the rename. | **Dismissed with evidence.** | The only production caller is `createStartupBackup`, whose `scheduled` latch invokes it at most once (`backup.scheduler.test.ts` "runs once when health is served repeatedly and the fallback also fires"); grep shows no other caller. |
| 13 | Low | `createWorkerSnapshotter`'s eager `require.resolve` runs at composition time and could block boot. | **Dismissed with evidence.** | `createAppDependencies` opens the DB connection first (`dependencies.ts:138`) and, for a keyed deployment, the SQLCipher binding is already required there, so a resolution failure throws before the backup service is built; for plaintext the module is the same one the live connection uses. Not reachable. |
| 14 | Low | `/health/` is not matched; a non-2xx `/health` still arms the backup. | **Dismissed with evidence.** | The desktop shell sends exactly `GET /health` (`apps/desktop/src-tauri/src/lib.rs:1942`) and only proceeds on success; the fallback timer covers any other path. A non-2xx arming the backup is harmless (the backup should run anyway). |
| 15 | Low | A construction-time `lastFailure` persists on a later `not-due` start even after the root becomes readable. | **Reported, not fixed.** | Clearing it would also hide a real prune failure (the design keeps `lastFailure` until a success); distinguishing seeded from run failures is a small follow-up. Parent decision requested. |
| — | False | `docs/editions-and-features.md` "undocumented change". | **Dismissed with evidence.** | Artifact of the review agents diffing the stale design-doc base `1dc6191...HEAD` (the branch has since absorbed develop, including #435). `git diff origin/develop...HEAD --name-only` does not touch that file. |
| — | False | The 100% coverage is "hollow" because the worker body is an eval'd string v8 cannot instrument. | **Dismissed with evidence.** | The worker body is exercised for real by `backup.snapshot.test.ts` (real temp DB, real worker, integrity check, quoted path, timeout). v8 cannot *measure* it; the behavior is covered. |

## Spec axis

The database-only scope is a documented parent cut (attachments in #433). All
four acceptance bullets are met (injected clock; copy readable under a held
write with `PRAGMA integrity_check`; exact retention that never prunes the
newest; failure preserves prior backups and reports the reason; docs cover
what/where/restore/limitations). The literal "attachments folder" line is the
only gap and is the documented cut.

## Standards axis

No new violations. The module keeps named exports, the port/adapter seam, the
composition-root fail-soft rule (wisdom `architecture.md`), the "own the
transaction on its own connection" rule (the worker's dedicated connection),
100% scoped coverage, and no `any`. The two `/* v8 ignore */` regions are
unchanged and still defensible (CJS-only base; worker bootstrap error).

## Dismissals I could not disprove are listed as reported (15), not silently dropped.
