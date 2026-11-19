# Windows mixed-alias sidecar probe

## Scope and state

- Worktree: `D:/worktrees/tuari_react_hono/t3-6ce865c7-c18ac4cf9714db83`
- Base: `5c45c46554ff8294d1772b4024a2f012879cf4b8` (`origin/develop` at lane start)
- Verification: focused-local / CI-final-enforced, strict active ruleset 26837184, app ID 15368, no bypass
- Review tier: light parent inspection plus the parent's Greptile build-lane gate. This worker ran no reviews and opened no hosted run.
- Reachable failure: Windows installer smoke can miss the actual Node sidecar when the extraction root and process command line use different 8.3 aliases for different path segments.

## Diagnosis

The recorded Nightly 44542554069 failure passed the long-root/short-command case, then returned no sidecar for the short root and long command case. Its `GetShortPathName` and `GetLongPathName` alternatives transformed every path segment together. Neither alternative represented a path mixing a short ancestor with a long child, or a long ancestor with a short child.

I reproduced the same missed exact PID using real Node processes under a nested directory whose parent and child each had independent 8.3 aliases. The old probe returned zero exact fixture-PID matches for the mixed-parent-short/child-long command. See `.scratch/reviews/windows-mixed-path-sidecar-probe/red-exact-repro.log`. The old probe returned zero exact fixture matches for the mixed-parent-short/child-long command, despite returning one unrelated sidecar. The original failure is preserved in the parent-captured Nightly log.

## Interface and design

The PowerShell probe keeps its existing `-ExtractDir` interface and environment inspection. It canonicalizes the expected entry path and the actual Node main-script argument with Win32 `GetLongPathName`, so mixed aliases converge without enumerating combinations. It parses the process command line with Windows `CommandLineToArgvW`, verifies `argv[0]` against the process executable path, and compares only `argv[1]` to the exact canonical `bin/api-runtime/dist/index.cjs` path. It does not use port, substring, parent-prefix or suffix matching. Extended-length drive and UNC prefixes are removed after canonicalization.

The test creates separate 8.3 aliases for the long parent and child directory names, and fails setup if either leaf lacks its own alias. It launches owned Node fixture PIDs using long, short, parent-short/child-long and parent-long/child-short entry paths. Each fixture path contains spaces. For each process it probes all four expected-root spellings. Its negative cases reject a sibling extraction root, an extra argument containing the expected path plus a suffix, and the parent root. The test uses real Windows aliases and fails setup if either alias is unavailable.

The changed module has one caller, `installer-smoke.mjs`, which keeps passing the extraction root. No caller change was needed. The seam remains the existing PowerShell process probe, and the implementation adds no dependencies.

## Applied lessons

- Applied the Windows process-identity requirement from the task: process IDs remain owned by the fixture, cleanup only targets those IDs, and every fixture is stopped and awaited in `finally` before directory removal.
- The existing Tauri `resource_dir()` prefix lesson is unrelated. This change normalizes prefixes only for comparison and does not change launch behavior.

## Verification boundary

Focused Windows proof only. No full build, browser run, release-asset smoke, hosted check, review or publication was run. The parent must still validate the native artifact smoke and current-head CI / Greptile gates before merge.
