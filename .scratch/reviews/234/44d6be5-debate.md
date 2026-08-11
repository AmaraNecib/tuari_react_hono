# Issue #234 — Debate Evidence

**Head**: `44d6be5f2bb696952a360552fdb2eee0e37fe511`
**Base**: `bb144f3a3a22fe5f72904aaafa511b16a9e4dec2` (merge-base with `origin/develop`)
**Tier**: High-assurance (recovery-key / DB-encryption-key contract surface)

Two parallel sub-agents (reviewer) ran against `git diff bb144f3...HEAD`:
a HARSH CRITIC and a CHARITABLE DEFENDER. Both verified the contracts
suite (index.test.ts 74/74 at review time) and the router wire suite
(27/27) pass.

## Critic findings → synthesis

| # | Sev | Finding | Decision |
|---|-----|---------|----------|
| F1 | 6 | Invisible chars OUTSIDE `\p{Cf}` still pass: U+2800 braille blank (So), combining marks (Mn), controls (Cc), mid-string NBSP (Zs). `newKey: "▀"×8` would become the PRAGMA rekey value. The issue scoped the fix to Cf, but the message "invisible" overclaims vs coverage. | **DEFERRED → issue #334.** The issue's proposed fix explicitly scopes to `\p{Cf}`; widening is a deliberate follow-up. Tension: #221 deliberately preserves internal Zs (email-line-wrap keys), so widening needs its own decision. KeyFieldSchema comment + design doc reference #334; a boundary-pinning test (U+2800 accepted) makes any future widening a deliberate change. |
| F2 | 4 | Cf rejection on `keyId` (server-generated id) and `currentKey` (fails verification anyway) is near-zero-value scope creep. | **DISMISSED.** Defender: keyId is public wire surface (defense-in-depth, same class as #221); currentKey is the exact-match current PRAGMA secret — a Cf there silently breaks rekey verification; the issue's fix wording covers "the recovery-key and DB-key input schemas" (all fields); symmetric coverage is simpler to reason about than partial. |
| F3 | 2 | Code comment claims "U+FEFF is NOT WhiteSpace" — false: U+FEFF IS ECMAScript WhiteSpace (trimmed at edges). | **FIXED.** Comment now states U+FEFF is WhiteSpace, trimmed at the edges, and a mid-string U+FEFF is caught by the Cf check. Pinned by a new test (`key: "a\uFEFFb"` → rejected). |
| F4 | 2 | Design doc claims `\p{Cf}/u` is "ES2015+ regex" — Unicode property escapes are ES2018. | **FIXED.** Design doc corrected. |
| F5 | 1 | Comment's "same pattern as auth.ts" guard omits the max-side asymmetry. | **DISMISSED.** No `.max()` on these fields; harmless. |

## Defender highlights (accepted)

- Shared `keyFieldSchema(min, label)` keeps the regex/guard/message in lockstep
  across the four same-class fields; private, no API surface growth (conf. 9).
- Label-parameterized messages give natural toast copy per field (conf. 8).
- `value.length < min` guard defers to `.min()` — zod ^4 runs refines after
  failed checks; identical to the proven auth.ts password/name pattern (conf. 10).
- Contains-any-Cf is deliberately STRICTER than auth.ts's all-invisible rule —
  keys are byte-exact secrets, no "visible enough" (conf. 9).
- `changeAppPasswordInputSchema` deliberately untouched — passwords are opaque,
  untrimmed secrets (NIST 800-63B) already covered by passwordSchema (conf. 9).

## Residual risks (documented)

- Non-Cf invisible classes pass by design (Mn/Cc/So/U+2800, mid-string Zs) →
  tracked as **#334**.
- Zod messages are English-only (matches auth.ts convention; i18n of schema
  messages is out of scope, documented in design doc).
- A legacy key crafted with Cf pre-fix would be unsubmittable for
  consume/revoke/rekey — keys are machine-generated, so practically
  impossible; the rejection is the point.
