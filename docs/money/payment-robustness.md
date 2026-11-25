# Payment robustness contracts

The fresh-exact application composition selects `createFreshExactAppDependencies` in `apps/api/src/index.ts`. Its router mounts the financial router and refuses legacy invoice and payment handlers on that startup path. The legacy payment handlers remain available to retained fixture/composition tests; they are not the normal startup implementation.

The exact invoice router exposes payment creation, allocation, deletion and listing through `ExactInvoiceService`. `Money` parses decimal strings into integer units, and `sumMoney` and `applyAllocations` preserve exact decimal arithmetic. The accepted policy is [Exact money contract](../adr/0001-exact-money-contract.md) and [Money foundation](money/foundation.md). This note adds no rounding rule.

`listPayments` sorts and paginates in common service code for both the in-memory and SQLite exact invoice adapters. Its cursor binds version, collection, sort field and direction, plus a typed sort value and row ID. A malformed cursor, or one created for another collection, field or direction, is ignored and pagination starts at the first page. Supported payment sort values are validated according to their field before applying a cursor.

Exact payment creation accepts a total and allocations in one command. Allocation sums and remaining balances use `Money`; for a total of `0.30` and allocations of `0.10` and `0.20`, the expected unallocated balance is `0.00`. The SQLite invoice and finance repositories share a connection and FIFO lock. The exact finance aggregate transaction composes repository writes on that connection.

`deleteUnallocatedPayment` runs inside the exact finance aggregate command, refuses any payment with allocation history, and deletes only a payment with no allocation rows. The SQLite transaction wrapper uses better-sqlite3 transactions, which create nested savepoints when called within an outer transaction. The command's delete and receipt participate in that wrapper. This describes the exact adapter only.

The retained legacy payment module uses a separate async repository. Its `deleteIfUnallocated` implementation takes an async lock and starts `db.transaction.immediate`; comments do not specify behavior when called inside a caller-owned transaction. Do not infer exact-adapter transaction guarantees for that legacy method, or treat it as evidence that every legacy payment defect has been fixed.
