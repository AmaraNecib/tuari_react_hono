# Code review — backup UI (#439 + #436)

Reviewed HEAD: `791383dda6566c8d65190a640cecb724a7a67645` (fix SHA).
Base: `551948e4e07b04f4be9115db15923cee32dc80ef`.
Axis runs: separate fresh-context Standards and Spec sub-agents.

## Standards

| Finding | Verdict |
| --- | --- |
| `docs/backups.md` still documented the three-field `backupStatus` and claimed changed-away snapshots would be pruned. | **Fixed** — example carries `backupsRootPath`/`retention`; the retention sentence now says the old folder is no longer pruned automatically. |
| Retention must stay a single source of truth. | **Pass** — the UI reads `getStatus().retention` from the service's injected `policy`; no duplicate numbers. |
| The extracted atomic writer must be the only write protocol, used by both persisters. | **Pass** — `database-key-persister.ts` and `backup-folder-persister.ts` both call `updateConfigFile`; the key persister's ~60 duplicated lines are gone. Added a dedicated `config-file-writer.test.ts` to pin the shared protocol. |
| i18n: every user-facing string through `t()`. | **Pass** — `pnpm check:i18n-keys` green; all new Arabic keys are used. |
| Semantic tokens only; no raw colours. | **Pass** — `border-line`, `border-destructive/40`, `text-destructive`, `text-foreground`, `text-muted-foreground`. |
| No new IPC/Rust command or environment variable. | **Pass** — the setting rides the existing `TUARI_CONFIG_FILE`. |
| Error envelopes; no swallowed errors. | **Fixed** — the writer now returns the reason; the picker no longer swallows. |
| Baseline smells. | None new. The writer extraction removes duplication instead of adding it. |

## Spec

| Requirement | Verdict |
| --- | --- |
| #439 four distinct states (never-run / succeeded / failed / overdue). | **Pass** — each asserted by `data-state` and a distinct Arabic string; boundary cases (47h/49h) added. |
| #439 honest never-run copy. | **Fixed** — no unconditional "same disk" claim; it is now conditional on the folder shown, and still disclaims disk-failure protection. |
| #439 failure must show the reason and time. | **Pass** — and it no longer hides a successful snapshot (F3). |
| #436 validated path naming empty / file / cannot-create / no-access. | **Fixed** — the validator writes a probe instead of `accessSync`, so no-access is real on Windows; each reason has a test. |
| #436 desktop picker via the existing plugin; web keeps the field. | **Pass** — `@tauri-apps/plugin-dialog`; the button is desktop-only; the field always renders. |
| #436 `persisted` reported honestly. | **Fixed** — a session-only save is no longer headlined "saved". |
| #436 "never describes the old folder". | **Fixed** — run root pinned; a mid-run change cannot write old-root status. |
| #436 docs reflect the setting and old-snapshot behaviour. | **Fixed**. |

## Result

No unresolved standards or spec findings. No deferrals filed; nothing in the diff
was out of scope for #439/#436.
