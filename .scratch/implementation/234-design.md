# Issue 234 — Security schema: zero-width/format chars bypass key-input trim

**Tier**: High-assurance (recovery-key / DB-encryption-key contract surface —
same surface as #221, which was also High-assurance).

**Base**: `origin/develop` @ `bb144f3a3a22fe5f72904aaafa511b16a9e4dec2`
(branch `refactor/issue-234` sits exactly on it).

## Problem

Follow-up from #221 (test-audit edge-case finding, deferred out of the trim
scope). `String.prototype.trim()` removes only ECMAScript WhiteSpace /
LineTerminator characters. Unicode **format (Cf)** characters — U+200B ZWSP,
U+200E/200F LRM/RLM, U+200C/200D ZWNJ/ZWJ, U+FEFF BOM, … — are NOT WhiteSpace,
so they survive `z.string().trim()`:

- `consumeRecoveryKeyInputSchema.key` — a ZWSP-only key passes `min(1)`.
- `revokeRecoveryKeyInputSchema.keyId` — same `min(1)` gap (hygiene: keyId is
  a machine-generated record id, but the schema is public wire surface).
- `changeDbKeyInputSchema.newKey` — 8 ZWSP passes `min(8)` and would become the
  PRAGMA rekey value.

Practical risk is low today (recovery keys are SHA-256-hashed machine tokens;
the DB key is machine-generated 64-char hex in the Rust shell), but these are
**exact-match secrets**: any embedded format char silently changes the compared
value. This is the same hygiene class #221 addressed, and a ZWSP can enter via
deliberate typing or a malicious paste.

## Public API changes (`packages/contracts/src/security.ts`)

No exported names change or are added — the four field validators get stricter.
A shared private helper keeps the four fields consistent:

```ts
/**
 * Key inputs are exact-match secrets (recovery keys are SHA-256-hashed, the
 * DB key becomes the PRAGMA rekey value), so unlike display names there is
 * no "visible enough" — a string that CONTAINS any Cf (format) codepoint
 * anywhere is rejected (#234). Stricter than the auth.ts name/password
 * checks, which only reject all-invisible strings.
 */
const keyFieldSchema = (min: number, label: string) =>
  z
    .string()
    .trim()
    .min(min)
    // Guard defers to .min(min) so a too-short value yields a single length
    // issue, not a doubled too_small + custom issue (same pattern as the
    // auth.ts password/name refines — zod ^4 runs refinements even after a
    // failed check).
    .refine((value) => value.length < min || !/[\p{Cf}]/u.test(value), {
      message: `${label} must not contain invisible format characters (e.g. zero-width space)`,
    })

// consumeRecoveryKeyInputSchema.key        → keyFieldSchema(1, "recovery key")
// revokeRecoveryKeyInputSchema.keyId       → keyFieldSchema(1, "recovery key id")
// changeDbKeyInputSchema.currentKey        → keyFieldSchema(1, "current encryption key")
// changeDbKeyInputSchema.newKey            → keyFieldSchema(8, "new encryption key")
```

Why `\p{Cf}` with `/u`: the issue's proposed fix names exactly this class; it
covers ZWSP/LRM/RLM/ZWNJ/ZWJ/BOM/soft hyphen and the bidi embedding controls.
`\uFEFF` is also in ECMAScript WhiteSpace (trimmed at the edges), so the Cf
check only adds rejections beyond trim — it never removes acceptances.

**Deliberately NOT changed** (documented scope decision, same as #221):
`changeAppPasswordInputSchema` fields. `passwordSchema` (auth.ts) already
rejects all-invisible passwords and passwords are opaque secrets kept
untrimmed; #234 scopes to recovery-key / DB-key inputs only.

**Message language**: English, matching the existing zod messages in auth.ts
("password must contain at least one visible character"). The message reaches
the user via the toast path already used for schema errors
(`security-section.tsx` → `err.message`). i18n of zod messages is out of scope
(no existing mechanism; #271 covered UI copy keys, not schema messages).

## Dependencies

None new. `security.ts` depends only on `zod` (already externalized in the
contracts tsup build). `/\p{Cf}/u` requires ES2015+ regex (fine for the tsup
target and Node ≥ 12).

## Planned tests (TDD, three seams)

**Seam 1 — contract schema surface** (`packages/contracts/src/index.test.ts`,
extend the existing `#206` security block):

- ZWSP-only / Cf-only values rejected: consume `key: "\u200B"`,
  revoke `keyId: "\u200B\u200B"`, changeDbKey `newKey: "\u200B".repeat(8)`
  (the exact issue case), `currentKey: "\u200B"`.
- Cf embedded inside an otherwise-valid key rejected (stricter-than-name
  semantics): `key: "a1b2\u200Bc3d4"`, `newKey: "new\u200Bkey-123456"`.
- A spread of Cf codepoints rejected: LRM U+200E, RLM U+200F, ZWNJ U+200C,
  ZWJ U+200D (category members beyond ZWSP).
- Cf mixed with surrounding whitespace still rejected after trim
  (`key: " \u200B "` — trim keeps the ZWSP).
- Valid keys still accepted (regression): the existing happy-path assertions
  keep passing; add `key: "a1b2-c3d4-e5f6"`, `newKey: "new-key-123"` untouched.
- Single-issue semantics: `newKey: "\u200B\u200B\u200B"` (3 ZWSP, < min(8))
  throws with exactly one issue (too_small), not doubled.

**Seam 2 — wire** (`apps/api/src/rpc/router.test.ts`, extend the existing
"rejects invalid recovery/DB key input at the wire contract" test):

- `client.consumeRecoveryKey({ key: "\u200B" })` → rejects `code: "BAD_REQUEST"`.
- `client.revokeRecoveryKey({ keyId: "\u200B\u200B" })` → `BAD_REQUEST`.
- `client.changeDbEncryptionKey({ currentKey: "old", newKey: "\u200B".repeat(8) })`
  → `BAD_REQUEST` (the PRAGMA-rekey hazard is blocked before any PRAGMA is built).
- Existing happy-path + failure-path wire tests keep passing unchanged.

**Seam 3 — Playwright E2E** (`tests/e2e/recovery-keys.spec.ts`, extend the
existing "Malformed input is rejected by the wire gate" check): a
`consumeRecoveryKey` with a ZWSP-only key returns 400 (same wire-gate proof
already used for `key: ""`). The recovery-key flow IS UI-wired in this repo
(the #221 "no E2E" rationale is obsolete — `security-section.tsx` + the
`recovery-keys.spec.ts` lifecycle spec exist), but a browser-level UI test
would only re-drive the same RPC; the RPC-driven check already pins the
user-facing gate.

## Implementation risks

- Low. One helper + four field substitutions + tests.
- Watch: zod ^4 runs `.refine()` even after a failed `.min()` check — the
  `value.length < min` guard prevents doubled issues (verified pattern from
  auth.ts passwordSchema).
- Watch: `.trim()` transform ordering — trim runs before min and refine, so
  edge whitespace is stripped first; Cf checks operate on the trimmed value.
- Watch: the `label` interpolated into the message must read naturally for
  each field (the schema errors surface verbatim in the UI toast).
- Note: the inferred types of the four input schemas are unchanged (refine is
  a pure validator), so no downstream type impact.
