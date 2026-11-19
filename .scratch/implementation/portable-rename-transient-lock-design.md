# Portable candidate rename retry

## Pinned scope

- Worktree: `D:/worktrees/tuari_react_hono/t3-6bbc09b3-0a1be3f0b98d41e7`
- Base: `0afcf2964a157f48370d267e17b200a1c0c1e30d` (`origin/develop` cached revision)
- Verification mode: `focused-local / CI-final-enforced`, strict ruleset `26837184`
- Review tier: High-assurance. The failure occurs in desktop artifact publication after encryption proof; a bad change could replace a valid portable artifact.
- Scope: `build-portable.mjs`, `build-portable.test.mjs`, and a small candidate-rename module.

## Failure and limits

The production portable build failed on a candidate directory rename with `EPERM`. A later GitHub diagnostic build passed and uploaded a large trace, but the trace could not be downloaded locally. No trace was captured at the original failure. The hosted locking process is unknown. This change tests and mitigates a reproducible class of transient Windows sharing errors; it does not identify the original lock owner or prove this class caused the hosted failure.

The discriminating test uses Win32 `CreateFile` on the candidate directory with `FILE_FLAG_BACKUP_SEMANTICS` and a share mask that omits `FILE_SHARE_DELETE`. A separate, test-owned PowerShell process holds the handle. It checks an unheld rename to an absent destination, the same rename while held, and rename success after releasing that process. A second test holds the candidate during the real build script's publication path and releases the handle after the first observed retry.

## Design

`renamePortableCandidate(source, destination)` is the one production seam. It retries only `EACCES`, `EBUSY`, and `EPERM`, with four total attempts and delays of 100, 250, and 500 ms. Maximum added wait is 850 ms. Each failed attempt logs its count, native error code/message, and next delay. Structural errors such as `ENOENT` fail immediately. Exhaustion rethrows the last error. It never removes the candidate or treats an unmoved directory as success.

The encryption proof still completes before publication. The existing destination folder must be removed before rename because Windows cannot rename the candidate over an existing directory. That means a failed rename can leave no previous folder. The previous ZIP is more valuable as the published artifact, so its removal moves after successful candidate rename. Archive creation remains after both operations. The helper does not change fallback paths, package contents, or archive behavior.

## Interfaces and architecture

- `build-portable.mjs` calls the helper with source and destination paths; no other caller changes.
- The helper owns the bounded retry policy behind that small interface. Tests use the production helper and the full script publication path.
- No domain glossary or ADR change is needed. No seam outside candidate rename moves.

## Proof required

- Real Windows directory handle: absent-destination baseline succeeds, held handle produces `EPERM`, `EBUSY`, or `EACCES`, release lets the rename succeed. Preserve PID, native error details, timestamps, and raw logs.
- Production path: release after the first failed candidate rename and require archive creation only after success.
- Permanent lock: four attempts fail, candidate remains, prior ZIP remains byte-for-byte, archive command is not called.
- Structural error: one attempt, no delay.
- Existing plaintext binding and loader rejection tests remain green.
- Run the affected portable test file and record any skipped native-runtime tests. Do not run a full build or browser suite locally.

## Wisdom applied

Read desktop wisdom index and overview. No matching lesson covers directory-handle rename failures. The earlier native DLL-lock test was explicitly excluded because it used an existing destination and did not discriminate rename locking.
