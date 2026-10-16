# Debate — #460 (dead `dashboard-overview.tsx` + entry-dialog direction)

- **Issue:** #460 — (1) `apps/web/src/features/dashboard/dashboard-overview.tsx` is dead code; (2) `void-entry-dialog` / `record-entry-payment-dialog` should take an explicit `accountDirection`.
- **BASE:** `origin/develop` @ `79acb3591a6b3827d941ab8e8d7f7ef3f9571477`
- **HEAD:** `03ff355d54a8085d3e00ed98cdcea8ed5744c1f8` (`chore(web): delete the unrendered dashboard overview, lock the entry-dialog direction (#460)`)
- **Diff scope (`git diff origin/develop...03ff355d`):** 3 files, +165/−141
  - `apps/web/src/features/dashboard/dashboard-overview.tsx` — deleted (141 lines)
  - `apps/web/src/features/debts/debts-mvp-web.test.tsx` — +84 lines, one new `describe`
  - `.scratch/implementation/460-design.md` — new (repo convention: `/.scratch/implementation/` is negated in `.gitignore` lines 44 and 502 such files are already tracked at `origin/develop` → **not** repo noise)
- **Reviewers:** one harsh critic (fresh context), one charitable defender (fresh context), then synthesis.
- **Independent verification run in this session (read-only):**
  - `grep -rn` for `DashboardOverview|dashboard-overview` across the whole worktree (excluding `node_modules`, `.git`) → only `.scratch/**` notes and `docs/COMPLETION_STATUS.md:73`.
  - `grep -rn` for both dialog names across `*.ts/tsx` → only `debt-ledger-panel.tsx:21,22,256,263` and the test file.
  - `git show origin/develop:apps/web/src/features/debts/{void-entry-dialog,record-entry-payment-dialog}.tsx` → required props at BASE (see C7).
  - `node scripts/check-i18n-keys.mjs` → `missing (no fallback → renders raw key): 0`, `missing map-key literals …: 0`.
  - `npx vitest run src/features/debts/debts-mvp-web.test.tsx` → **33 passed / 33**, 78.5 s.
  - `git check-ignore .scratch/implementation/460-design.md` → not ignored (by design); `git ls-tree -r origin/develop | grep -c '^.scratch'` → 502.

---

## Critic findings

### C1 — The deletion's blast radius was never checked outside `apps/ packages/ tests/ scripts/` (severity 2)
The design doc's own base finding is scoped (`460-design.md:15`): `grep -rn 'dashboard-overview\|DashboardOverview' apps packages tests scripts` → "matches only the file's own export". That grep excludes `docs/`. A repo-wide grep finds **`docs/COMPLETION_STATUS.md:73`**: `- [x] apps/web/src/features/dashboard/dashboard-overview.tsx - Dashboard layout`, inside a "Priority 4: Dashboard Enhancements (e51e203)" block that also claims "5-minute data refresh interval" for the now-deleted file. The diff updates no doc, so HEAD ships a doc that points at a file that no longer exists.

### C2 — "Deleted safely" rests on a grep that cannot see dynamic imports or route tables (severity 2)
No evidence was produced for: lazy `import()`, TanStack Router file-route conventions, generated route trees, or Playwright selectors. Claiming "no importer" without checking a computed import shape is the standard way a deletion ships broken.

### C3 — The new tests cannot fail on the pre-diff commit, so they are not regression tests for the stated issue (severity 3)
The issue's ask was *make `accountDirection` explicit*. `accountDirection` is **already required** at BASE (C7), so these tests pass identically against `origin/develop` and against HEAD. `460-design.md` "Risks" concedes this ("they cannot fail on a pre-this-diff checkout"). A test that is green before and after the change proves nothing about the change; it is at best a future lock-in, and calling it the issue's "verification" overstates it.

### C4 — `RecordEntryPaymentDialog` test name overstates its assertions (severity 3)
`debts-mvp-web.test.tsx:942` — `it("RecordEntryPaymentDialog phrases the entry and the max from accountDirection, not the sign")`, but the body asserts only `expect(screen.getAllByText("مستحق علينا").length).toBeGreaterThan(0)` (`:956`) and `...("مستحق لنا").length).toBeGreaterThan(0)` (`:969`). `> 0` passes if **one** of the two surfaces (entry balance phrase, max-payment phrase) is prop-driven and the other is not. The name promises "the entry **and** the max"; the assertion cannot distinguish 1 from 2. The `VoidEntryDialog` case (`:912`) is tighter because it checks presence **and** absence.

### C5 — Absence assertions use exact-text matching, so an embedded opposite phrase slips through (severity 2)
`expect(screen.queryByText("مستحق لنا")).toBeNull()` (`:927`, `:941`, `:959`, `:972`) matches only elements whose *normalized full text* equals the string. If the opposite phrase ever appeared concatenated inside a larger label (e.g. `مستحق لنا · 5,000`), the assertion stays green. Negative coverage is narrower than it reads.

