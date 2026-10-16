# Code review — #460 (two-axis)

- **Base:** `origin/develop` @ `79acb3591a6b3827d941ab8e8d7f7ef3f9571477`
- **HEAD:** `03ff355d54a8085d3e00ed98cdcea8ed5744c1f8` (`chore(web): delete the unrendered dashboard overview, lock the entry-dialog direction (#460)`)
- **Diff:** `git diff origin/develop...03ff355d` — 3 files, +165/−141. Worktree clean, single commit, no staged files.
- **Spec sources:** issue #460 ACs (given in task), `.scratch/implementation/460-design.md`. **Standards sources:** `AGENTS.md`, `docs/engineering-workflow.md` (lines 67–105, 130–160, 261–299, 372–378), `.agents/skills/code-review/SKILL.md`.

## Commands run (evidence)

| Command | Result |
| --- | --- |
| `git rev-parse origin/develop 03ff355d` / `git log origin/develop..03ff355d --oneline` | one commit; base+HEAD resolve |
| `grep -rn 'dashboard-overview\|DashboardOverview' .` (minus node_modules/.git) | matches only `.scratch/**` docs and `docs/COMPLETION_STATUS.md:73`. **No code importer, none under `apps/web/src`.**
| `git diff 79acb359...03ff355d -- void-entry-dialog.tsx record-entry-payment-dialog.tsx debt-ledger-panel.tsx` | **empty** — production interfaces identical base→HEAD |
| `grep -n 'accountDirection' apps/web/src/features/debts/*.tsx` | `void-entry-dialog.tsx:34` and `record-entry-payment-dialog.tsx:38` required `DebtAccount["direction"]`; only prod callers `debt-ledger-panel.tsx:259,265` pass `debtAccount.direction` |
| `git ls-files .scratch \| wc -l` + `.gitignore:42–46` | 503 tracked `.scratch` files; `.gitignore` re-includes `implementation/` and `reviews/` → committing `460-design.md` is repo policy, not noise |
| `pnpm --filter web exec vitest run src/features/debts/debts-mvp-web.test.tsx --testTimeout=10000` | **Test Files 1 passed, Tests 33 passed** (includes the 2 new tests) |
| `git status --porcelain` | empty |

## Standards

- **Correct / no violation.** Conventional-commit message, one logical change, only the named files in the commit (no `git add -A`). Test placement follows the existing per-feature `debt-*-web.test.tsx` file; test style matches neighbours (Arabic phrase via `getByText`, `renderWithProviders`). No generated files touched (`packages/contracts/dist` untouched), so the generation guardrail holds.
- **Note (low, judgement).** `record-entry-payment-dialog.tsx` test uses `screen.getAllByText(phrase).length).toBeGreaterThan(0)` rather than an exact node assertion — weaker than the `VoidEntryDialog` half, but the negative assertion (`queryByText(opposite)` is null) carries the load. Acceptable.
- **Note (low, smell — Data Clumps).** `entry` + `accountCurrentBalance` + `accountDirection` travel together into `RecordEntryPaymentDialog`; a small account-context type would be tidier. Not asked for by #460; skip.

## Spec

- **AC1 — grep then delete `dashboard-overview.tsx`: SATISFIED.** Grep over the whole repo finds no importer (only prose references in `.scratch/**` and `docs/COMPLETION_STATUS.md`); the 141-line file is deleted. `docs/COMPLETION_STATUS.md:73` still lists the deleted path as a deliverable — doc drift, **Note (low)**, no runtime effect.
- **AC2 — explicit `accountDirection` passed by the caller: ALREADY SATISFIED AT BASE, correctly not re-done.** Verified against base, not the claim: `git show 79acb359:.../void-entry-dialog.tsx:34` and `.../record-entry-payment-dialog.tsx:38` already declare it **required**, and the base call sites pass `debtAccount.direction`. The design doc's "already shipped (#458/#471)" claim is **accurate**.
- **AC3 — a test per dialog that the phrase comes from the prop, not the account's sign: SATISFIED.** `debts-mvp-web.test.tsx:888–968`. Both cases render with the **same positive** `signedAmountDzd: 5000` / `accountCurrentBalance: 5000` and only vary `accountDirection`; the dialog calls `getDebtAccountBalanceDisplay({currentBalance: entry.signedAmountDzd, direction: accountDirection})` (`void-entry-dialog.tsx:65`, `record-entry-payment-dialog.tsx:63,66`) and `getDebtAccountBalanceState` (`packages/contracts/src/debt-helpers.ts:115–129`) branches on `direction` **and** sign (PAYABLE→`owedByUs`/`مستحق علينا`, RECEIVABLE→`owedToUs`/`مستحق لنا`, table at `debt-helpers.ts:88–94`). One sign cannot yield both phrases, so the test passes only if the prop drives the phrase; the opposite phrase is asserted absent. Suite green (33/33), so no regression from the deletion.

## Verdict

**Approve.** Both axes clean: AC1 and AC3 delivered, AC2 verified-as-previously-shipped against the base SHA rather than taken on trust; the deletion is provably unreferenced. Findings are 3 low notes (weak `getAllByText` assertion, `COMPLETION_STATUS.md:73` doc drift, unused `dashboardPage.*` i18n keys — explicitly deferred by the design doc). No blockers.
