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
(?:[\p{Cf}\p{Mn}\p{Zs}\u2800\u115F\u1160\u3164\uFFA0]|(?![\x09-\x0D])[\p{Cc}])
```

i.e. a key is rejected if it contains any codepoint in:

| Class | Members | Rationale |
|---|---|---|
| `\p{Cf}` | format (ZWSP, LRM/RLM, ZWNJ/ZWJ, soft hyphen, bidi controls, …) | already rejected since #234; invisible |
| `\p{Mn}` | nonspacing marks (combining accents U+0300–U+036F, variation selectors, …) | invisible; an embedded mark makes a key LOOK right but never match (issue case 2) |
| `\p{Zs}` | space separators (space, NBSP, ideographic space, …) | **issue case 4** — trim() is edge-only so a mid-string NBSP survived; a space renders blank and is indistinguishable from a regular space in a monospace key field. The #221 pin is NOT affected: its pinned character is LF (a Cc), preserved by the carve-out below |
| `\u2800` | BRAILLE BLANK | renders as a blank cell — indistinguishable from empty space; 8× passes `min(8)` and becomes the PRAGMA rekey value (issue case 1). Only the blank-cell symbol is targeted — visible So symbols (©, emoji) stay allowed |
| `\u115F\u1160\u3164\uFFA0` | Hangul fillers (Lo, blank-rendering) | the enumerable blank cells outside the issue's named classes — same hazard as U+2800, and U+3164 is a known obfuscation vector (debate finding 3) |
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

**Deliberately ALLOWED**: Zl/Zp line/paragraph separators (U+2028/U+2029) —
they render as visible line breaks, consistent with the LF carve-out (debate
finding 4, documented in the helper comment). Visible So symbols (©, ☀,
emoji) and Lo letters (incl. every CJK ideograph) pass as intended.

**Residual (documented in the helper comment)**: unassigned codepoints / lone
surrogates (Cn) still pass — programmatic/corrupt-paste only, no IME input
path (debate finding 5).

**Why not `\p{So}` wholesale**: So (Symbol, other) is mostly VISIBLE symbols
(©, ®, ☀, emoji, …); only U+2800 is the blank-cell case. Rejecting all So
would reject legitimate visible symbols in a user-chosen DB key. The targeted
`\u2800` (+ the four Hangul fillers) closes the blank-cell hazard with zero
over-reach (debate defender D1, 9/10).

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
        !/(?:[\p{Cf}\p{Mn}\p{Zs}\u2800\u115F\u1160\u3164\uFFA0]|(?![\x09-\x0D])[\p{Cc}])/u.test(
          value,
        ),
      {
        message: `${label} must not contain blank or invisible characters (e.g. spaces, zero-width space, combining marks, control characters)`,
      },
    )
```

