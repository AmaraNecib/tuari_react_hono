# #543 employee references and approved earnings

## Authority and current state

This note records the current project-level design for #543 against parent HEAD `dfe3bc04fc460deda88b60015d7cc094d49c1ecb`. Verification mode is `focused-local / CI-final-pending`; the feature is high-assurance because it writes and reports approved earnings. This documentation-only consolidation does not change source or tests.

The accepted #522 exact-money contract, field classification, and ADR remain normative and untouched. #543 implements one workforce slice of that design. V1 is DZD-only. This work does not convert every money field, add currency selection or FX, or claim multicurrency support. The owner confirmed there is no old dataset to migrate; do not invent a historical conversion or migration gate.

## Domain decisions

A salary reference is optional, period-tagged context, not earned wage, a payroll liability, a payment ceiling, or permission to prorate. DAILY accepts up to four decimal places; MONTHLY and legacy WEEKLY references use two. Changing the period does not reinterpret or convert the amount. Missing, zero, and nonzero references remain distinct. An employee can receive an explicit earning approval without a reference. No automatic salary proration or ceiling is introduced.

An approval is an immutable earned-wage record, separate from legacy cash-payment history. It stores the exact approved total, explicit unallocated amount, period, optional reference snapshot, and ordered project segments. Segment IDs are stable and unique within an approval; repeated project IDs are valid, so A/B/A remains three distinct rows in original order. Each segment has its own explicitly approved amount and days. No row edit silently changes another row or the total; no approval silently reallocates amounts. Allocated segments plus unallocated amount must equal the approved total. Approval retries reuse the same request ID and frozen payload after an uncertain response, so a retry cannot create a second earning. Only a response that establishes no write permits correction of a first attempt.

Money enters and leaves the feature as exact decimal strings. The path uses the accepted #522 exact-money types and integer persistence; new earning amounts never cross JavaScript `Number`. The existing `Number` uses for bounded day counts or presentation-only ratios do not authorize numeric money conversion.

## Module ownership and compatibility

`WorkforceService` owns approval validation, employee/project checks, request idempotency, and the transaction boundary. `EmployeeEarningRepository` owns immutable approvals and ordered segments. Its SQLite adapter persists scaled integer amounts and reads exact text projections. Employee and employee-history repositories own the optional salary-reference value and historical snapshots. The project-cost repository is a read-only consumer of approved earning segments; it does not derive a day rate or recompute an approved amount. The authenticated workforce RPC exposes approval and history through the normal router and configured application dependencies.

The original employee list, batch-create, edit, detail, salary, and project-cost pages remain the application surfaces. The approval dialog composes the existing production controls, mutation/query hooks, validation translation, and RTL layout. Employee list, detail, and salary entry points open that flow. Validation adapters translate only registered identifiers and preserve field paths; unknown server messages remain literal. Existing search, filtering, pagination, history, navigation, loading, error, and empty states remain. Do not replace production routes or pages with test-only or narrowed alternatives.

Approved earnings and legacy cash payments are separate concepts and displays. The legacy salary-payment write path rejects new numeric writes; its historical records remain read-only history and do not become earnings or labor cost. The `exact_money_schema` compatibility marker identifies only the workforce v1 slice. Normal initialization validates the workforce tables before writing the marker; older binaries that reject the marker fail closed. The marker does not activate the separate exact-money expense adapter or claim app-wide money conversion.

The legacy expense path is a settled, narrow boundary. Existing expense storage still uses REAL, and the exact expense adapter is not selected by production dependencies. In parent-integrated fix `e4159afd`, project-cost reads the legacy REAL through SQLite's native numeric decoder, then applies `Money.parse(String(row.amount))`. Casting this REAL to TEXT had rejected valid high whole amounts. Authenticated readback tests cover `1000000000000000` and `Number.MAX_SAFE_INTEGER` as exact `.00` strings. This is not exact expense storage or #530 conversion. Approved earnings keep their existing text/int64 reads unchanged.

## Proof and remaining gates

Existing feature and integration tests cover exact salary references, approval validation and idempotency, ordered segments, retry recovery, authenticated persistence, startup-marker compatibility, and project-cost readback. The parent reports 103 focused tests passed, with typecheck and lint passing for expense follow-up `e4159afd`; that commit also corrected the missing-days router fixture. This documentation lane does not import that source commit or rerun its checks. Earlier failed attempts and their logs remain in local notes/reports; they are not erased or restated as if they did not happen.

Affected local proof, three required review lenses (`debate`, `test-audit`, `code-review`), current-head hosted review, and current-head `CI acceptance` remain separate gates. Protection activation is pending. Greptile review is pending and must be requested only once for an authorized pushed head. No merge or release is authorized by this note.

## Inventory writer compatibility correction

This implementation follows the accepted #522 scales without converting inventory storage. Public purchase inputs remain numeric. Final purchase amounts, including asset purchase prices and consumable line totals, reject more than two fractional places. Entered consumable unit prices reject more than four. The contract and `InventoryService` use the same scale validator before persistence. Existing inventory quantities, safe-integer magnitude bounds, REAL columns, and stock-charge rounding remain unchanged.

The project-cost SQLite adapter reads the three affected legacy REAL values through SQLite's native number decoder before strict `Money` or `UnitPrice` parsing: asset-charge amounts, consumable unit prices, and parked asset purchase prices. It does not cast those REALs to text, which can emit exponent notation for large whole values. Exact approved earnings remain text/int64 and untouched. Expense already uses the native decoder; its path is untouched.

The source module's interface remains the existing numeric inventory RPC and the read-only project-cost repository. No new adapter or seam was added. The contract validator is shared by the public input schema and the service's direct-call validation, which keeps the rule local and avoids duplicate policy. Focused authenticated tests cover rejection paths, valid scales, large REAL readback and the existing `0.375` stock-charge result of `0.38`.

Applied wisdom: service-boundary defense-in-depth reuses a contract validator; output schemas validate without transforming; stale contract dist must be rebuilt before API tests. No repeated wisdom candidate identified.
