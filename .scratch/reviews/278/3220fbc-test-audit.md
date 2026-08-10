# Test Audit — issue #278

**Head SHA:** c9ea035e410fa104d01d38c302a4291dd9c78cd9 (test-audit run; extraction
fix landed on top and re-verified below)
**Base SHA:** 03ec349
**Tier:** Standard

## Process

Three parallel sub-agents (edge case hunter, coverage analyst, quality reviewer)
reviewed the diff `03ec349...HEAD` plus the exercised sources
(`rpc-error-handling.ts`, `rpc-middleware.ts`, the ORPC wire gate in
`@orpc/server` dist).

## Edge Case Hunter

Verified against the wire-gate source (`server.Ds4HPpvH.mjs:155-173`:
`if (result.issues) throw new ORPCError("BAD_REQUEST", { message: "Input
validation failed", data: { issues: result.issues } })`) that the pinned
behaviors are real. **No blockers.**

- 🟠 Empty/whitespace first issue message with a valid `issues[1]` — the
  extractor only examined `issues[0]`. **Fixed:** `extractRpcIssueMessage` now
  returns the first issue with a non-empty message (loop, not index 0); test
  added ("skip an empty first issue message and use a valid later one").
- 🟡 Wire-gate Error instance with an empty `issues` array untested (`[]` is
  truthy so the gate can attach `[]`). **Fixed:** test added ("return null for
  a wire-gate error with an empty issues array").
- 🟡 Defensive branches (`data.issues` non-array, `issues[0]` non-object) —
  pre-existing defensive checks; low value, left as-is.
- 🟡 Issues-first ordering now shadows a non-generic handler message whenever
  `data.issues` is present — intended per #278 (only the wire gate attaches
  issues).

## Coverage Analyst

**No blockers.** Every acceptance criterion from #278 has a test:

1. Field paths preserved on the wire → `router.test.ts` "attaches zod field
   issues to the wire-gate validation error" (code/message/data.issues with
   `path: ["name"]`), tolerant via `arrayContaining`/`objectContaining`.
2. Web surfaces the field message, not the fallback →
   `rpc-error-handling.test.ts` WireGateError-shape tests + issues-first
   precedence + `buildErrorMessage` fallback test; e2e `validation-toast.spec.ts`.
3. Middleware removal leaves no uncovered production branches —
   `rpc-middleware.ts` variants were never invoked; `input-validator.ts` had
   zero consumers (verified with `git log -S` + repo-wide rg).

Notes: `bootstrap.service.test.ts` fieldErrors assertions are service-level and
unrelated to the removed InputValidator.

## Test Quality Reviewer

**Grade: B+** (would be A given the e2e was executed by the implementing agent
and passed: 24/24 + 2 skipped on the full suite, workers:1).

- Meaningful assertions: strict `toBe` in web tests; `toMatchObject` +
  `arrayContaining` wire pin; asserts `bootstrapFirstUser` NOT called (gate
  fired before handler).
- Async handling correct (`await expect(...).rejects.toMatchObject(...)`).
- Setup duplication in `router.test.ts` (new test reuses the harness of the
  preceding test) — consistent with the file-wide pattern, low severity,
  intentionally a separate contract pin.
- e2e `getByText(/160/)` coupled to zod's default max message — verified the
  actual message contains "160" during implementation; low risk.

## Verdict

No blockers. Two orange/yellow findings fixed (issues scan + empty-issues test).
Evidence of the fix: `rpc-error-handling.ts` loops issues; 23/23 web tests pass;
full suite re-verified green (guard Phase 1 re-run after the fix commit).
