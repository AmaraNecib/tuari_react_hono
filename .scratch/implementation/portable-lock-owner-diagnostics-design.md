# Portable rename failure diagnostics

## Scope and authority

This worker owns focused diagnostics for the nightly `portable:only` rename failure. The parent owns publication, PRs, merges, workflow dispatch and scheduling. No package, tool, version, Node, SEA, signing or license changes are authorized. Do not bypass packaging, encryption, Shell or native smoke gates.

The available isolated checkout is `D:/worktrees/tuari_react_hono/t3-e134bdd6-f2b80749f3dc76ad`. It is clean at `433af8a685295a85d9a24857877b48d4836862f8`, equal to `origin/develop` and the supplied base. The local branch label is `fix/portable-rename-diagnostics`; the same commit is also referenced by `diagnose/portable-rename-lock-owner`. Verification mode is `focused-local / CI-final-enforced`, as supplied by the parent. Review tier is high assurance because this change affects CI packaging and artifact retention. The parent permits this focused instrumentation, not local review sessions.

## Failure and unknown

Nightly run `44579443928` passed its full encryption proof, then failed the real `Create portable package` step before ZIP creation. Node 22.23.4 reported native `EPERM` on all four candidate-directory rename attempts after waits of 100, 250 and 500 ms. The source was `.tmp-Tuari-portable`; destination was `Tuari-portable`. The exact holder is unknown. A loaded native DLL alone is not evidence of a directory lock. Do not lengthen the retry schedule or claim a production fix.

The older DLL-only probe used an existing destination and was invalid. Its corrected test showed that loading the native DLL alone can still permit directory rename. The exact failed ZIP remains preserved in the parent tree. Mixed-path and ZIP-entry defects are already fixed.

## Diagnostic design

Instrument the existing packaging process, not a surrogate. Keep packaging order and outcomes unchanged. Record snapshots immediately before the encryption proof and immediately before the final candidate rename. If that rename fails, capture its timestamp, PID, source SHA, candidate/final presence and attributes, and the untouched Node error fields including source and destination. Probe a fixed, small resource list with Windows Restart Manager: candidate directory, `Tuari.exe`, `bin/node.exe`, and known packaged native bindings. Record each returned PID, process start time, application name and matching resource. Include this process if Restart Manager reports it. Never stop, restart or kill a process.

Restart Manager may miss a directory-only handle. Report an empty result as "no Restart Manager owners reported", not "no locks". Any API or process inspection error is separate evidence. A bounded PowerShell wrapper starts the built-in WPR `FileIO` and `Handle` profiles before the actual packaging command under a unique instance name. It stops only the instance it started. If WPR cannot start, packaging continues and the wrapper records why. This machine exposes both profiles, but I did not start a recording because local privileged recording is not required. On a packaging failure, retain the ETL with scoped JSON and logs; on success no diagnostic artifact is uploaded.

Diagnostics are best-effort. They must never replace the primary rename exception or alter the package exit code. Persist only scoped diagnostic JSON, logs and ETL under the runner temp diagnostic directory. Do not capture arbitrary command lines, environment blocks, keys, credentials, runtime files, ZIPs, databases or general temp contents. Existing later ZIP-failure retention remains unchanged. Upload the scoped directory only when the packaging step fails, using the pinned artifact action and three-day retention.

## Test plan and bounds

Use the real Win32 no-share-delete directory handle with an absent destination. Prove the baseline rename succeeds, the owned holder causes the native rename failure, and rename succeeds after that exact child releases the handle. The owned directory fixture produced a native failure. Registering its directory path with Restart Manager returned Win32 error 5, so the helper now classifies directories and leaves them out of the file-resource probe. A separate owned file-handle fixture also produced no Restart Manager owner, so the report keeps that negative result instead of naming the fixture PID. The helper records directory paths it did not query and the API limitation. Test failure evidence and preservation of the original error when probes or writes fail. Validate PowerShell parsing, WPR profile syntax, workflow policy/assets and actionlint. Run focused script tests only. Do not run the full suite, full build, browser tests or native app smoke: the failure precedes ZIP creation and native launch.

## Domain and seam

The packaging script is the module that proves and publishes the candidate. The final rename is the failure seam. A diagnostic adapter observes that same in-process failure without changing the rename interface or retry policy. The deletion test is simple: if the diagnostic adapter is removed, the package output and failure remain identical; only the evidence disappears. The module earns its place by recording facts from this exact call, with no new package API.

## Parent integration

Parent inspection corrected the selected native resource to the actual `prebuilds/win32-x64.node` file, not a nonexistent `prebuilds/win32-x64` directory. The owned-file test permits either an actual reported owner or an honest empty result; it does not hardcode this laptop's empty result as the contract. Parent proof passed 44 packaging/encryption cases with no skips and 12 workflow cases. Actionlint and whitespace checks passed. Diagnostics remain optional and cannot mask the original rename exception. No retry or packaging acceptance policy changed.

## Remaining risks

Restart Manager may not report directory handles, WPR may be unavailable or blocked by runner policy, and this local machine cannot reproduce the original hosted holder. A successful local packaging run is not a reproduction. Only a future failed hosted package run with scoped evidence can identify a holder or provide a useful WPR trace. No hosted artifact is available to this worker.