### C6 — 13 of 14 `dashboardPage.*` i18n keys become unreferenced, with no gate and a regeneration hazard (severity 2)
After the deletion the only surviving consumer is `dashboardPage.outstandingDebts` at `apps/web/src/features/app-shell/home-view-copy.ts:347`; the other 13 keys (`apps/web/src/i18n/resources/ar.ts:1178-1195`: `title`, `description`, `totalValue`, `agingAnalysis`, `topDebtors`, `quickActions`, `addInvoice`, `recordPayment`, `transferStock`, `viewReports`, `noData`, `noDebts`, `loadError`, `assets`, `overdue`) have no caller. There is no unused-key gate, so nothing catches it by accident:

```
$ grep -n "unused" scripts/check-i18n-keys.mjs
NO unused-key check
```

But `scripts/generate-i18n-ar.mjs:193` shows the generator *does* delete dead key blocks (`deletePath(resource, "debt") // dead top-level block (unused keys)`). The next regeneration can therefore silently drop the whole `dashboardPage` block and churn `ar.ts` — the design doc notes the keys but does not flag the generator behaviour.

### C7 — The "already shipped / already required" claim (the load-bearing assumption of the whole lane) — **attacked and confirmed true**
Verified directly at BASE, not from the design doc:
- `git show origin/develop:apps/web/src/features/debts/void-entry-dialog.tsx` → line 34 `accountDirection: DebtAccount["direction"]` (no `?`), with the JSDoc "The account's ledger direction, so an opening balance is phrased unambiguously."
- `git show origin/develop:apps/web/src/features/debts/record-entry-payment-dialog.tsx` → line 38 identical, required.
- HEAD `debt-ledger-panel.tsx:256-268` — the only production call sites pass `accountDirection={debtAccount.direction}` (both dialogs).
- The prop genuinely drives the phrase: `void-entry-dialog.tsx:63-65` and `record-entry-payment-dialog.tsx:63-66` feed `direction: accountDirection` into `getDebtAccountBalanceDisplay` (`debt-utils.ts:89`); a grep for `مستحق` inside both dialogs returns nothing, i.e. no local sign-based phrase derivation survives.
The lane was right **not** to re-implement the prop: redoing it would have been a no-op duplicate of `0da0a275` (#458/#471). This is the one thing the diff gets unambiguously right, and it is verified, not assumed.

### C8 — Out-of-scope creep / lost coverage check (severity 1)
`git status --porcelain` is clean; nothing in the diff touches production behaviour. Removing the dead card block loses no test coverage: repo-wide grep shows zero imports of the deleted file, including from `tests/e2e/`, and the live, tested equivalents are `features/reports/report-builder.tsx` and `home-view-copy.ts` (already flagged dead in `.scratch/reviews/debt-terminology/f8cf1b3d-*`). No finding — recorded so the "worse codebase?" attack is answered with evidence rather than silence.

---

## Defender replies

**D1 (to C1), confidence 8/10.** `docs/COMPLETION_STATUS.md:73` is a historical delivery ledger keyed to commit `e51e203`, not a live reference index. Rewriting history logs every time a file is later deleted produces churn in a file that already documents 500+ files. `docs/` is genuinely out of the codebase's import graph, so no build, typecheck, or runtime path is affected. At worst this is one stale line; it is not a defect the diff introduced.
**Counter:** the line still reads as a live inventory entry (`- [x] … - Dashboard layout`), and the cheapest possible correction (append "(removed in #460)") is a one-line diff. Keeping it is defensible; the design doc should have *recorded* it instead of the grep being blind to it.

**D2 (to C2), confidence 9/10.** The greps that were run are stronger than the critic allows: `grep -rn "VoidEntryDialog\|RecordEntryPaymentDialog"` over all `apps/` shows only one production consumer, and a worktree-wide grep for the deleted symbol finds no `import()` string, no route table, no Playwright selector. Vite/TanStack route generation is file-path based and the route tree is `apps/web/src/routes/**`; the deleted path was `features/dashboard/`, never a route file. Also, at HEAD the directory `apps/web/src/features/dashboard/` no longer exists at all (`find apps packages -type d -name dashboard` → empty), which is only possible if that directory held exactly one file — so no sibling in that folder is orphaned either.
**Counter:** the critic's complaint is about method (what was *searched*), not the outcome; the outcome is clean and the defender's evidence closes it.

**D3 (to C3), confidence 6/10.** The tests are mis-labelled as the issue's verification (which they cannot be, since the prop predates the branch), but as lock-in they are *not* tautological in the way the critic means: both renders use `signedAmountDzd = 5000` — the same sign (`:913`, `:944`). A sign-based implementation would emit one phrase for both renders, so exactly one of the paired assertions must fail. The tests therefore discriminate "phrase follows the prop" from "phrase follows the sign" at runtime. The design doc states the limitation openly instead of dressing it up.
**Counter:** correct on substance; the framing is the flaw, and the doc's honesty partly cures it. Marked as note, not defect.

**D4 (to C4), confidence 5/10.** `getAllByText(...).length > 0` combined with `queryByText(opposite) === null` still proves *some* prop-driven phrase exists and that the opposite phrase is fully absent — enough to fail a full sign-based regression. Requiring an exact count couples the test to how many times the phrase is repeated in the markup, which is incidental.
**Counter:** the defender's own defence concedes the gap — with two surfaces and one orientation asserted only as "≥1", the test passes if the max-payment phrase silently regresses to sign-based phrasing. The `it()` string claims two surfaces. Cheap to tighten, so tighten.

**D5 (to C5), confidence 7/10.** `getDebtAccountBalanceDisplay` (`debt-utils.ts:89`) renders the phrase as its own unit; concatenating the opposite phrase into an amount label is not a shape any current call site produces. The absence check is adequate for the shapes that exist today.
**Counter:** threat is future-shaped and the current assertions are adequate; note only.

**D6 (to C6), confidence 7/10.** Deleting unrelated i18n keys would sprawl into `ar.ts` (1400+ lines, generator-owned) and is explicitly out of the issue. The gate that exists checks *missing* keys, not unused ones, and it passes (`0` missing). No lint, test, or build fails because of the orphaned keys.
**Counter:** the generator-deletes-dead-keys behaviour (`generate-i18n-ar.mjs:193`) means the orphan set is *transient churn waiting to happen*; that deserves a filed issue, not silence.

**D7 (to any "worse codebase" claim), confidence 9/10.** −141 dead lines, +84 lines of characterisation tests, one design doc following repo convention (`.scratch/implementation/` is un-ignored and already holds 502 tracked files at `origin/develop`). Nothing production-facing changed, so the diff cannot regress user-visible behaviour; `debts-mvp-web.test.tsx` is 33/33 green at HEAD.

---

## Synthesis

| # | Finding | Severity | In scope | Verdict | Action |
|---|---|---|---|---|---|
| C7 | "already shipped" assumption is load-bearing | — | yes | **DISMISS (confirmed correct)** | Verified at BASE: `void-entry-dialog.tsx:34`, `record-entry-payment-dialog.tsx:38` required; `debt-ledger-panel.tsx:256-268` pass `debtAccount.direction`; phrase path via `debt-utils.ts:89`. Note in PR that re-implementation was considered and correctly skipped. |
| C8 | Deletion loses coverage / creep | 1 | yes | **DISMISS** | Repo-wide grep: no importer, no e2e selector; `features/dashboard/` held only this file; live equivalent covered by `report-builder.tsx`. |
| C3 | Tests green before and after | 3 | yes | **DISMISS (with doc correction)** | They discriminate sign-vs-prop at runtime (both renders `+5000`, `:913`/`:944`); the mislabel is framing, already conceded in `460-design.md` "Risks". Defender's counter holds. |
| C4 | `RecordEntryPaymentDialog` test asserts `> 0`, name claims two surfaces | 3 | yes | **FIX (cheap, ~5 min)** | Tighten `:956`/`:969` to pin both surfaces (assert count `2`, or assert the entry phrase and the max-payment phrase separately). Not a merge blocker. Not applied — this review is read-only. |
| C2 | Method gap in the deletion's safety search | 2 | yes | **DISMISS** | Defender closed it with fresh evidence (dir gone, single file, no route file, no `import()`). |
| C5 | Negative assertion is exact-text only | 2 | yes | **DEFER — note in PR** | Current render shapes make it adequate; record as residual risk in the PR body. |
| C6 | 13 orphaned `dashboardPage.*` keys; generator deletes dead keys | 2 | no | **DEFER — file an issue** | `ar.ts:1178-1195` minus `outstandingDebts` (`home-view-copy.ts:347`). Correctly out of scope for #460; pair it with `generate-i18n-ar.mjs:193` behaviour. |
| C1 | `docs/COMPLETION_STATUS.md:73` still lists the deleted file | 2 | borderline | **FIX if trivial, else DEFER** | One-line append "removed in #460"; otherwise file with the i18n cleanup issue. Not a blocker. |

**No blockers (severity 8-10) were found.** The critic's strongest structural attacks (C2, C3) were disproved by direct verification, not by argument.

### Verdict

**APPROVE** the diff as-is — no must-fix items, no regressions, tests green.

Two recommended follow-ups, both non-blocking:
1. **Fix (cheap):** tighten `apps/web/src/features/debts/debts-mvp-web.test.tsx:956,969` so `RecordEntryPaymentDialog`'s test actually pins both phrase surfaces, matching its own `it()` name.
2. **Defer → GitHub issue:** prune the 13 orphaned `dashboardPage.*` keys in `apps/web/src/i18n/resources/ar.ts:1178-1195` and, in the same issue, note that `scripts/generate-i18n-ar.mjs:193` deletes dead key blocks, plus the stale `docs/COMPLETION_STATUS.md:73` line.

**Residual risks carried forward:** (a) negative direction assertions use exact-text matching and would miss an embedded opposite phrase (`:927`, `:941`, `:959`, `:972`); (b) the tests lock runtime behaviour only — a future change making `accountDirection` optional again would still compile and only fail these tests at runtime, not at typecheck; (c) the i18n orphan set can churn `ar.ts` on the next generator run.
