# Test Audit — Issue 206 (e12194e)

Base SHA: `80d4926` · Head SHA: `e12194e`

## Process

Three parallel review agents (edge-case hunter, coverage analyst, quality
reviewer) audited the diff `80d4926...e12194e` against the changed test files
(`packages/contracts/src/index.test.ts`, `apps/api/src/rpc/router.test.ts`) and
sources. All findings were synthesized; actionable items fixed and committed
(`e12194e`).

## Findings applied

| # | Finding (source) | Severity | Resolution |
|---|---|---|---|
| 1 | `newKey` min(8) boundary unpinned (edge hunter) | 🟠 | Added exact-boundary tests: 8-char passes, 7-char throws |
| 2 | `rejects.toBeInstanceOf(Error)` cannot prove the wire gate fired — a handler-side throw would pass too (edge hunter + quality reviewer) | 🟠 | Probed the real ORPC path: input validation rejects with `ORPCError` `code: "BAD_REQUEST"` (msg "Input validation failed"). All three wire-rejection tests now assert `toMatchObject({ code: "BAD_REQUEST" })` — distinguishes schema rejection from the reports handler's own `default:` throw |
| 3 | `datetime({ offset: true })` semantics unpinned (edge hunter) | 🟠 | Added: naive `2026-01-01T00:00:00` rejected; explicit `+01:00` offset accepted |
| 4 | Missing required fields untested (edge hunter) | 🟡 | Added `{}` rejections for all four schemas |
| 5 | Non-string values untested (edge hunter) | 🟡 | Added `{ key: 123 }`, `{ keyId: null }`, `{ newKey: 12345678 }`, `{ type: null }` rejections |
| 6 | `{ success: false }` output path never exercised (edge hunter) | 🟡 | Added router test with `consumeKey → false` asserting `{ success: false }` through the wire |
| 7 | DEBT/MOVEMENT report branches never run through the router (edge hunter) | 🟡 | Added router tests asserting zeroed DEBT and MOVEMENT summaries |

## Findings reviewed and declined (documented)

- **Whitespace-only strings pass `z.string().min(1)`** (`"   "` is length 3). This
  is a pre-existing property of the schemas in `security.ts`, untouched by #206;
  tightening to `.trim().min(1)` is a behavior change outside this issue's scope
  (export + derive). Noted for a follow-up if non-empty truly means "non-blank".
- **Type-level drift test for criterion 3** (coverage analyst: no direct
  `expectTypeOf` assertion exists). Declined by design: the whole point of
  `z.infer<typeof schema>` is to track the schema — freezing the current shape
  with a type-equality assertion would fail on legitimate schema evolution,
  defeating the refactor. The compile-time guarantee is `pnpm typecheck` of the
  api package (verified green), plus runtime wire tests proving the same schema
  gates the wire.
- **Quote-escaping in PRAGMA SQL, max-length bounds, inverted date ranges** —
  pre-existing handler/schema behavior outside #206's scope; no regression
  introduced. Inverted-range empty results are documented by the existing
  INVENTORY router test semantics.
- **`changeDbEncryptionKey` success path** (PRAGMA rekey) — requires a real
  SQLCipher handle; the existing stub documents the failure path only. Out of
  scope for a type-only refactor; the wire gating is covered.

## Verdict

No blockers. All acceptance criteria of #206 are tested at two layers (contracts
unit parse tests + ORPC router wire tests): `./security` re-export,
`reportFilterInputSchema` export + `./reports-contract` index re-export, and the
four `z.infer` derivations (compile-time via typecheck).

Test counts: contracts 94 passed; api router 22 passed (10 new `it` blocks total
across the two files, 5 hardened by this audit).

---

**Post-evidence delta (a0cb624):** commits since e12194e are (1) the GitHub-hosted runner migration `42410f7` — byte-identical copy of the change merged in PR #224 (`f362858`), verified `git diff 42410f7 f362858` empty and `git diff HEAD origin/develop -- .github/workflows/ci.yml` empty; and (2) merge of origin/develop (`a0cb624`), which introduced zero feature-file changes (verified `git log 80d4926..HEAD -- apps/api packages/contracts` shows only b60b6c1 + e12194e). Final-diff code-review re-run (Standards + Spec) found no drift and no new issues. Evidence validity at a0cb624 confirmed.
