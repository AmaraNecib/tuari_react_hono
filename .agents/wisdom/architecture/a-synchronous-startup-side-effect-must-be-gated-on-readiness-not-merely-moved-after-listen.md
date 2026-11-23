## A synchronous startup side-effect must be gated on readiness, not merely moved after `listen()` (🟠 Major)

On #430 the daily backup's `VACUUM INTO` is synchronous and can outlast the
desktop shell's 15s `/health` wait. The first fix moved the call after
`serve()`: but calling an `async` function whose body has no `await` runs it
*in the current tick*, before the event loop can deliver the `listening` event
or read a queued health probe. `setImmediate` is not enough either: if no
probe is pending when the check phase runs, the snapshot blocks the loop and a
later `/health` stalls anyway. A safety feature then causes the exact boot
failure it exists to prevent.

**Always**: for a synchronous, potentially long side-effect on the startup
path, gate the *first run* on proven readiness (the first `/health` response),
defer it a turn, and keep a fallback timer for a deployment nobody probes.
Assert it in a test that serves `/health` against a deliberately blocking fake
and checks the response lands while the fake is still only scheduled. "Run it
after `serve()`" and "never await it" do not make a synchronous call
non-blocking.
