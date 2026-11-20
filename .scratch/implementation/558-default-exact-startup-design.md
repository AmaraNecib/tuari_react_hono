# Normal exact startup

## Authority and scope

Base is `4183fe9d416084bbb24ecfe094678c743b0915d2`. Worktree is `D:/worktrees/tuari_react_hono/t3-1e11d799-630170e58d6f18bb`. Owner approved the exact application root as the normal default and refusal of incompatible files. Mode is `focused-local / CI-final-pending`, high-assurance because startup selects persisted financial data, auth and encryption. No publication is authorized. The parent owns three review lenses, architecture review and final integration acceptance.

The normal entry now calls `createFreshExactAppDependencies` with the existing validated config. There is no fallback to `createAppDependencies`. That older root, numeric services and fixtures remain for a separate cleanup. No schema, arithmetic, published contract, UI or navigation changes ship here.

## Interfaces and vocabulary

Normal startup means executing `apps/api/src/index.ts`, including config loading, composition, HTTP bind, readiness-triggered backup and shutdown installation. Exact application means the existing fully attested graph, not a second financial model. A genuinely empty file initializes; legacy, partial and physically tampered files stop startup without conversion, rename or deletion. Errors remain `Failed to start API` plus the underlying cause. This does not invent a recovery policy.

The existing entry and HTTP interfaces are the agreed test seams. No new startup wrapper or dependency selector was introduced. Deleting the composition root would redistribute auth, finance, catalog, payroll, reports and lifecycle wiring across callers; it earns its depth. The only new variation is test execution of the same entry as source or packaged CJS. Domain terminology and published interfaces did not change.

## Source and package compatibility

Real keyed source startup exposed `require` being unavailable in ESM inside the database factory. Use `createRequire` with `import.meta.url` for source and `__filename` for the CJS sidecar. This preserves the configured key and both native drivers rather than weakening encryption or adding packages.

The actual sidecar script builds the API executable from `src/index.ts`. Its declaration pass failed with TS4041 on inferred repository getters and TS7056 on the inferred router type. The executable exports no library interface. Disable declaration emission for that executable, retaining ordinary API and contracts `tsc --noEmit` proof and generated contracts declarations. This is not a contract or typecheck waiver. Parent review must include this bounded build-config change.

Rust debug launch runs `pnpm --filter @tuari/api dev`; release runs bundled Node with `bin/api-runtime/dist/index.cjs`. Both receive the database/config environment. A queued actual `build-sidecar.mjs` run succeeded, including its copied native prebuild probe. Tests also executed the produced CJS with the copied Node executable. No installed Tauri shell, installer, cleared-environment desktop launch or browser matrix was executed.

## Proof and history

The earlier draft commit changed only entry and design. Tests were added afterward; this is not claimed as test-first implementation. The first real entry run caught the keyed ESM failure. A deliberate old-root mutation then failed both fresh entry cases at authenticated `financial/metadata`, receiving 503 rather than 200. The original entry was restored in `finally`. Earlier failed logs remain local, including harness repairs for Windows loader URLs, subprocess ownership, setup-status field names and asynchronous backup completion.

The six normal-entry regressions cover empty plain/keyed files, health, HTTP bootstrap and real phone/password authentication, anonymous refusal, exact metadata and decimal-string reports, stale numeric report refusal, readable plain/keyed snapshots, session persistence on reopen, three incompatible-file byte-preservation cases and unsupported adapter rejection before file creation. They pass against source and the generated packaged entry. Generated `@tuari/contracts/dist` was built in this worktree and used without source aliases.

Direct existing tests cover config loading, license gates, Hono transport/health/bootstrap, shutdown callbacks, encryption/key management and backup scheduler/service/settings/snapshot behavior. Existing selected-graph tests remain the authority for the broader reviewed catalog/security/workforce/earnings/payroll/project-cost/inventory/invoice/debt/expense/report/log/attachment graph; they are not duplicated here. Windows termination of subprocesses is not evidence of POSIX signal delivery; the direct shutdown tests verify those callbacks.

## Bounded correction after initial review

All three complete initial lenses at `1c1a1dec` requested changes. Debate and code-review identified the same P2 defect, F1. The factory enabled persistent WAL before schema attestation, so an incompatible DELETE-mode file could be refused with changed bytes. The original refusal fixtures were already WAL and missed that transition. Two new legacy/partial fixtures use the raw installed driver, explicitly establish DELETE mode, close the file, capture bytes, then run the real entry. Before the fix both failed with changed header bytes. These failures are retained as business-red evidence, not mutations.

The factory now accepts a trailing `journalMode` option. Its default remains WAL for existing callers; exact startup opens with `preserve`, applies the key and connection-local settings, then runs the same transactional initialization/attestation. Only after that transaction commits does the exact root enable WAL. Failure still closes the handle. There is no read-only preflight, compensating journal-mode rewrite, schema change or fallback. This factory option is the only moved interface seam; it keeps persistent startup ordering local to the root rather than distributing attestation knowledge into unrelated callers.

F2 adds config-valid `DB_ADAPTER=inmemory`, retaining the invalid-postgres case. It asserts the root's sqlite-only error, nonzero exit and absent database. Removing only the root guard makes the test fail when the server listens instead of refusing. The mutation was restored and is not a claim that the current guard was broken.

F3 adds config-file-only encryption with inherited `APP_DB_KEY` deleted from the child environment. Plain startup writes valid `{}`; the environment-key case uses a different valid file key to prove environment precedence. The config-only case reuses real HTTP auth, literal-key snapshot reads, database reads and session reopen. Keyed files must lack the plaintext SQLite header and reject an independent wrong key. Dropping only `appConfig.databaseKey` in a temporary root mutation makes the config-only case fail reading its snapshot with the literal key. The mutation was restored; current key forwarding was already correct.

The expanded ten-case normal-entry matrix and affected storage/lifecycle cases pass. The exact startup cases assert accepted files end in WAL, while the raw refusal cases assert unchanged closed bytes and persisted DELETE mode. Generated contracts remain the worktree's existing reviewed dist, without aliases or a redundant rebuild. Actual sidecar rebuild and copied-Node execution are required because ordering changed in the factory; no full suite, browser matrix or installed shell is justified by this bounded correction. Parent acceptance needs one fresh combined-delta review carrying forward unchanged initial conclusions, not three repeated initial lenses.

## Environment and limits

Ignored junctions reuse existing installed dependencies. The API's contracts link points to this worktree, and only this worktree's contracts dist was generated. No package or browser was downloaded and no shared dist was overwritten. Initial C free space was 3.4 GB and D was 417 MB; later C fell to 65 MB, so final test databases used a fresh ignored directory on D. No unrelated cleanup was performed.

Logs, failed attempts, scripts and the built sidecar are retained under ignored `.scratch/reviews/558-default/`. Post-commit checks and fingerprints are recorded there. The initial local review lenses are complete with the findings above. Fresh combined-delta review, installed desktop acceptance, hosted CI and effective protection remain parent-owned and unclaimed.

Applied lessons: generated contracts can mask changes, exercise shipped SQLCipher prebuilds, gate backup on readiness, allow cold composition startup time, and route config through the composition root. The historical schema-less database trick was excluded because startup intentionally attests complete schema. The SystemRoot desktop lesson limits the packaged subprocess claim; this did not execute the Rust shell's cleared environment.