- The length guard (`value.length < min ||`) still defers to `.min(min)` so a
  too-short+invisible key yields a single `too_small` issue (zod ^4 runs
  refines even after a failed check — verified pattern from #234/#250).
- **Message updated** from "invisible format characters" to "blank or
  invisible characters (e.g. spaces, zero-width space, combining marks,
  control characters)" because the class now covers Mn/Cc/Zs/U+2800 too, and
  a rejected space is blank rather than invisible. The message surfaces
  verbatim in the UI toast (`security-section.tsx` → `err.message`), so it is
  contract surface; the #234 message-pin test is updated in the same commit.
- Inferred types of the four input schemas are unchanged (refine is a pure
  validator) — no downstream type impact.

**Startup-unlock path VERIFIED not affected** (debate finding 2): the
widened rejection only applies to the RPC wire schemas
(`handler-inputs.ts`). The startup unlock does NOT route through
`keyFieldSchema` — `apps/api/src/config/loader.ts` validates `db_key` with
bare `z.string().min(8)`, and the Rust shell (`load_or_create_secret`)
reads the OS keyring / secret file directly. A pre-existing key containing
Mn/Cc/Zs still unlocks the database; only *entering it as `currentKey` in
the Settings rekey form* is now rejected — an annoyance confined to the
vanishingly rare user-chosen non-hex key, not a lockout. The `database-key-manager.ts`
defensive guard (`!currentKey.trim() || !newKey.trim()`) stays as-is — it
mirrors the *empty* invariant only, and the wire gate now rejects the wider
class before any PRAGMA is built.

No client-side change in `security-section.tsx` — it trims + length-checks
for UX; the schema is the enforcement gate (same division as #234).

## Dependencies

None new. `security.ts` depends only on `zod` (externalized in the contracts
tsup build). The regex uses ES2018 Unicode property escapes (`/u` flag) — fine
for the tsup target and modern Node.

## Planned tests (TDD, three seams)

**Seam 1 — contract schema surface** (`packages/contracts/src/index.test.ts`):

- **REPLACE** `it("accepts non-Cf invisible characters (documented residual
  class #334)")` — it pinned U+2800 *passing*, now wrong. New #334 blocks:
  - "rejects braille blank, combining marks, and invisible control chars
    (#334)": issue case 1 (U+2800 standalone + embedded), case 2 (Mn
    standalone + embedded), case 3 (Cc: U+0000/U+0001/U+001F/U+007F
    standalone + embedded), case 4 (mid-string NBSP + plain space rejected),
    Hangul fillers (U+3164/U+115F/U+FFA0), all other key fields
    (`keyId`, `currentKey`), valid-key regression.
  - "preserves visible formatting whitespace in keys (#221 pin + #334
    carve-out)": internal `\n` (the #221 pin), `\t`, `\r`, `\r\n` still
    ACCEPTED; U+2028/U+2029 accepted (documented); the #221 edge-trim test
    (`"\u00A0a1b2-c3d4-e5f6\u2028"` → trimmed key) still green; visible So
    (©) and Lo (CJK) pass (no over-reach).
- **UPDATE** the message pin test regex `/invisible format characters/` →
  `/invisible characters/` (new message "blank or invisible characters"
  still matches).
- The existing #234 Cf tests and the #221 internal-newline pin stay green
  unchanged.

**Seam 2 — wire** (`apps/api/src/rpc/router.test.ts`, extend the existing
"rejects invalid recovery/DB key input at the wire contract" test):

- `consumeRecoveryKey({ key: "\u0301\u0301" })` → `BAD_REQUEST` (Mn).
- `consumeRecoveryKey({ key: "\u2800\u2800" })` → `BAD_REQUEST` (braille blank).
- `changeDbEncryptionKey({ currentKey: "old-key", newKey: "\u0001".repeat(8) })`
  → `BAD_REQUEST` (Cc — the PRAGMA-rekey hazard class).
- `changeDbEncryptionKey({ currentKey: "old-key", newKey: "a1b2\u00A0c3d4e5f6" })`
  → `BAD_REQUEST` (Zs — issue case 4).
- Existing happy-path + failure-path wire tests keep passing.

**Seam 3 — Playwright E2E** (`tests/e2e/recovery-keys.spec.ts`, extend the
existing wire-gate `fetchRpcStatus` block):

- `consumeRecoveryKey` with a braille-blank key → 400.
- `consumeRecoveryKey` with a combining-mark key → 400.
- `consumeRecoveryKey` with a control-char key → 400.
- `consumeRecoveryKey` with a mid-string NBSP key → 400 (issue case 4).
- Existing `key: ""` → 400 and ZWSP → 400 checks stay.

Unit tests: the contract schema tests ARE the unit tests for this business
logic (pure schema behavior, no service). E2E covers the user-facing gate.

## Implementation risks

- **#221 pin regression**: the `\n` carve-out keeps `'a1b2-c3d4\ne5f6'`
  green — verified empirically (26-case regex matrix, all pass) BEFORE
  writing the design. Run the full contracts suite to confirm.
- **Stale contracts `dist/`** (wisdom): after editing `packages/contracts/src/`,
  rebuild `pnpm --filter @tuari/contracts build` before running the API suite
  directly, or use root `pnpm test:api` which builds first.
- **Message change breaks the #234 message-pin test** — deliberate, updated in
  the same commit.
- **Regex soundness**: the `(?![\x09-\x0D])[\p{Cc}]` lookahead is fixed-width
  (1 char), no quantifiers — no catastrophic backtracking. Empirically
  verified over a 26-case matrix (invisible/blank classes rejected; whitespace
  controls + Zl/Zp + visible So/Lo allowed).
- **zod refine deferral**: the `value.length < min` guard prevents doubled
  issues for too-short invisible keys — existing #234 single-issue test
  (`"\u200B\u200B\u200B"` → one `too_small`) keeps passing.

## Debate outcome (#334 adversarial review)

Critic + defender sub-agents ran against `git diff 6a678c0...HEAD` (HEAD
`b928784` at review time). Both independently verified the regex empirically
(30-case and 21-case matrices, all pass). Verdicts:

- **C1 (sev 5) "mid-string NBSP left open by design"** — FIXED. Rejected
  `\p{Zs}` anywhere: the critic proved the stricter branch closes issue
  case 4 with zero cost to the #221 pin (the pin's char is LF/Cc, preserved
  by the carve-out, not by Zs). Recovery/DB keys are machine-generated and
  never contain spaces.
- **C2 (sev 5) "Mn rejection over-reaches + backward-compat edge"** —
  VERIFIED + DOCUMENTED. Mn rejection is the deliberate #234
  reject-anywhere semantics (a key with an embedded combining mark LOOKS
  right but never matches — the issue's case 2). The startup unlock path
  does NOT route through `keyFieldSchema` (config loader is bare
  `min(8)`; Rust reads the keyring directly) — only entering a pre-existing
  non-hex key as `currentKey` in the rekey form is affected, an annoyance
  not a lockout. Documented in this doc + the PR.
- **C3 (sev 4) "Hangul fillers (Lo) still pass"** — FIXED. Added the
  enumerable blank fillers U+115F/U+1160/U+3164/U+FFA0 — same blank-cell
  hazard as U+2800 (U+3164 is a known obfuscation vector), no Lo-wide
  rejection needed.
- **C4 (sev 2) "Zl/Zp unaddressed and undocumented"** — DOCUMENTED. Zl/Zp
  allowed by design (visible line breaks, consistent with the LF carve-out);
  now stated in the helper comment and pinned by a test.
- **C5 (sev 2) "lone surrogates / Cn pass"** — DOCUMENTED. Programmatic/
  corrupt-paste only; noted as a residual in the helper comment.
- **Defender D1 (U+2800-only So targeting, 9/10)**, **D2 (Zs decision)**,
  **D3 (#221 pin preservation, 10/10)**, **D4 (message change, 9/10)**,
  **D5 (no client-side change, 8/10)** — ACCEPTED; no action.
