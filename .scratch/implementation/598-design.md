# Desktop API lifecycle (#598)

- Mode: remote issue source; focused-local / CI-final-pending. No publication or merge requested.
- Base: fresh origin/develop ea4a1ffa6cc072b6f6638b6a8c3301daa06c53ed. Initial checkout was stale; fast-forwarded before editing.
- Tier: High-assurance because environment isolation and secret delivery must survive extraction. Retain three distinct initial review lenses.

## Boundary

`ApiRuntime` owns the API child from construction through readiness and stopping. Tauri setup calls `start(app)` and exit calls `stop()`; neither touches a Child or its lock. A successful start means the existing HTTP health check succeeded and no child exit was observed after that probe, not merely that spawn succeeded. This preserves the baseline fixed-port readiness contract; it does not authenticate the responding listener as the child. Failed readiness must stop the child. Repeated exit events must be safe.

Keep existing Rust secret, license, private directory, portable layout, installation identity and path-normalization helpers; do not recreate them or change IPC/authorization. Runtime imports those helpers. Move environment configuration unchanged, including development-only PATH and Windows SystemRoot, private TEMP/TMP/SQLITE_TMPDIR. Preserve log append behavior, 15-second deadline and 250ms poll interval.

Deletion test: removing the runtime module removes process construction, health polling, failed-start cleanup and shutdown together; Tauri contains only lifecycle calls. No domain glossary change: this is runtime ownership, not a new business concept.

## Shell placement

CI reserves `src/commands/` for Tauri-dependent shell adapters and prohibits Tauri imports in Rust Core. Place the runtime there and retain its logical root module name with a path attribute, so lifecycle callers and test selection remain stable. Do not exempt the module or weaken the core dependency guard. The initial root placement failed that guard on Ubuntu before test execution.

## Proof

Retain existing environment subprocess and installation matching tests. Add runtime tests with real owned subprocesses for successful readiness, failed readiness cleanup and idempotent exit cleanup; inject only the readiness observation to avoid binding the production API port. Verify existing launch selection and path tests, Windows smoke-probe tests where runnable. Run focused Rust checks through heavy queue if compilation requires minutes; no full suites or production builds authorized.

## Risks

No dependencies, schema changes, crypto decisions or inherited environment additions. Windows process-tree termination remains unchanged.

Parent review disposition: accept the completed-child false-success finding and fix it with a discriminating regression. The separate live-child/foreign-listener attribution race exists unchanged on the pinned base. This extraction does not introduce a health identity protocol or claim to fix that baseline property. The issue requires preserving launch behavior and distinguishing process failures; the correction rejects observed process exit, while preserving existing health semantics. The earlier design sentence implied stronger attribution than the implementation or issue promised; corrected above. Reviewers must assess this explicit scope decision, not treat it as proof of authenticated readiness. Bundled/portable launch artifacts may not exist in this worktree; report that proof boundary rather than claim a packaged launch.
