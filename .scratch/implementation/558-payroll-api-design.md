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

Wisdom applied: read the matching payroll/auth lessons; use the existing bootstrap-owner financial wrappers and exact-finance transaction identity. Lesson candidates: none.
