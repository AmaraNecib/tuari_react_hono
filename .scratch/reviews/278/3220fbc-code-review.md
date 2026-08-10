# Code Review — issue #278

**Head SHA:** 3220fbc2df8b06890c8bd75d4d165fdbf1e3fa42
**Base SHA:** 03ec349
**Tier:** Standard
**Commits:** c9ea035 (refactor), 698694d (test-audit fix), 3220fbc (code-review fix)

## Standards

Two parallel sub-agents (Standards + Spec) reviewed `git diff 03ec349...HEAD`
against the repo's documented standards + the Fowler smell baseline.

**No blockers.**

- Dead-code removal verified real: zero references to
  `queryAuthValidated`/`mutationAuditValidated`/`mutationAuditRateLimitedValidated`
  or `InputValidator` anywhere in `apps/` (repo-wide grep). The deleted
  `*Validated` variants were speculative generality + middle men — the change
  removes smells, adds none.
- Wire-gate claim corroborated against `@orpc/server` dist
  (`if (result.issues) throw new ORPCError("BAD_REQUEST", { message: "Input
  validation failed", data: { issues } })`), matching the web extraction, the
  router test pin, and the e2e.
- `extractRpcIssueMessage` ordering correct: the Error-instance branch runs
  after the object branch, so wire-gate errors (Error + data.issues) resolve
  via issues.
- Notes (non-blocking): e2e zod-message-text and RPC-URL coupling (documented
  in the design's Risks section); `WireGateError` fixture is an intentional
  test double.

## Spec

Issue #278 offered two fixes: (A) attach `data.issues` to the VALIDATION
ORPCError + align the web string, or (B) drop the double validation and rely on
the ORPC wire gate. The implementation chose **Option B**, which the spec
explicitly sanctioned ("Or drop the double validation and rely on the ORPC wire
gate (which yields structured BAD_REQUEST with issues)").

**No blockers — all spec asks delivered:**

- `input-validator.ts:41,59` (the divergent VALIDATION error the spec quoted)
  deleted; the wire-gate error shape matches the spec's description exactly.
- Test pinning the error shape end-to-end: router.test.ts wire pin (code /
  message / data.issues with field path), web extraction tests, Playwright
  e2e (validation-toast.spec.ts).
- Minor finding (fixed): `buildErrorMessage` fell back to the raw generic
  "Input validation failed" message when no issues were attached — the exact
  UX the issue exists to eliminate. Now suppressed there too (commit 3220fbc),
  so the localized fallback wins; doc comment no longer overpromises.
- Minor (accepted): docs/REFACTORING_TASKS.md rewrite (the old checklist
  referenced the now-deleted InputValidator) and the scan-all-issues
  extraction are slight scope beyond the letter of the spec — both benign,
  tested, and directly serve the issue's intent.

## Verdict

Safe to push: no actionable findings; the one minor (generic string reaching
users) was fixed and re-tested (24/24 web extraction tests, full web suite
403/403, full e2e 24 passed / 2 skipped).
