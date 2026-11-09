## Zod refine() fires even on empty strings: guard with `value.length === 0 ||` (🟡 Minor)

On #250, adding `.refine((v) => /[^\p{Cf}]/u.test(v))` after `.min(1)` on the
bootstrap `name` schema made an EMPTY name produce TWO zod issues (`too_small`
from min + `custom` from the refine), doubling the service's fieldErrors and
breaking four existing tests. Zod chains run refinements on every value that
reaches them, including ones a sibling check already rejects. Fix pattern:
`.refine((v) => v.length === 0 || /[^\p{Cf}]/u.test(v), ...)`. The empty guard
defers to `.min(1)` so an empty name still yields a single "required" issue.

Also: a `custom` (refine) issue code is neither `too_small`/`invalid_type`
(required) nor the format codes. The service message map needs its own branch
or it falls into the generic format bucket with misleading copy (e.g. the
too-long name message). Prefer a full `Record<BootstrapInputField, string>`
keyed by field so a future refine on another field forces a copy decision
(compile-time) instead of a silent wrong message; property access keeps 100%
branch coverage (an `??`/`&&` fallback branch would be uncoverable today).

**Always**: when adding a `.refine()` to a schema field that also has
`.min()`/`.max()`, guard the refine for the empty case, and add the `custom`
issue code to any user-facing issue→message map.


