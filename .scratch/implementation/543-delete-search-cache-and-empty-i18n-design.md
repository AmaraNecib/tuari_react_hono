# Refresh deleted employee search and cover empty salary translation

Base: `dc8f6dbec71a6eb026b0538a1d3e5c8dd9ae5a1e`.
Mode: `focused-local / CI-final-pending`.
Hosted run `44008914491` failed one E2E case and its acceptance aggregator. Greptile reported 4/5 with two P2 findings, `4594862095` and `4594862104`. No merge or auto-merge is authorized.

## Salary translation state

The previous correction incorrectly described the worker selector as always rendered. Source inspection shows it exists only when employees exist. The full hosted ordering creates and deletes the employee before the translation smoke, so this selector assertion fails on an empty database. Use the actual invariant: the salary page's translated description, rendered above both branches. Retain the specific salary heading and raw-key detector. Do not require either empty or populated state and do not remove salary translation coverage.

## Employee deletion cache

Exact global search reads the scoped `employeesList` query, while the employee table owns a separate paged read. Successful table deletion now invokes an optional completion callback through the existing exact table adapter. The normal workspace shell supplies invalidation of `['application', workspaceId, userId, 'employees']`. The table still reloads its page; failed deletion never calls the callback or removes the row. The callback returns its promise so deletion remains pending while active reference readers refresh. Server deletion policy and preserved financial/work evidence remain unchanged.

The table regression confirms successful deletion invokes completion. The browser regression warms real global search with the employee, closes the dialog, checks cancel before explicit delete, then reopens search immediately and requires no results for that employee. Its first run hit the two identical search placeholders in the list and dialog; scope both new inputs to the dialog. The final six-case browser run passes with the database empty for the salary translation case. Logs retain the initial locator failure rather than claiming that execution passed.

## Debt exclusion test

The old debt fixture used an unrendered party name and the wrong counterparty field. Replace it with a real `externalCounterpartyId` matching the cached external fixture. Give the debt its actual `id`, and let the boundary dialog expose descriptions as well as titles. Assert absence of the debt result's stable item ID, independent of how many entity types share the party title. Keep the external, inventory and invoice exclusions.

A mutation reintroducing only debts now fails at that debt assertion: `debt-only-mutation-red-01.log`. The safe production source was restored in `finally`. This proves debt-only leakage cannot hide behind the other family assertions. No application corpus change is needed; it already excludes debts.

## Verification and review

Three affected web files pass 31 tests in 23.33 seconds; see `delete-search-debt-green-02.log`. This includes an added refusal case proving the completion callback stays untouched and the row remains when the server rejects deletion. Full web typecheck, affected lint and strict changed-E2E TypeScript checks pass. The real employee and translation browser selection passes six cases through `heavy_run`, using API 4418, web 3100 and an owned disposable fixture; see `delete-search-i18n-02.log`. Native data and port 4318 remain untouched.

No schema, contract, recovery protocol, dependency, check selection, skip or threshold changes. A bounded independent review must assess these hosted finding resolutions and carry forward unchanged conclusions from the prior completed reviews. Full current-head CI and hosted verdict remain pending. The owner's absolute merge hold remains in force even with green checks and a 5/5 verdict.
