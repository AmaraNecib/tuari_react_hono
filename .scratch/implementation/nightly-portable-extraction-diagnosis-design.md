# Nightly portable ZIP diagnosis

## Pinned scope

- Worktree: `D:/worktrees/tuari_react_hono/t3-7c5770ea-094ac8405e02bb5a`
- Starting HEAD: `0840901048deaa346f45f8444abfc26d9603e6ac`, merge of diagnostic parent `e9f0855e8a3955d50b7021ed89d6e17ba1606469` and `origin/develop` at `f66acaf78a18893b51921352adc832d02a5a537e`
- Verification mode: `focused-local / CI-final-enforced`, strict ruleset `26837184`
- Review: High-assurance CI/release scope. Owner authorized Greptile plus light parent inspection instead of three local review sessions. No remote dispatch, PR, push, merge, or schedule.
- Scope: artifact-only `scripts/smoke/trace-portable-packaging.ps1` instrumentation. The release verifier and portable packager are unchanged.

## Observed facts

- `NormalNightly44520207731` at `f66acaf` passed app build, portable encryption proof and ZIP creation, manifest creation, and Ed25519 signature verification.
- Its `Smoke test nightly artifacts` step found `tuari-0.1.0-nightly.517-nightly-portable.zip`, then reported `Portable zip does not contain Tuari.exe`. Signature verification passed. Installer smoke did not run. No release was published.
- `scripts/verify-release-assets.mjs` invokes Windows PowerShell `Expand-Archive`, considers child-process status zero sufficient, omits stderr on that path, searches extracted files recursively, and removes `.verify-tmp` before raising the missing-executable error.
- The failed runner's ZIP is unavailable. A prior nightly passed this asset check and later failed actual installer smoke. These facts do not establish that the archive producer omitted the executable or that `Expand-Archive` failed.
- The parent-provided real ZIP is 51,118,295 bytes with SHA-256 `FD6CD37113FC01F61A582FD57FF0928F7146A12A2079AD64678F5119FF55A5F7`. Its central directory contains `./Tuari.exe` (111-byte desktop executable placeholder), 170 entries total. Windows `tar -tf` exited 0 and listed it. Independent Windows `Expand-Archive` exited 0 with no stderr and extracted 140 files including `Tuari.exe`. The real CLI verifier exited 0 against that ZIP and a throwaway locally generated Ed25519 fixture. No owner signing material was used.
- The fixture's executable is a placeholder. This proves archive inspection and extraction behavior only, not native desktop launch or the failed nightly's exact ZIP.

## Hypotheses still open

1. The failed ZIP central directory lacked `Tuari.exe`, possibly because packaging copied an incomplete producer directory. A producer snapshot and central-directory entry list will distinguish this from extraction loss.
2. The entry existed but PowerShell extraction emitted nonterminating errors and returned zero. Separate captured stdout/stderr, exit status, and extracted inventory will test this. A strict-error-mode comparison will show whether error mode changes the result.
3. The entry existed but extraction was partial or affected by runner filesystem/quarantine timing. WPR will now cover packaging and both extraction attempts. A trace cannot identify a cause without the archive metadata and event detail.
4. A verifier-specific search or cleanup behavior obscured the state. Comparing central-directory names, `tar` listing, extraction inventories, and verifier result will narrow this case.

No hypothesis is confirmed. External quarantine or transient filesystem conditions remain possible and are not proven by a local successful run.

## Diagnostic change

The existing manual `diagnostic_only` job remains read-only, artifact-only, and separate from the scheduled release job. Its WPR capture now spans one package attempt and inspection. It selects the ZIP named by the packager log, including the `Tuari-portable-new.zip` rename fallback, and records producer `Tuari.exe` presence, size and SHA-256; ZIP path, size and SHA-256; central-directory full names and lengths; tar listing, matches and exit; original-mode and strict-mode PowerShell stdout/stderr, process exits and extracted file inventories. Packaging and inspection status remain separate. Missing executable evidence is labeled with cause unknown.

Both extraction destinations are unique GUID directories under the runner temp directory, outside the uploaded evidence folder. The script removes only that owned extraction root after collection. No archive, runtime, database or binary is uploaded. Retention stays three days. Defender event collection was not added because it is optional and the target runner's event-log permissions are unknown.

The diagnostic does not publish a release, use signing secrets, alter versioning or concurrency, invoke a hosted workflow, or change production packaging or release verification. A successful diagnostic means only that this local runner attempt completed; it is not a Nightly pass.

## Seam and production status

The existing CLI verifier is the asset-check seam, and the supplied ZIP exercised its real Windows path. That run succeeded, so the reported failure was not reproduced. The fail-run archive is still needed to decide whether its central directory or extraction differed. No production fix is justified by current evidence. Keep the executable-presence, signature, encryption and actual-artifact smoke gates intact.

## Proof and limits

Run the focused verifier and workflow-asset tests, PowerShell parser validation, and `actionlint`. Do not run a desktop build, browser run, hosted workflow, installer smoke, or full suite. Parent should inspect the instrumentation and decide when to request an owner-approved diagnostic run.

Wisdom applied: desktop wisdom index and `env_clear()` sidecar lesson read. That lesson concerns child runtime environment and does not explain ZIP entry loss or extraction. `codebase-design`: the CLI verifier remains the test seam; instrumentation adds observations, not a production adapter or new release behavior. Domain vocabulary remains unchanged.
