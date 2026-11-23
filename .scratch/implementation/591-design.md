# #591 inventory initial-payment method

## Authority and scope

Issue: https://github.com/AmaraNecib/tuari_react_hono/issues/591.
Mode: remote. Branch: chore/issue-591. Worktree: D:/worktrees/tuari_react_hono/t3-70ff5a79-3f68e37b14fed04f.
Fixed base: origin/develop at ea4a1ffa6cc072b6f6638b6a8c3301daa06c53ed. The supplied checkout predated exact inventory and was fast-forwarded before implementation.

The owner instructed this session to implement the issue without another permission request. Conversation stays Arabic; artifacts stay English. No schema migration or dependency addition is needed. Published create and detail contracts change within this approved issue scope.

Tier: High-assurance. Risks include false tender provenance, duplicate payments and partial financial writes. Verification: focused-local / CI-final-pending. Recheck effective protection before merge. Required initial lenses remain debate, test-audit and code-review in separate sessions. No merge is authorized by this note.

## Domain and interfaces

Payment method is the tender, CASH, BANK_TRANSFER or CHECK. Payment input mode is AMOUNT or PERCENT and changes only how the exact initial amount is calculated. Unknown tender is not CASH. A purchase's immutable original obligation owns payments through producer type/id and target entry ID.

`exactInventoryInvoiceCreateSchema` adds optional `initialPaymentMethod`. Invalid values fail contract parsing before aggregate work. Method metadata outside debt mode is rejected. For a zero effective initial payment, the service rejects supplied tender before saving any inventory or financial records. No tender and zero amount creates no payment.

`exactInventoryDetailSchema` adds an optional `payments` array of exact debt entries. Optional decoding preserves older aggregate receipts without inventing missing payment history. Current reads populate the array from the authoritative ledger, filtered by PAYMENT, purchase producer identity and target original obligation. These are payment history entries, not a guessed initial-payment marker. Every entry retains its payment ID and target ID. There is no new ledger or duplicate method column on the purchase.

The exact finance module adds `recordInventoryPayment`, restricted to INVENTORY_PURCHASE producers. It shares validated payment execution, ownership checks, currency checks, audit, bounds, replay and append logic with generic payment. Omitted inventory tender persists as NULL. Generic payment's existing CASH default is unchanged. Parsed aggregate intent includes the new method so changed-method retries conflict.

The existing `debt_entry.payment_method` column and exact repository mapping store tender. Historical entries are untouched, including previously implicit CASH entries. Their actual tender cannot be recovered safely. New NULL entries display as unspecified.

No-debt purchase behavior remains unchanged: purchase summary paid equals gross, but no debt PAYMENT record is manufactured. Outbound and later-payment commands retain existing behavior and are not presented as new tender selectors.

## UI behavior

The active exact purchase form uses the existing NativeSelect beside the first-payment amount/input mode. It appears only for a positive effective debt-mode initial payment. The default is explicitly unspecified; the UI does not assume CASH. Selection survives mode/disclosure changes but is omitted when the effective payment becomes zero or debt mode is off. The detail page displays owned payment history and tender labels. Existing Arabic resources and RTL form conventions are reused.

## Proof and boundaries

Observed red-first proof: the new service tests failed on absent payment projection and missing method rejection before implementation. Initial setup attempts failed first because dependencies and contract output were absent; frozen-lockfile installation and contract compilation restored the test environment without dependency changes.

Passing affected proof before initial review:

1. API inventory, producer and authenticated router files: 71 tests passed. New cases cover CASH/BANK_TRANSFER/CHECK/omitted across both input modes, exact -2.50 amount, payment/target/producer identity, native plain/keyed connection reads, replay conflicts, invalid tender and zero-payment rejection.
2. Mounted exact form and route files: 28 tests passed. Three tender cases cover selection, mode changes and omission at zero.
3. Actual progressive-disclosure purchase browser spec: 6 Chromium tests passed. The modified purchase selects BANK_TRANSFER and verifies its detail/history label after route reload.
4. API and web TypeScript checks passed. ESLint passed for changed API/web source and mounted tests. Contract compilation passed. Contract focused cases are also run before review.

The E2E selector reports full scope because the shared Arabic resource is critical. Full-suite acceptance remains CI-final; local browser proof targets the actual changed purchase flow rather than rerunning all browser specs. Native peer reads establish persistence across connections, not a full application restart. The initial browser command used POSIX environment syntax in a Windows queue shell and ran nothing; the saved PowerShell invocation corrected that and passed. A keyed test initially exceeded its timeout because it repeatedly opened keyed connections; one peer per test preserves assertions without repeated key derivation. An initial mounted run exceeded the tool timeout; serialized affected execution passed.

Evidence remains ignored under .scratch, not in commits. Hosted CI, hosted review, independent local lenses and merge readiness are not claimed by these local results. The installed impeccable skill refers to a missing reference/product.md; existing scoped UI conventions were used instead of inventing a replacement.
