## Migrations inside the composition root kill the schema-less-db trick (🟡 Minor)

Once `createAppDependencies` runs `ensureDatabaseSchema` itself (issue #198), a
`:memory:` db is ALWAYS fully migrated + role-seeded. The old adapter-discrimination
test (`expect(() => deps.companyService.listRoles()).toThrow(/no such table/)`,
which relied on a schema-less injected handle) can no longer work. Replace it with
the seeded-role assertion: sqlite adapter returns `{ items: [admin, manager,
viewer] }`, in-memory adapter returns `{ items: [] }`. Each test gets its own
`:memory:` connection, so a fresh migration per call is fast and isolated.

