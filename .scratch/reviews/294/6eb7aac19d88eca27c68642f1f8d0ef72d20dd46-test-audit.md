# Test Audit — Issue #294 (head `6eb7aac`)

Tier: **Standard** (web UI/lib). Base: `03ec349` (origin/develop). Three parallel
reviewer sub-agents: Edge Case Hunter, Coverage Analyst, Quality Reviewer.

## Verdict

**Quality Reviewer grade: A** — mock-strategy upgrade (`importActual` + override so
the hook test exercises the real translation seam) was called "the diff's best move";
the negative pin (`not.toHaveBeenCalledWith(expect.stringContaining("Invalid phone
number"))`) directly encodes the issue's regression condition. No 🔴 findings.

## Findings fixed (all applied + committed in `6eb7aac`)

| # | Finding (severity) | Fix |
|---|--------------------|-----|
| 1 | Whitespace-internal normalization: `"Invalid  phone number or password"` (double space / newline) missed the map → raw English surfaced (🟠) | `normalize()` now collapses `\s+` → single space after `trim().toLowerCase()`; pinned with a test (`"Invalid  phone\nnumber or password"` → Arabic) |
| 2 | Uppercase/mixed-case map matching untested (🟠) | Test added: `"INVALID PHONE NUMBER OR PASSWORD"` → Arabic |
| 3 | Nested `{ error: { message } }` extraction branch completely untested (🟠) | Test added: `{ error: { message: "Invalid password" } }` → "كلمة المرور الحالية غير صحيحة." |
| 4 | `statusText`-only object branch untested (🟡) | Test added: `{ status: 401, statusText: "Unauthorized" }` → unchanged |
| 5 | Blank/whitespace inputs → fallback untested (🟡) | Tests added: `""`, `"   "`, `new Error("   ")`, `{ message: "" }` → fallback |
| 6 | **Inline auth-error path uncovered** (coverage analyst): `home-view-auth-controller` `setAuthError(extractAuthErrorMessage(...))` never asserted translation; E2E `.first()` could match toast OR inline (🟠) | New controller test: sign-in rejects with the better-auth error object → `authError` = "رقم الهاتف أو كلمة المرور غير صحيحة." |

## Findings dismissed

- E2E should assert English *absence* (🟡): the unit negative pin in the hook test
  already encodes it; an extra `toHaveCount(0)` risks flake for marginal value.
- Empty fallback string `extractAuthErrorMessage(null, "")` (🟡): returns fallback
  as designed; not worth a test.
- Per-test `await import("./auth-api")` duplication: pre-existing pattern inherited
  by the new tests; out of scope.

## Evidence

- Fix commit: `6eb7aac` — 3 files, +68/−1.
- Verification after fixes: `pnpm test:web` 410/410, typecheck + lint green.
- E2E (`admin-account.spec.ts`, 4 tests incl. narrowed Arabic assertion) passed
  locally against live servers before this round; the narrowed assertion is
  unaffected by these test-only additions.
