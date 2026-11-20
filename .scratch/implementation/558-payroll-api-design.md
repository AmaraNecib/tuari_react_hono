# #558 payroll API implementation

Base: `4cf808a90d62dd2d42c20356c7d4e7b3372ba045`. Verification mode: `focused-local / CI-final-pending`. Tier: high-assurance because these procedures write employee wages and advances through authenticated financial commands.

## Scope

This slice adds the owner-approved four top-level workforce RPC operations: `employeePayrollGet`, `employeePayrollCashRecord`, `employeePayrollAdvanceRepay`, and `employeePayrollAdvanceOffset`. It exports exact-string input and bounded output schemas, uses the existing payroll lifecycle/service and existing financial audit wrappers, and adds an opt-in composition that accepts the caller's database, FIFO and already shared exact-finance service/repository.

The regular root router registers explicit `SERVICE_UNAVAILABLE` handlers until the parent supplies the normal exact-payroll composition. That path authenticates first and performs no writes. No schema preparation, normal startup activation, UI changes or numeric-writer changes belong to this slice.

## Domain and interface

An earning is approved work with existing `employee_earning` identity. Cash payment records explicit earning allocations and may include an explicit new advance. Advance repayment is a separate cash event. Wage/advance offset is a paired noncash event and accepts only current `EARNING` and `ADVANCE` source kinds. Finance remains the balance and replay authority. The lifecycle read reports project allocation separately from wage balance and leaves an unknown opening review explicitly unknown.

The public seam is the four-procedure oRPC contract. Amounts use exact decimal strings. Individual persisted amounts validate through `Money`; aggregate report totals use a wide decimal-string schema because their sums can exceed one persisted `Money` amount. Strict inputs reject audit identity, actor and transaction metadata. The router takes those values only from `mutationAudit`'s authenticated bootstrap-owner context. Reads use `queryAuth`, matching existing financial routes.

`createExactPayrollComposition` accepts one prepared SQLite connection, one FIFO, the already shared exact-finance service and its repository, RPC middleware and ID/clock dependencies. It creates no database, finance fallback, schema or startup activation. The optional opening provider flows only into the lifecycle reader. Current write commands continue to refuse opening source kinds until a real provider is implemented.

## Proof plan

Use native plain and keyed SQLite with existing employee/earning/segment tables, exact-finance schema, and prepared payroll cash/offset schema. Exercise the actual `createRouterClient` procedure and auth middleware, not direct calls to middleware wrappers. Assert exact lifecycle values and project cost, replay/conflict behavior, invalid exact money, foreign earning rejection, anonymous and nonowner refusal, forged audit rejection, and contract output parsing. Existing command/lifecycle tests remain complementary proof for source/receipt rollback, offset/repayment balances, unknown opening reminders and native persistence.

## Design assessment

The existing lifecycle and command modules are deep enough for this caller. The router delegates all financial behavior and only binds trusted audit context. The opt-in composition is the adapter seam for prepared-schema integration; the parent owns its connection to normal application startup. Adding handlers to the regular root without dependencies would risk an implicit numeric writer, so those endpoints fail explicitly until the exact composition is provided.

Deletion test: removing the router eliminates authentication, strict RPC validation and server-only audit binding; moving those rules into callers would duplicate them. Removing the composition leaves each test and future caller to construct the same repositories and lifecycle with the risk of a private finance instance or mismatched connection. No existing financial behavior changed.

## Accepted review corrections

The three initial reports at reviewed HEAD `81572a837a85018502ee0a7618b0d56a06d52e5e` accepted four corrections. Their source findings are implemented here; the original review reports remain read-only evidence in the parent worktree.

Opening wage and advance balances are aggregate report values. They use the same wide, nonnegative decimal-string schema as summary totals. Individual openings, cash events and persisted ledger entries remain bounded by `Money`. An RPC regression creates two maximum-sized `PAYROLL_OPENING` `ADJUSTMENT` originals in each direction. Unrelated opposite-signed adjustments keep each real worker account balance inside the storage limit without changing either opening source remainder. The reader and prepared RPC return the expected `184467440737095516.14` wage and advance totals.

Payroll errors now distinguish caller mistakes from server faults. `PayrollDomainError` carries explicit `BAD_REQUEST`, `NOT_FOUND` or `CONFLICT` codes for expected source selections and over-settlement. `ExactDebtError` retains its code but maps to fixed client-safe text. Zod input errors remain `BAD_REQUEST`; unexpected storage, integrity and programming errors return `INTERNAL_SERVER_ERROR` with fixed public text and retain the original cause on the server error. Output-schema failures also return a fixed internal error. Authentication and license errors still come from the existing middleware unchanged.

The prepared composition now has two complementary proof paths. `exact-payroll-composition.test.ts` injects independent failures at allocation-source insertion and aggregate receipt persistence. For each, exact native snapshots cover earnings, segments, cash, allocations, advances, repayments, offsets, debt accounts and entries, `debt_command`, and `exact_finance_command`. A retry with the same request ID creates one cash event, returns the stable result, and leaves exactly `10000.00` on each `35000.00` earning after its `25000.00` payment. The test closes and reopens SQLite, replays both requests once, then checks the same remaining balances.

`exact-payroll-auth.integration.test.ts` creates a real BetterAuth owner through `AuthBootstrapService`, creates a real nonowner through BetterAuth's internal adapter, and creates sessions through that adapter. `SessionService` and the actual bootstrap-owner service flow through `createRpcContext` and `createExactPayrollComposition`. Payroll tables and exact finance live in a separate prepared database; the auth root uses its own database and real app auth schema. This proves authentication and owner identity at the prepared payroll seam, not acceptance of the normal financial composition root. The test covers plain and keyed native connections, a real `25000.00` payment against `35000.00`, the resulting `10000.00` remainder, server actor and UUID audit values, anonymous/nonowner/forged-audit refusals, session resolution after payroll reopen, and durable replay.

The old cash-header failure did not prove aggregate receipt rollback, and the request ID was never a valid comparison for the generated cash record ID. Both claims are replaced by trigger-specific exact snapshots; the API test now asserts safe internal errors rather than misclassifying injected SQLite failures as bad requests. A separate corrupted allocation-link case proves integrity failures do not leak storage details. An invalid server response case proves output failures do not become `BAD_REQUEST`.

Wisdom applied: exact-source snapshots detect rollback across the aggregate's actual tables; do not compare generated record IDs with request IDs. Preserve existing bootstrap-owner wrappers, actual BetterAuth session resolution and exact-finance transaction identity. Excluded: full normal-root payroll activation, UI integration and schema/startup changes. Lesson candidates: none.
