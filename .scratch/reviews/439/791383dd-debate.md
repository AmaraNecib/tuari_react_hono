# Debate — backup UI (#439 + #436)

Reviewed HEAD: `791383dda6566c8d65190a640cecb724a7a67645` (fix SHA).
Base: `551948e4e07b04f4be9115db15923cee32dc80ef` (`origin/develop`).
Review tier: High-assurance (owner-facing data-safety claim).
Mode: fresh-context critic and defender sub-agents, then parent synthesis.

## Critic findings

| # | Sev | Finding | Verdict |
| --- | --- | --- | --- |
| F2 | 8 | `runDueBackup` reads the mutable root across an `await`; a save mid-run pruned the **new** root with the **old** root's date list (real backups deleted) and adopted old-root success into the new-root status. | **Fixed** — run root pinned; prune and status update scoped to it. |
| F1 | 8 | `handleSave` awaited `mutateAsync` with no catch; a transport/401/500 rejection left the Save button silently dead. | **Fixed** — try/catch renders the error; test added. |
| F3 | 7 | A prune failure after a good snapshot set `lastFailure`, and `hasSuccess` required `failure === null`, so the screen said "failed" and hid the restorable snapshot. | **Fixed** — success block renders alongside failure. |
| F4 | 6 | A folder change orphaned the old snapshots with no on-screen warning; only `docs/backups.md` said so (and wrongly claimed they would still be pruned). | **Fixed** — `folderChangeNote` in the form; doc corrected. |
| F5 | 5 | `persisted:false` rendered as a normal "saved" headline with a muted footnote. | **Fixed** — session-only saves use a session-only headline. |
| F6 | 4 | Env `APP_BACKUPS_ROOT` silently overrides the persisted setting on restart; the UI does not say so. | **Dismissed** — documented, deliberate precedence (env wins, same as `db_key`/`db_path`). Reporting the source would need a new status field; out of scope for this diff. |
| F7 | 4 | Persistence failures collapsed to one opaque message; the writer swallowed the cause. | **Fixed** — writer returns the reason; the persister includes it; test added. |
| F8 | 3 | The desktop picker swallowed every error and looked identical to Cancel. | **Fixed** — the hook propagates; the caller shows an error; test added. |
| F9 | 3 | (a) client clock skew; (b) future-dated snapshot shown as an ordinary success; (c) no refetch interval. | **(b) Fixed** — future-dated banner. (a) desktop is the same machine; (c) low, the screen refetches on mount/focus. |
| F10 | 2 | Cross-process config write is last-writer-wins. | **Dismissed** — in-process write is fully synchronous; the desktop runs one sidecar. |
| F11 | 2 | Validator TOCTOU cannot predict an unmounted drive. | **Dismissed** — designed; the run records the failure loudly. |
| F12 | 2 | Unparseable timestamps render `—`. | **Dismissed** — `timestampSchema` is `z.string().datetime()`, so it cannot reach the UI. |
| F13 | 1 | Overdue card kept neutral chrome. | **Fixed** — destructive border when overdue. |

## Defender

Argued the screen never claims safety in any state: never-run disclaims disk-failure
protection, "failed" outranks "succeeded", a folder change cannot keep the old
green status, and `persisted` is reported separately from `success`. The defender's
strongest concession: the session-only caveat was visually subordinate (F5), and an
in-flight run could contradict the "never describes the old folder" rule (F2).

## Synthesis

Fixed F1, F2, F3, F4, F5, F7, F8, F9b, F13. Dismissed F6, F10, F11, F12 with the
code path that disproves them (above). Every behaviour fix has a test that fails on
the pre-fix code; the red runs are recorded in `red-green.md`.

## Owner-risk verdict

The status screen cannot claim a backup succeeded when it did not: a snapshot is
only adopted after the staging folder is renamed into place, and a mid-run folder
change no longer lets an old-root result leak into the new-root status. The
remaining honest gaps are environmental (an unmounted drive at run time), and those
are recorded as a loud failure, not a success.
