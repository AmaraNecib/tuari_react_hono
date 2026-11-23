# Exact report namespace

Base: `721854cfe47f21a8e3a1a4a371d3a39317d4976e`. Verification mode: focused-local / CI-final-pending. Tier: high assurance because reports expose exact money and authenticated financial data.

This change publishes the reviewed exact report output schemas and adds `financial.reports.generate`. Its input reuses the existing report selector and date-window validation. The output discriminates DEBT, INVENTORY and MOVEMENT, preserving decimal-string monetary fields and nonmonetary counts. The router accepts an optional report capability; existing financial callers remain valid, and absent capability reports fail only after query authentication. The selected application root remains unchanged and reports are not activated there.

The capability boundary is intentionally small. The root will later construct readers over its shared native database/FIFO graph. No numeric legacy report service is used. Report reader calculations and semantics are unchanged; only their schema imports now use the published contracts package.

Domain terms retained: report type, date window, outstanding balance, purchase-entry inventory projection, outbound document count. The new router is a thin adapter, not a new report service. Deletion test: removing the exact output schema rejects malformed monetary outputs; removing authenticated middleware permits anonymous access; removing optional-capability handling loses explicit SERVICE_UNAVAILABLE behavior. No broader seam moved.

Wisdom applied: exact money remains canonical decimal strings; auth must precede unavailable capability errors; Zod refinements must account for empty values where relevant. No matching exact-report-specific wisdom lesson was present. No lesson candidate identified.

## Implementation and proof

Worktree: `D:/worktrees/tuari_react_hono/t3-c16578ef-ca25c7d449170a5b`. The prior draft at `D:/worktrees/tuari_react_hono/t3-48fac469-386bb613c987bb4a` was inspected at the supplied base. Only the nine authorized paths were imported. Its source and any prior failure evidence remain untouched. The draft supplied namespace/auth assertions but no native integration, so this is draft-first work, not a claimed test-first implementation.

The production `createExactReportCapability` adapter dispatches to root-owned readers. It constructs neither a ledger nor a connection. The report router parses concrete output and uses the existing report error resolver: explicit ORPC and appError codes retain their meaning; untyped failures are rethrown without message-based guessing. Existing three-argument financial-router callers remain supported.

Native integration uses actual fresh exact schema, a single financial graph and FIFO, BetterAuth bootstrap/session records and the real SessionService/RPC context on plain and keyed files. It covers all three dispatch paths, values wider than int64, the 60-day debt threshold and current balances under a historical activity filter, purchase quantity/location after partial transfer and outbound, raw outbound movement counts separate from SALE/RETURN/GIFT documents, dates, unavailable/auth ordering, malformed outputs, shared-lock refusal, and unchanged serialized database/total_changes. Contract tests cross the package barrel, validate each concrete schema and preserve ISO input conventions.

Chronology: a frozen ignore-scripts install restored pinned dependencies. The existing plain SQLite install lifecycle ran from the actual pinned package directory through heavy_run. Multiple-ciphers used its shipped prebuild. Contracts build was required for the new published imports and ran through heavy_run. Two initial integration failures were fixture mistakes: omitted bootstrap dependency in the permission resolver and non-ISO catalog timestamps. They are preserved as setup failures, not behavioral red. The first API typecheck identified an invalid test-only graph property, subsequently replaced with the purchase result.

A reversible discrimination probe changed DEBT dispatch to INVENTORY. Both plain/keyed integration cases failed on the concrete type/summary assertion. Production dispatch was restored before final proof. The expected failure is mutation evidence, not red-first history. Local focused execution passed 37 API tests and 14 contract tests, with contracts/API typechecks and scoped API lint. Raw commands, durations, retries and final fingerprints are recorded under ignored `.scratch/reviews/reports/`.

Wisdom applied includes the exact 60-day aging threshold and shared native transaction/FIFO discipline. No new transaction or schema decisions were made. No dependencies, manifests, calculations or selected-root activation changed.

Parent owns all three initial review lenses, scoped architecture review, root injection, consumer work and CI-final acceptance. This staged namespace is not full selected-root acceptance.
