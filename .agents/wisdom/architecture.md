# Architecture Wisdom

## In-memory adapters duplicate ownership-history helpers across domains (🟡 Minor)

`InMemoryWorkforceRepository` and `InMemoryOperationsRepository` both carry
byte-identical private helpers (`insertProjectManagerOwnershipHistory`,
`endActiveProjectManagerOwnershipHistory`, `insertWarehouseManagerOwnershipHistory`,
`endActiveWarehouseManagerOwnershipHistory`, plus state-history variants) because
both operate on the shared `InMemoryStore`. When retyping them (any → typed
`Omit<Record, "id"|"endDate"|"createdAt"|"updatedAt">` + `AuditSnapshot`), both
copies must be edited in lockstep — a real maintenance hazard. Tracked as #202;
candidate home: `inmemory-store.ts` alongside `normalizeAudit`/`now`/`newId`.

**Always**: when a change touches these helpers, edit both files; prefer extracting
to the store module.

## Record types mirror external table shapes (🟡 Minor)

`AuthUserRecord` / `BootstrapStateRecord` in `company.types.ts` hand-mirror the
auth `user` and `app_bootstrap_state` schemas. The audit repository reads them
(`u.phoneNumber`, `s.singleton === 1`), but nothing writes them today. Divergence
risk if the schemas evolve; the type comments acknowledge this. Alternative:
derive from `typeof schema.user.$inferSelect` if schema coupling is acceptable.

## Ports & adapters: config flows through the composition root only (💡 Design Principle)

`createAppDependencies(sqlite, drizzleDb, auth, config = createAppConfig())` — the
optional trailing config param keeps every existing caller unchanged while letting
tests inject `DB_ADAPTER=inmemory`. The `createCompanyRepository(rawDb, config)`
factory switches adapters; other modules (inventory/invoice/payment) still use the
sqlite handle until their in-memory adapters exist. Keep the param appended, never
inserted mid-signature.
