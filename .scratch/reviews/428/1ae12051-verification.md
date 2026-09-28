# #428 verification evidence — `1ae12051a16110ebc5d8081e0ea74ff7243aa090`

- base: `develop` @ `9949146208d276915b31f28ba9a95788a6e113f5`
- branch/worktree: `fix/428-datepicker-audit` · `worktrees/fix-datepicker-audit`
- review tier: Standard
- mode: remote (local-only commands run; parent owns push/PR)

## Commands and results (all run from the worktree root)

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | ok (fresh worktree) |
| `pnpm --filter @tuari/contracts build` | ok (web tests resolve the contracts dist) |
| `pnpm --filter @tuari/web typecheck` | PASS (exit 0) |
| `pnpm --filter @tuari/web lint` | PASS (exit 0, eslint no findings) |
| `pnpm check:unslop` | PASS (0 errors; 1650 pre-existing warnings) |
| `pnpm --filter @tuari/web test --maxWorkers=2` (full suite, end of lane) | PASS — 78 files, 659 tests |
| scoped v8 coverage: `src/components/ui/date-picker.tsx` | 100% lines, 84.6% branches (uncovered: defensive early return, DayPicker JSX attrs) |

Greptile is intentionally not run: the parent's brief states the review account
is in a cooldown and the parent handles reviews.

## Per-screen regression tests (the shape that catches the class)

All assert the **submitted** value after a real pick (`data-day` cell click on
the live `react-day-picker`), not the displayed text:

- `TransferItemDialog` → `occurredAt`
- `RecordPaymentDialog` → `entryDate`
- `AddSalaryPaymentDialog` → `paymentDate`
- `EmployeeDebtPanel` → `entryDate`
- `DebtLedgerPanel` → `entryDate`
- `DebtCasesPanel` → `openingEntryDate`
- `DebtCreatePage` → `openingEntryDate`
- `EmployeeDetailsPage` finance inline form → `paymentDate`
- `InventoryInvoiceCreatePage` invoice date → `invoiceDate`
- `InventoryInvoiceCreatePage` asset purchase date → `entries[].assets[].purchaseDate`
- `DateRangeFilter` (system log / audit log / reports) → canonical callback arg

Component contract tests in `date-picker.test.tsx` cover canonical-in/out,
legacy `dd/MM/yyyy` normalization, empty and invalid values.

## Notes / residuals

- `audit-log-page` still compares `new Date(startDate)`; format is now canonical
  (parses as UTC midnight) — no semantic change intended beyond the format fix.
- The asset purchase date previously fed `new Date("dd/MM/yyyy")`, which JS
  parses as US month-first (silent wrong day) — the new test pins the canonical
  output.
