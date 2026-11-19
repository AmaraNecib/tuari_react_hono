# #558 explicit advance-against-wages provenance proposal

Status: proposed, awaiting owner approval of the new storage and command shape. The approved domain behavior is not being reopened. #427 already requires an explicit attributable reduction of wages payable and advances receivable without automatic netting, actual cash or new project labor cost. Reviewed source at `60c6752718c85a19cf4e5b3570614c5dc6f0b017` currently implements actual cash and separate cash repayment only.

## Concrete decision

Add one immutable provenance table, `employee_salary_advance_offset`, for the paired operation. Do not overload a cash repayment record with a fictitious payment date or cash event. This is a link between existing authoritative finance movements, not a second ledger or persisted current balance.

Proposed fields are stable event ID, employee ID, currency, exact `amount_minor`, operator settlement timestamp, wage source kind/ID, advance source kind/ID, wage original/payment entry IDs, advance original/payment entry IDs and existing actor/transaction/creation audit fields. Source kinds retain current earning/advance identities and reserve opening wages/opening advance identities for a real #545 provider. Unknown or unreviewed opening targets fail closed; no opening amounts or review records are created here.

Each linked payment ID is unique in this offset collection. Cross-collection attribution checks must also prevent claiming an already-recorded wage cash payment or advance cash repayment as an offset. Original/payment references use RESTRICT semantics. Amounts follow the accepted Money2 DZD-only, positive, reversal-safe int64 contract. The monetary inventory must classify the new amount field explicitly. No cost or remaining balance is stored.

One internal command accepts stable request ID, employee ID, explicit wage and advance sources, exact amount and settlement timestamp. It validates same worker/currency, opposite account directions, producer identities, live original obligations and enough remaining on both sources. Source existence comes from current earning/advance providers and later #545 providers, not raw ledger IDs supplied by clients. The command records the two producer-scoped negative PAYMENT entries, source provenance and the existing finance aggregate receipt within the same immediate transaction. It emits no cash header and changes no approved earning or project segment.

Example: unpaid wages of 10,000 and an advance of 5,000 remain separate until an explicit 2,000 offset. After that operation, wages owed are 8,000 and advance owed is 3,000. Actual cash history and project labor cost do not change. A later cash payment or advance repayment uses the remaining original sources normally.

## History and corrections

The first implementation exposes no delete, in-place edit or reversal operation. Physical update/delete/replace guards preserve its history, including recursive-trigger-off behavior. Generic debt commands must not bypass payroll producer ownership. A future reversal needs its own approved paired reversal event that restores both recorded amounts atomically. It cannot silently void one leg or reinterpret an old offset as cash. This is an initial scope restriction, not a permanent refusal of legitimate corrections.

## Proof and authority

Focused tests must cover full/partial/repeated explicit offsets, the 10,000/5,000/2,000 example, wrong worker/direction/currency/source, cross-collection duplicate attribution, over-settlement on either leg, immutable history, canonical retry/actor conflicts, first/second leg/provenance/receipt failure rollback, native plain/keyed close/reopen and unchanged actual project cost/cash history. Use current earning identities and real finance adapters.

No code or DDL implementing this proposal is included. Owner approval applies only to this new provenance and command shape. It does not authorize production schema conversion, application activation, public RPC contracts, publication, merge, release or changes to configured databases. Existing local source and evidence remain preserved. Verification mode stays focused-local / CI-final-pending, high-assurance.
