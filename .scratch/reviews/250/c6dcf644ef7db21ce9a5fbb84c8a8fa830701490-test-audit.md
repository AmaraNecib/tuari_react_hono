# Test Audit — Issue #250 (Coverage 100%: auth + rbac)

- Base: `fd94c413846934e8722aa098f130e3a5bf9db1c6`
- Head: `1c479b864c2b22663d9df02824b2dd0c2e99dd16`
- Tier: High-assurance
- Three parallel reviewers: edge-case hunter, coverage analyst, quality reviewer (fresh context).

## Findings

| # | Agent | Finding | Severity | Decision | Action |
|---|-------|---------|----------|----------|--------|
| 1 | Edge-case hunter | **Invisible-only `name` passes the bootstrap gate** — `"\u200B\u200B"` survives trim + min(1) and would be persisted as the display name (same hygiene class as the phone regex gate) | 🟠 subtle bug | **Fixed** — `authBootstrapInputSchema.name` gains `.refine(value => value.length === 0 \|\| /[^\p{Cf}]/u.test(value))` (empty-string guard defers to `.min(1)` so an empty name yields one "required" issue, not a doubled custom issue). Blast radius bootstrap-only; web `mapBootstrapErrors` falls through to the same generic copy (verified). Service `bootstrapFieldErrorMessage` gained a `custom`-code branch emitting "الاسم يجب ألا يحتوي على أحرف غير مرئية." (the too-long copy would have been misleading). Tests: ZWSP/BOM/whitespace+Cf name rows + message pin + contracts schema pin. | `auth.ts`, `bootstrap.service.ts`, `bootstrap.service.test.ts`, `index.test.ts` |
| 2 | Edge-case hunter | Phone digit-count boundaries (9- and 11-digit) untested | 🟡 cosmetic | **Fixed** — added rows to the phone rejection `it.each` | `bootstrap.service.test.ts` |
| 3 | Edge-case hunter | `isPermission` `"employees::create"` / `":"` variants untested | 🟡 cosmetic | **Fixed** — added to the extra-colon test | `permissions.test.ts` |
| 4 | Edge-case hunter | `revokeKey("")` / `consumeKey("   ")` untested | 🟡 cosmetic | **Fixed** — added both (false via hash-miss / id-miss) | `recovery-key.service.test.ts` |
| 5 | Edge-case hunter | `getPermissionsForRole("")` / `"ADMIN"` untested (exact-match semantics) | 🟡 cosmetic | **Fixed** — added | `role-seeds.test.ts` |
| 6 | Quality reviewer | ZWSP consume test was **vacuous** — `"a1b2\u200Bc3d4-e5f6"` is never a real pool key, so `false` holds under every implementation | note | **Fixed** — embed the ZWSP inside a REAL generated key (`slice(0,4) + "\u200B" + slice(4)`); now fails if a future implementation strips Cf chars before hashing. Also assert `availableCount === 3` (pool untouched). | `recovery-key.service.test.ts` |
| 7 | Quality reviewer | Mutation tests could cascade on a shared-constant regression | note | **Dismissed** — the primary test fails clearly first; secondary failures would be diagnostic noise, not misleading. Fresh env per test (beforeEach) already isolates. | None |
| 8 | Coverage analyst | All 4 acceptance criteria satisfied; `isPermission` multi-colon test is genuinely new coverage (fails on pre-diff code); resolver pins meaningful; adapters excluded from thresholds by parent #248 policy | — | Confirmed | None |

## Post-fix verification

- `pnpm --filter @tuari/contracts test` — 96 passed
- `pnpm --filter @tuari/api test:coverage` — 100% stmts/branches/funcs/lines (268/268, 153/153, 61/61, 239/239), 50 files, 726 tests
- `pnpm typecheck` — 0
- `pnpm lint` — 0
- `pnpm test:web` — 375 passed (schema change ripples into web bootstrap validation; generic copy, no change needed)

---

## Post-evidence delta (SHA refresh → 6bb4aed)

Original audit ran at `1c479b8`. Post-audit, code-review's advisory (field-agnostic
`custom` branch) was addressed at `6bb4aed` by replacing the branch with a
per-field `Record<BootstrapInputField, string>` map (project's compile-time map
pattern; no `??`/`&&` branch, so 100% branch coverage is preserved — verified
268/268, 153/153, 61/61, 239/239). No new test changes; audit conclusions stand.

---

## Post-evidence delta 2 (SHA refresh → c6dcf64, merge of origin/develop)

Merge resolution (see debate delta) does not touch any audited test or source;
the account/payment suites now measured come from #291 with its own evidence
(.scratch/reviews/249/). Full coverage re-verified post-merge: 399/399 stmts,
246/246 branches, 88/88 funcs, 369/369 lines. Audit conclusions stand.
