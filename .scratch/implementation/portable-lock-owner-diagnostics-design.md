# Portable rename diagnostics corrections

## Scope and authority

This lane fixes the three hosted findings on PR #569. The isolated worktree is `D:/worktrees/tuari_react_hono/t3-e6947dc5-203f09f5eb6d202d`, based on `8be50658891315f8697f73c17e635bca80647706`. Verification mode is `focused-local / CI-final-enforced`; strict ruleset `26837184` requires current-head `CI acceptance` from app 15368 without bypass. The parent selected light inspection and Greptile instead of three local review sessions for this lane. Publication and hosted gates remain parent-owned.

Only portable rename diagnostics and their tests change. Packaging's primary exit code, rename retry delays, process handling through Restart Manager, artifact upload scope, and unrelated signing, licensing, encryption, smoke and merge policy remain unchanged. No package, runtime, version or privilege changes are allowed.

## Findings and changes

1. Restart Manager's `FILETIME` halves are signed in the COM struct. Reinterpret each half with `unchecked((uint)...)` before combining the bits. The expected-result test uses FILETIME `0x01D5C03680000000`, whose independently specified UTC value is `2020-01-01T00:00:38.5548288Z`; its low half is negative as a signed integer.
2. The second `RmGetList` call may return fewer owners than the allocated array length. Project only the first returned `$count` entries. The regression test allocates three default entries and projects a returned count of zero; no PID 0 entry may escape.
3. Run each WPR diagnostic subprocess with a 15-second deadline. On timeout, terminate only the exact subprocess started by this wrapper and wait up to five more seconds. Log timeout/failure and proceed to packaging. A timed-out WPR start may already have begun a recording; record that state as uncertain and do not issue a stop. A successful start owns its per-instance trace, which the wrapper stops through a separate bounded WPR subprocess.

The wrapper calls packaging after any WPR status/start failure. It returns the packaging exit code unchanged, so later failure upload handling remains available. The diagnostic helper accepts internal arguments; no production CLI override exposes a different package command or WPR target.

## Test seams and proof

`portable-diagnostic-process.ps1` owns the bounded process wait and kill of its exact `Start-Process` child. The capture script's callable function permits a test-only scriptblock runner after dot-sourcing; normal invocation still uses the fixed `pnpm --filter @tuari/desktop portable:only` command. Tests cover an owned stalled PowerShell fixture, start timeout uncertainty, nonzero diagnostic start, successful start/stop, package exit preservation, and continuation into later evidence handling.

The Restart Manager helper provides the real FILETIME conversion and returned-count projection used by the production loop. The expected UTC timestamp is a fixed contract value, not computed through that conversion. Tests do not start WPR recording on the owner's machine.

## Remaining limitations

The hosted persistent rename owner remains unknown. Empty Restart Manager results do not establish that no process holds the directory. This lane does not test a live WPR recording or identify whether a timed-out WPR start left one active. A future failed hosted packaging run must provide scoped evidence before the owner can identify the persistent holder.
