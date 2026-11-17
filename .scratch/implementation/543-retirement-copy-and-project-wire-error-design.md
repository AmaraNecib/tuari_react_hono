# Remove conflicting retirement retry copy and expose project wire errors

Parent base08f29331. Two bounded UI error-boundary corrections, mode focused-local / CI-final-pending. No storage protocol, receipt fingerprint, schema, contract, dependency or CI change.

## Retired approval message

Prior review retired-form-7ce4c4c3-review-01.md P2: the retired form still shows a generic retry alert alongside reload guidance. The editor catches all non-license exceptions as retryable generic failures. Introduce the explicit MonthlyApprovalRetiredError outcome at the recovery boundary and recognize only that class in the editor. It clears the generic error instead of offering a retry while the parent form remains locked with the existing translated reload control. Ordinary errors and UPGRADE_REQUIRED retain their respective notices. Stale record absence is not claimed as success. Extend the actual two-form regression to require absence of both generic retry and uncertain-retry messages. It initially fails in retired-message-red-01.log, then passes with the whole affected selection.

## Supported project wire validation

The existing E2E test for161-character names reaches the real project wire gate, but useCreateProjectMutation previously displayed ORPC's generic Input validation failed text, ignoring its attached field issues. Use the installed, existing buildErrorMessage helper only for this mutation's error toast. Preserve thrown errors, mutation rejection, form draft and navigation behavior. No validation limit or test expectation is weakened. Hook regression initially has an incomplete RPC module mock (red-01 import error), corrected to preserve the actual orpc query-key builder; the meaningful red-02 then fails on the generic toast. After the one-line error mapper correction it exposes the actual160-character refusal.

Five focused files pass34tests in13.44seconds: retired-message-project-wire-green-01.log. Full web tsc and affected lint exit0. The exact project validation browser case passes under heavy_run run-validation-wire-01.ps1 using disposable API4418/web3100/database, not live native data. It asserts real400 response, visible160-character message, preserved161-character draft and unchanged create route. E2E spec/helper changes remain part of the separate uncommitted alignment scope, so this is explicitly application source plus that test delta, not clean-tree full-suite acceptance.

Service coverage tests are separately reviewed pass/0findings with72tests and100% coverage for the two selected services. Other E2E/CI acceptance remains open. Fresh bounded combined review must carry previous resolved findings forward and inspect both UI message boundaries. No merge or auto-merge without owner's decision, regardless of green checks/score.
