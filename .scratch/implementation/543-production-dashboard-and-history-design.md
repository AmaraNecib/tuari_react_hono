# Production dashboard and employee history integration

PR #541, base `343151c8ef50c6ef324f02c267a8cc0a670792fc`. Mode focused-local / CI-final-pending. High-assurance applies to retaining exact salary-reference history and refusing unsupported financial reads.

## Real dashboard, explicit capabilities

Reuse the existing DashboardSection rather than the reduced workspace's dashboard paragraph. Add an optional financialFeaturesAvailable input defaulting true so existing legacy consumers retain their behavior. In the normal exact workspace, the caller passes false: debt, invoice and inventory aggregate queries are disabled; those unavailable values are explicit rather than fake zeros or endless loading. Supported project/warehouse actions remain real links. Unsupported invoice/transfer actions are disabled with a shared explanation. A null counterparty count means unavailable, not zero. The parent project/warehouse integration worker owns the WorkspaceShell caller and will connect actual employee/project/warehouse/role counts.

The negative test failed before implementation because the financial hooks were called with no disabled flag. After correction the dashboard section and metric tests pass, 11 tests across two files. Existing default-mode metrics and query behavior remain covered.

## Employee detail preservation

The production employee composition used RecordHistoryTable but omitted each stored row's salary reference. Showing only the current profile reference would lose the earlier exact historical value. Extend the existing row interface with optional ReactNode detailContent and supply ExactSalaryReferenceValue for each historical row. Existing string notes still pass through CurrencyProse unchanged. No monetary parsing or numeric bridge is added. Add a functional back action to the record frame and use the employee-list title/add action instead of a create-page heading.

The strengthened exported detail-page test failed before correction because 0.0001 was absent from the history table. After correction, 27 tests across the employee page and direct shared frame files pass. This is real presentation regression coverage, not a native or browser mutation claim. The test does not delete or rewrite a stored record.

Both changes reuse existing production modules. They do not enable deferred financial APIs, alter contracts/schema/license policy, or mutate the desktop database. Native acceptance is owner-deferred; publication, current-head hosted checks and full-application enablement remain separate gates.
