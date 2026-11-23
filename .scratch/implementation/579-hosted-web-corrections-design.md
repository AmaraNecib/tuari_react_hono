# Hosted Web corrections for #579

## Scope and authority

Base: `6587e466cdc5913c28777362740a0270ffb8fe6d`.
Worktree: `D:/worktrees/tuari_react_hono/t3-15e1c437-2da22a17df158042`.
Mode: focused-local / CI-final-pending. High-assurance bounded correction;
the parent owns the fresh combined-delta review, publication and hosted gates.
Recover the existing punctuation draft without changing outbound mounting,
definitions, financial calculations, endpoint identities or contracts.

Changed files:
- `apps/web/src/features/app-shell/home-view.test.tsx`: align the shell assertion with its existing shared adapter and exercise actual catalog routing.
- `apps/web/src/features/inventory/inventory-exact-page.tsx`: replace only the movement endpoint join separator.
- This design note.

## Diagnosis and chosen correction

The shell imports shared workspace fixtures that also mock ExactInventoryPage.
That shared mock owns invoice-detail query-state observations and emits
`exact-purchases` when no initial invoice ID is supplied. The duplicate local
mock emits `exact-inventory-page`, but does not win the composed fixture setup.
Remove that competing mock and assert the shared adapter's existing marker.
Keep ExactFinancialRoutePage real. Both transfer-history and inventory cases
retain positive owning-page and negative other-page assertions. The inventory
case additionally opens the real catalog and returns to stock. Transfer history
must not contain the inventory navigation. This detects a wrong wrapper or
catalog mapping rather than accepting any heading.

The unchanged Arabic-source guard includes U+060C, so the Arabic comma in
PurchaseMovementHistory's endpoint separator fails it. Use the neutral comma
already suitable for a structural separator. Labels still use translations,
endpoint selection and lookup retain their typed IDs, and missing labels retain
the ID fallback. No locale leaf or scanner exemption is needed.

## Domain and architecture

An inventory purchase is not a generic invoice. A movement endpoint remains a
typed warehouse or project identity, independent of its display label. No term
or domain relationship changes. Architecture: no seam moved. The shell test
continues through the real route module into the existing inventory adapter;
the catalog remains real. Removing the route module would redistribute its
stock/catalog selection and financial-client composition into callers, so keep
that depth rather than mocking the wrapper. No new interface or duplicate
production formatter is introduced.

## Proof and limits

Restore only the inherited separator to its baseline during the red probe,
then restore the draft immediately. Two focused hosted assertions fail for the
same reasons as hosted run 44853685896. The runner and dependency setup failures
are not business-red evidence. Preserve every attempt in ignored logs.

Run complete HomeView and exact-commerce-i18n files plus inventory-exact-route
for owned history, typed endpoints, invoice navigation and attachments. Add the
canonical Web TypeScript check, scoped ESLint, the direct i18n checker and its
eight-test wrapper. Keep the Arabic regex and all existing tests unchanged.
The neutral punctuation edit does not change layout, direction, keyboard
behavior, money or inventory mutations. No browser, server, build, full Web
suite, package install or parent generated-output writes are authorized.

Reuse the existing parent toolchain through absent-only ignored dependency
junctions. Invoke Vitest from this worktree's apps/web so its alias resolves
this source. Source and contracts dist in the parent are read-only dependencies.

Applied wisdom: lazy rendering requires awaited owning-page observations;
translation mocks must not mask missing keys; scanner options are not textual
fallbacks. Preserve the existing real i18n resource checks. Fixture schema
validation remains covered by the existing route tests and canonical typecheck.
No new wisdom file or glossary entry is warranted.
