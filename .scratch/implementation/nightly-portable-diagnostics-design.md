# Portable rename diagnostics

Base: `0afcf2964a157f48370d267e17b200a1c0c1e30d`. Branch: `diagnose/nightly-portable-rename`. Worktree: `D:/worktrees/tuari_react_hono/t3-412838f5-c2c7983838174217`. Owner approved a GitHub diagnostic build that uploads trace artifacts without publishing Nightly. This is instrumentation, not a production fix or merge request.

## Known failure and rejected explanation

Nightly44489448595 failed with EPERM renaming the portable candidate directory after encryption proof. Loading a real SQLite DLL did not reproduce that rename failure once the test used an absent destination. The earlier claimed reproduction used an already populated destination and was invalid. Full original and subprocess-modified packaging both passed locally with a real built API runtime, encrypted database and backup proof, and ZIP output. Neither execution explains the hosted refusal. Do not claim subprocess isolation fixes it.

## Diagnostic interface

The existing Nightly workflow accepts diagnostic_only, false by default. A true manual input excludes the release job and enables a separate contents-read diagnostic job. It checks out the dispatch SHA, not develop. A separate concurrency group prevents this diagnostic from cancelling normal Nightly. No version patch, signing secrets or release operations run in this mode.

The job builds the same desktop executable and runtime, then runs exactly one unchanged portable:only command under built-in Windows Performance Recorder FileIO, Minifilter and Handle profiles. The wrapper records source SHA, UTC times, native packaging and trace-stop exits, process image identities and minimal candidate/output file metadata. It does not dump environment variables, command lines, package archives or database contents. It refuses log-directory overwrites and never cancels another recording. WPR start failure prevents packaging instead of pretending a trace was captured. Trace stop runs in finally only after a successful owned start. Packaging failure remains failure even when trace capture succeeds.

Only the diagnostic output directory is uploaded, always, using the existing pinned first-party upload action, with three-day retention. A successful packaging run means failure was not reproduced, not fixed. ETL contains runner filesystem/process information and is intentionally short-lived. Tool/profile/elevation availability on windows-latest must be checked by the run; local profile discovery confirms the named built-in profiles but is not hosted capture proof.

## Verification and authority

Tier: High-assurance because this touches CI instrumentation. Owner authorized this narrow diagnostic and light local parent inspection, not a release-policy bypass. Parent inspected both mutually exclusive job conditions, read-only permissions, exact SHA checkout, output scope, absence of secrets/release commands and native exit propagation. Architecture: one explicit diagnostic CLI adapter, no production packaging seam or domain model change. No dependencies or tools downloaded.

Mode: focused-local / CI-final-enforced. Current ruleset26837184 requires strict CI acceptance and no bypass for merges. No merge is planned for the diagnostic branch. Production fixes still need current-head CI acceptance and Greptile5/5 before normal merge. Diagnostic dispatch is an owner-authorized remote investigation, not acceptance of a product change.

Focused workflow-policy and CI-final tests passed16/16, no skips. These protect declarative safety configuration; they do not prove privileged WPR capture. PowerShell parser and actionlint passed. No local privileged recording or full desktop build was run for this instrumentation. Hosted execution must prove trace start/stop and artifact collection. Prior failed logs and unrelated synthetic backups remain untouched.
