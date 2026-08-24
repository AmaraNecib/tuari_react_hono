# Issue #44 local code review

**Reviewed SHA:** `7152426`
**Base:** `0165b7e` (`origin/develop`)
**Review mode:** local standards/spec review; Greptile disabled by session policy.

## Standards

- The changes stay in E2E helpers, a new E2E spec, and the issue design record; no production code or API contract changes.
- Fixtures are reset and seeded per test, and the existing `bootstrapOrSignIn`/snapshot flow is reused.
- Selectors use accessible roles and labels for user-facing controls. The collision test uses the semantic `main` landmark as the shell scroll container rather than a generated utility-class selector.
- No actionable standards violations found.

## Spec

- Normal viewport geometry checks popup, selected option, and popup target placement.
- A 900x700 real browser viewport moves the trigger to the nested shell edge and verifies collision flip plus popup/target viewport bounds.
- Keyboard selection sends three `ArrowDown` events and `Enter`, then checks the human-readable label and rejects the raw ID.
- Twelve open/click/close cycles cover click flakiness and label persistence.
- Invoice debt flow and warehouse manager consumer are exercised.
- No production scope creep found.

## Validation

Focused regression spec: 5 passed.
Full Playwright suite: 59 passed.
Web tests: 634 passed.
API tests: 1255 passed, 1 skipped.
Typecheck: passed.
Lint and repository hygiene gates: passed.
