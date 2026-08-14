# Issue 334 — Security schema: invisible chars outside \p{Cf} (Mn/Cc/So/mid-string Zs) still bypass key-input trim

**Tier**: High-assurance (security — input validation on exact-match secrets,
same surface as #221/#234, which were also High-assurance).

**Base**: `origin/develop` @ `6a678c0` (branch `refactor/issue-334` rebased
onto freshest develop; HEAD == merge-base at time of writing).

## Problem

#234 rejected any Unicode **format (Cf)** codepoint anywhere in the
recovery-key / DB-key input fields (`keyFieldSchema` in
`packages/contracts/src/security.ts`), exactly as that issue scoped it. But
invisible codepoints OUTSIDE Cf still pass:

1. **U+2800 BRAILLE BLANK (So)** — renders as a blank cell; 8 of them pass
   `newKey min(8)` and would become the PRAGMA rekey value.
2. **Combining marks (Mn)** — e.g. 8× U+0301 — invisible when standalone and
   when embedded (a key that LOOKS like `abcdef` but never matches).
3. **Control chars (Cc)** — e.g. U+0000–U+001F — `min()` counts them.
4. **Mid-string NBSP (Zs)** — `trim()` is edge-only, so an embedded NBSP
   survives.

Tension: #221's pinned behavior deliberately **preserves internal whitespace**
in recovery keys (the wrapped-across-email-line paste case:
`'a1b2-c3d4\ne5f6'` is accepted). The issue asks for a deliberate decision on
the exact rejected class.

## Decision — exact rejected class

Reject ANY occurrence (same "no visible enough" reject-anywhere semantics as
#234) of:

```regex
(?:[\p{Cf}\p{Mn}\u2800]|(?![\x09-\x0D])[\p{Cc}])
```

i.e. a key is rejected if it contains any codepoint in:

| Class | Members | Rationale |
|---|---|---|
| `\p{Cf}` | format (ZWSP, LRM/RLM, ZWNJ/ZWJ, soft hyphen, bidi controls, …) | already rejected since #234; invisible |
| `\p{Mn}` | nonspacing marks (combining accents U+0300–U+036F, variation selectors, …) | invisible; an embedded mark makes a key LOOK right but never match (issue case 2) |
| `\u2800` | BRAILLE BLANK | renders as a blank cell — indistinguishable from empty space; 8× passes `min(8)` and becomes the PRAGMA rekey value (issue case 1) |
| `\p{Cc}` **minus `[\x09-\x0D]`** | control chars EXCEPT tab/LF/VT/FF/CR | invisible controls (U+0000–U+0008, U+000E–U+001F, U+007F–U+009F) render as nothing and `min()` counts them (issue case 3) |

**Why `[\x09-\x0D]` (tab, LF, VT, FF, CR) is carved out of the Cc
rejection**: those five are exactly the Cc members of ECMAScript WhiteSpace /
LineTerminator — visible *formatting* controls. `\n` (LF) is the character the
#221 pinned test deliberately preserves (`'a1b2-c3d4\ne5f6'` accepted — the
wrapped-across-email-line paste), and `\r` is its CRLF partner; `\t` is a
common paste artifact. All five are stripped by `.trim()` at the edges, so an
all-whitespace-control key still trims to `""` and fails `.min()` — the
carve-out cannot smuggle an invisible key past the length gate. This honors
the issue's stated intent of *preserving the #221 internal-whitespace pin*
(whose actual pinned character is `\n`, a Cc, not Zs as the issue text
assumes) — the carve-out, not "excluding Zs", is what keeps that pin green.

**Zs deliberately ALLOWED** (mid-string space / NBSP preserved) — the issue's
"excluding Zs to preserve the internal-whitespace pin" lean, made explicit:
internal spaces render as a *visible* gap (distinguishable), are the #221
"internal whitespace preserved, not normalized" intent, and pure-Zs strings
cannot pass anyway (every Zs is ECMAScript WhiteSpace → `.trim()` → `""` →
`min()` fails). Mid-string NBSP therefore remains accepted — documented
decision, pinned by a test.

**Why not `\p{So}` wholesale**: So (Symbol, other) is mostly VISIBLE symbols
(©, ®, ☀, emoji, …); only U+2800 is the blank-cell case. Rejecting all So
would reject legitimate visible symbols in a user-chosen DB key. The targeted
`\u2800` closes the issue's named case with zero over-reach.

**Residual (documented, out of the issue's named classes)**: blank *letters*
(Lo) such as Hangul fillers U+115F/U+1160/U+3164/U+FFA0 still pass — they are
not in any of the four classes the issue lists, have no realistic input path
(not on any keyboard, not a paste artifact), and catching them would require
rejecting all of Lo (every CJK ideograph). Noted in the helper comment.

## Public API changes (`packages/contracts/src/security.ts`)

No exported names change. The private shared `keyFieldSchema(min, label)`
helper gets a wider rejection regex and a comment rewrite. The four fields it
backs are unchanged in shape:

- `consumeRecoveryKeyInputSchema.key` — `keyFieldSchema(1, "recovery key")`
- `revokeRecoveryKeyInputSchema.keyId` — `keyFieldSchema(1, "recovery key id")`
- `changeDbKeyInputSchema.currentKey` — `keyFieldSchema(1, "current encryption key")`
- `changeDbKeyInputSchema.newKey` — `keyFieldSchema(8, "new encryption key")`

```ts
const keyFieldSchema = (min: number, label: string) =>
  z
    .string()
    .trim()
    .min(min)
    .refine(
      (value) =>
        value.length < min ||
        !/(?:[\p{Cf}\p{Mn}\u2800]|(?![\x09-\x0D])[\p{Cc}])/u.test(value),
      {
        message: `${label} must not contain invisible characters (e.g. zero-width space, combining marks, control characters)`,
      },
    )
```

- The length guard (`value.length < min ||`) still defers to `.min(min)` so a
  too-short+invisible key yields a single `too_small` issue (zod ^4 runs
  refines even after a failed check — verified pattern from #234/#250).
- **Message updated** from "invisible format characters" to "invisible
  characters (e.g. …)" because the class now covers Mn/Cc/U+2800 too. The
  message surfaces verbatim in the UI toast (`security-section.tsx` →
  `err.message`), so it is contract surface; the #234 message-pin test is
  updated to match.
- Inferred types of the four input schemas are unchanged (refine is a pure
  validator) — no downstream type impact.

The `database-key-manager.ts` defensive guard (`!currentKey.trim() ||
!newKey.trim()`) stays as-is — it mirrors the *empty* invariant only and the
wire gate now rejects the wider class before any PRAGMA is built.

No client-side change in `security-section.tsx` — it trims + length-checks
for UX; the schema is the enforcement gate (same division as #234).

## Dependencies

None new. `security.ts` depends only on `zod` (externalized in the contracts
tsup build). The regex uses ES2018 Unicode property escapes (`/u` flag) — fine
for the tsup target and modern Node.

## Planned tests (TDD, three seams)

**Seam 1 — contract schema surface** (`packages/contracts/src/index.test.ts`):

- **REPLACE** `it("accepts non-Cf invisible characters (documented residual
  class #334)")` — it pins U+2800 *passing*, now wrong. New #334 block:
  - issue case 1: `newKey: "\u2800".repeat(8)` rejected; embedded
    `key: "a\u2800b"` rejected.
  - issue case 2: `newKey: "\u0301".repeat(8)` rejected; embedded
    `key: "a\u0301b"` rejected (Mn).
  - issue case 3: `newKey: "\u0000".repeat(8)`, `"\u0001".repeat(8)`,
    `"\u001F".repeat(8)`, `"\u007F".repeat(8)` rejected (Cc, incl. DEL/C1);
    embedded `key: "a\u0001b"` rejected.
  - Cc carve-out preserved: internal `\n` (the #221 pin), `\t`, `\r`, `\r\n`
    still ACCEPTED (`'a1b2-c3d4\ne5f6'`, `'a1b2\tc3d4'`, `'a1b2\rc3d4'`).
  - issue case 4 decision pinned: mid-string NBSP `"a1b2\u00A0c3d4"` still
    ACCEPTED (Zs deliberately allowed — documented decision).
  - no over-reach: visible So `"a\u00A9b"` (©) and visible symbols accepted.
  - valid hex keys unaffected (regression).
- **UPDATE** the message pin test (`surfaces a user-facing message …`) regex
  `/invisible format characters/` → `/invisible characters/`.
- The existing #234 Cf tests (1003–1112) and the #221 internal-newline pin
  stay green unchanged — verified in the implementation run.

**Seam 2 — wire** (`apps/api/src/rpc/router.test.ts`, extend the existing
"rejects invalid recovery/DB key input at the wire contract" test):

- `client.consumeRecoveryKey({ key: "\u0301\u0301" })` → `BAD_REQUEST` (Mn).
- `client.consumeRecoveryKey({ key: "\u2800\u2800" })` → `BAD_REQUEST`
  (braille blank).
- `client.changeDbEncryptionKey({ currentKey: "old-key", newKey: "\u0001".repeat(8) })`
  → `BAD_REQUEST` (Cc — the PRAGMA-rekey hazard class).
- Existing happy-path + failure-path wire tests keep passing.

**Seam 3 — Playwright E2E** (`tests/e2e/recovery-keys.spec.ts`, extend the
existing wire-gate `fetchRpcStatus` block):

- `consumeRecoveryKey` with a braille-blank key → 400.
- `consumeRecoveryKey` with a combining-mark key → 400.
- `consumeRecoveryKey` with a control-char key → 400.
- Existing `key: ""` → 400 and ZWSP → 400 checks stay.

Unit tests: the contract schema tests ARE the unit tests for this business
logic (pure schema behavior, no service). E2E covers the user-facing gate.

## Implementation risks

- **#221 pin regression**: the `\n` carve-out keeps `'a1b2-c3d4\ne5f6'`
  green — verified empirically (19-case regex matrix, all pass) BEFORE writing
  the design. Run the full contracts suite to confirm.
- **Stale contracts `dist/`** (wisdom): after editing `packages/contracts/src/`,
  rebuild `pnpm --filter @tuari/contracts build` before running the API suite
  directly, or use root `pnpm test:api` which builds first.
- **Message change breaks the #234 message-pin test** — deliberate, updated in
  the same commit.
- **Regex soundness**: the `(?![\x09-\x0D])[\p{Cc}]` lookahead is fixed-width
  (1 char), no quantifiers — no catastrophic backtracking. Empirically
  verified over the 19-case matrix (invisible classes rejected, whitespace
  controls + Zs + visible So allowed).
- **zod refine deferral**: the `value.length < min` guard prevents doubled
  issues for too-short invisible keys — existing #234 single-issue test
  (`"\u200B\u200B\u200B"` → one `too_small`) keeps passing.

## Debate outcome (#334 adversarial review)

Pending — High-assurance tier requires debate, test-audit, and code-review
evidence before push (recorded in `.scratch/reviews/334/`).
