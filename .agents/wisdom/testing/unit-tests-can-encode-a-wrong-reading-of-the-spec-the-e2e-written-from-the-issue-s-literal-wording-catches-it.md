## Unit tests can encode a wrong reading of the spec; the E2E written from the issue's literal wording catches it (🟠 Major)

On #411 the expenses list was implemented with `includeVoided: false` by
default, so a voided row disappeared from the screen. Every unit test passed
because they asserted that same invented behaviour. The issue's rule was
"Void, never delete: the row stays visible, excluded from totals" — the
mockup hint said the row stays struck-through. Writing the Playwright spec
straight from that sentence (void, then assert the row is still visible and
the total dropped) exposed the contradiction before the PR; the fix was to
always return voided rows and exclude them from totals/groups only.

**Always**: when a spec states an observable UI rule ("stays visible",
"excluded from totals"), assert it literally in the E2E before trusting a
green unit suite — a unit test built from the implementation can only confirm
the implementation.

