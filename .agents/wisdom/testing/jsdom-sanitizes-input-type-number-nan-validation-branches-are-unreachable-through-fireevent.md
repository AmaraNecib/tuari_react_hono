## jsdom sanitizes `<input type=number>`: NaN validation branches are unreachable through fireEvent (🟡 Minor)

On #42, a client-side paid-amount guard added `Number.isFinite(Number(value))`
plus a test that `fireEvent.change(input, { target: { value: "abc" } })` would
reach the NaN branch. It did not: jsdom implements the number-input value
sanitization algorithm, so a non-numeric value collapses to `""` — and
`Number("")` is `0`, so the value was treated as valid `0`, not NaN. The test
failed; the branch was provably dead through the UI and was removed (the
existing repo check style also skips NaN guards). Applies to any
`type="number"` field: you cannot drive an invalid numeric string into state
via RTL, and an `isFinite` guard on such a field is dead code.

**Always**: before adding a NaN guard or a "garbage value" test for a number
input, confirm whether the component controls its own value (raw string state
on a text input) or the browser/node sanitizes it. An unguarded `Number("")` → 0 already
matches the pre-sanitized input, so no extra guard is needed.


