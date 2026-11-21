# Export the checked ZIP path

## Scope and authority

The base is `4f0e7fc7c469bef81eace3f0ec6b26d77ff641b2`. The owner authorized autonomous repair of the Nightly build. Verification uses focused local tests and enforced CI-final gates. The owner selected light parent inspection plus Greptile rather than three local review sessions. Current-head CI acceptance, Greptile 5/5 and effective protection still gate merge.

## Captured failure

Nightly run `44615864452` confirmed that proof child PID 6908 closed with exit code 0 before candidate publication. The Windows Shell check then saw `Tuari.exe` and `bin`. The manifest step nevertheless received an empty portable ZIP path.

The Shell step checked `$LASTEXITCODE` after invoking a PowerShell script, not a native command. In a fresh shell, `$LASTEXITCODE` is null. The comparison `$null -ne 0` evaluates to true, so `exit $LASTEXITCODE` returns before the step writes to `GITHUB_OUTPUT`. The step can therefore appear successful without exporting its path.

## Correction

Use terminating PowerShell error handling for the script invocation. Remove the native exit-code check and export the selected path only after the script succeeds. The Shell check, checksum, signature and staging continue to use the same ZIP. No packaging or cryptographic gate is removed.

The regression replays the actual workflow run body with `$LASTEXITCODE` explicitly null, a real packaged ZIP visible through Windows Shell, and a dedicated `GITHUB_OUTPUT` file. It requires an exported path that resolves to the exact selected archive. Native path normalization handles `RUNNER~1` and `runneradmin` spellings without accepting a different file.

The Windows CI job explicitly runs this archive and output test alongside the proof lifecycle test. Changes to `.github/workflows/nightly.yml` now activate that job even when no other file changes. A selector regression covers this dependency.

## Verification and limits

The actual workflow replay passed locally in 7.11 seconds after correcting the path-identity assertion. Earlier, a test-name filter failed to select the intended integration case; that execution is not counted as integration proof. The authoritative replay log is `.scratch/sessions/pr572-alias-identity-green.log`.

The captured hosted assertion failure compared two spellings of the same Windows path. It was a test-oracle error, not a production output or encryption failure. Focused CI and workflow tests, plus actionlint, must pass after the selector correction. The ZIP implementation and prior real-runtime encryption proof are unchanged.

No Node version, dependency, source version or stable-release policy changes are included. The historical persistent rename report identified a self-owned native DLL, but did not prove it was the only blocking handle. This output correction makes no additional claim about that failure.
