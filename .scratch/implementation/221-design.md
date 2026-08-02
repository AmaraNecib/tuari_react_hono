# Issue 221 — Security schema hygiene: trim recovery/DB key inputs, discriminate changeDbKey output

**Tier**: High-assurance (recovery-key / DB-encryption-key contract surface — the
`security.ts` schemas are public package surface since #206 re-exported them from
the index).

**Base**: `origin/develop` @ `f93c37c0dd91646bfdc106c0e0bcc05b149b9e0c`
(branch `refactor/issue-221-security-schema-hygiene` sits exactly on it).

## Problem

Two findings from the #206 adversarial debate on `packages/contracts/src/security.ts`:

1. **Whitespace-only secrets pass validation.** `consumeRecoveryKeyInputSchema.key`
   and `revokeRecoveryKeyInputSchema.keyId` use `z.string().min(1)` — `"   "` passes
   (the issue notes a 3-space string passes). `changeDbKeyInputSchema.newKey` uses
   `min(8)` without `.trim()` — 8 spaces passes and would become the PRAGMA rekey
   value. `currentKey` has the same `min(1)` gap. Practical risk is low today (a
   whitespace key can never match a stored SHA-256 hash, so consume/revoke just
   fail), but `.trim().min(...)` is the obvious hardening on a recovery-key /
   DB-rekey surface, and trimming improves UX for copied keys with trailing
   whitespace (the handler compares against the stored hash / PRAGMA key, so the
   trimmed value is the one that matters).

2. **`changeDbKeyOutputSchema` allows logically invalid combinations.**
   `{ success: false }` without `error`, and `{ success: true, error: "..." }`
   both validate under `z.object({ success: z.boolean(), error: z.string().optional() })`.
   The handler (`apps/api/src/rpc/handlers/system.ts`) only emits valid pairs, so
   no live bug — but the schema is now public contract surface and should encode
   the invariant.

## Public API changes (`packages/contracts/src/security.ts`)

```ts
// before → after
key: z.string().min(1)                      → z.string().trim().min(1)     // consumeRecoveryKeyInputSchema
keyId: z.string().min(1)                    → z.string().trim().min(1)     // revokeRecoveryKeyInputSchema
currentKey: z.string().min(1)               → z.string().trim().min(1)     // changeDbKeyInputSchema
newKey: z.string().min(8)                   → z.string().trim().min(8)     // changeDbKeyInputSchema
```

```ts
// before
export const changeDbKeyOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
})

// after — discriminated union; strict members so the invalid
// `{ success: true, error }` combination is REJECTED (zod's default object
// mode would otherwise strip the unknown key instead of rejecting it).
export const changeDbKeyOutputSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true) }).strict(),
  z.object({ success: z.literal(false), error: z.string() }).strict(),
])
```

Inferred type narrows from `{ success: boolean; error?: string }` to
`{ success: true } | { success: false; error: string }` — the handler's two
return sites (`{ success: true }` and `{ success: false, error: "..." }`) are
both assignable.

**Deliberately NOT trimmed** (documented scope decision): `changeAppPasswordInputSchema`
fields. Passwords may legitimately contain leading/trailing whitespace and trimming
would silently alter the secret — the issue's title scopes this to "recovery/DB key
inputs", and the two findings never mention the app-password surface.

Verified empirically on zod ^4.0.5 (this repo's version):
- `z.string().trim().min(8)` — trim runs before min: `" 12345678 "` → `"12345678"` ✓,
  `"  1234567  "` (7 after trim) ✗, `"        "` (8 spaces) ✗.
- strict discriminated union — `{ success: true }` ✓, `{ success: false, error }` ✓,
  `{ success: false }` ✗ (invalid_type), `{ success: true, error }` ✗ (unrecognized_keys),
  bad discriminator ✗.

## Dependencies

None new. `security.ts` only depends on `zod` (already externalized in the
contracts tsup build). No TS4058 risk (no rawDb param typing; annotated exports).

## Planned tests (TDD, two seams)

**Seam 1 — contract schema surface** (`packages/contracts/src/index.test.ts`,
extend the existing `#206` security block, add `changeDbKeyOutputSchema` import):

- trim behavior pinned: `parse({ key: "  a1b2-c3d4-e5f6  " })` → `{ key: "a1b2-c3d4-e5f6" }`;
  `parse({ keyId: "  key-1  " })` → `{ keyId: "key-1" }`;
  `parse({ currentKey: "  old  ", newKey: "  new-key-123  " })` → trimmed values.
- whitespace-only rejected: `key: "   "`, `keyId: "   "`, `currentKey: "   "` throw;
  `newKey: "        "` (8 spaces) throws.
- `newKey` boundary with surrounding whitespace: `" 12345678 "` passes (trim → 8),
  `"  1234567  "` throws (trim → 7).
- discriminated union: `{ success: true }` ✓, `{ success: false, error: "x" }` ✓;
  `{ success: false }` ✗, `{ success: true, error: "x" }` ✗ (pins the exact two
  invalid combos from the issue).

**Seam 2 — wire** (`apps/api/src/rpc/router.test.ts`, existing harness, `@ts-nocheck` style):

- whitespace-only input rejected at the ORPC wire gate:
  `client.consumeRecoveryKey({ key: "   " })` and `client.revokeRecoveryKey({ keyId: "  " })`
  reject with `code: "BAD_REQUEST"` (extend the existing invalid-input test).
- trimmed input forwarded: `consumeRecoveryKey({ key: "  a1b2-c3d4-e5f6  " })` →
  `consumeKey` called with `"a1b2-c3d4-e5f6"` (proves the handler sees the parsed/trimmed value).
- existing `changeDbEncryptionKey` failure test keeps passing unchanged (its
  `{ success: false, error }` return is a valid union member).

Type-level proof: `pnpm typecheck` — handler returns assignable to the union's
inferred output; no consumer of the old loose output type exists outside these two
files (grep: `changeDbKeyOutputSchema` referenced only by `security.ts`,
`system-contract.ts`, `index.test.ts`, `router.test.ts`).

Playwright E2E: **none added — documented deviation** (same rationale as #206).
The affected flows (recovery-key management, DB rekey) have no wired UI — the web
and desktop apps do not call `consumeRecoveryKey` / `revokeRecoveryKey` /
`changeDbEncryptionKey` (grep confirmed). An E2E would test service/DB behavior,
not this change. Runtime coverage is provided by the router-level ORPC tests.

## Implementation risks

- Low. Two-line schema edits + one test block per seam.
- Watch: ORPC output validation must accept a `z.discriminatedUnion` output schema
  (router tests exercise the failure path through the wire — this proves it).
- Watch: `mutationAudit` middleware returns `Promise<unknown>`; the discriminated
  union changes the inferred output type — typecheck confirms handler assignability.
- Watch: strict members reject unknown keys — only the handler produces output and
  it emits exactly the two valid shapes; adding output fields later requires a
  deliberate schema edit (that is the point of the invariant).
