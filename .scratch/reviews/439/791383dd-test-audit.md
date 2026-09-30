# Test audit — backup UI (#439 + #436)

Reviewed HEAD: `791383dda6566c8d65190a640cecb724a7a67645` (fix SHA).
Scope: the API backup/config tests, the web settings test, and the E2E spec.

## Questions and verdicts

| # | Question | Before | After |
| --- | --- | --- | --- |
| 1 | Does a test prove the status distinguishes all four states? | Yes — each state asserted by `data-state` and a distinct string. | Yes, plus 47h/49h overdue boundary tests. |
| 2 | Would a test catch the never-run copy overstating protection? | Partial — only the disk-failure disclaimer substring. | Strengthened — asserts DB-only, the conditional same-disk phrase, and the disclaimer. |
| 3 | Is invalid-path rejection tested for each named reason (empty / file / cannot-create / no-access)? | 3 of 4 — no-access untested, and `accessSync(W_OK)` is blind to Windows ACLs. | 4 of 4 — the validator writes a probe; a failing-probe test fails on the pre-fix code; the reason text is asserted. |
| 4 | Is the config writer covered on both consumers? | Yes, but the failure paths only via the old key persister. | Added `config-file-writer.test.ts` (preserve/create/round-trip/reject-non-object/reject-loader-invalid/rename-failure reason + cleanup/0600), plus a full persister→`createAppConfig` restart-chain test. |
| 5 | Does the E2E assert the folder change persists across a reload? | No — render only. | Yes — the E2E saves a folder, asserts the on-disk `config.json` gets `backups_root` (the file the next start reads), then reloads and asserts the field still shows it. |

## Fixes driven by the audit

- Untested `accessSync` permission branch and the Windows blind spot → write probe + test.
- Unhandled `mutateAsync` rejection → try/catch + test that fails on the pre-fix component.
- Test name that lied ("cannot be created or accessed") → split into create and access tests.
- Post-save path adoption untested → test that the field follows the server-normalized root.
- Desktop picker failure untested → test that the failure message renders.
- Prune failure masking a success untested → test that both blocks render.

## Coverage

- `apps/api/src/modules/backup/**`: statements 290/290, branches 114/114,
  functions 59/59, lines 264/264 — 100% on every metric.
- `config-file-writer.ts` + `backup-folder-persister.ts`: 100% on every metric.

## Result

No "fix it" findings remain. The four states, the honesty copy, every named
validation reason, the shared writer, and the E2E durability chain now have tests
that fail when the corresponding behaviour regresses.
