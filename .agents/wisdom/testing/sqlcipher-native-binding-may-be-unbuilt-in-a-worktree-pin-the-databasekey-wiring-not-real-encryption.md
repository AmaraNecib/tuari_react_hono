## sqlcipher native binding may be unbuilt in a worktree: pin the databaseKey WIRING, not real encryption (🟠 Major)

`createDatabaseConnection(path, key)` requires the `better-sqlite3-sqlcipher`
native binding (`require("better-sqlite3-sqlcipher")` → `build/better_sqlite3.node`).
On a Windows worktree the package files exist but the `.node` binary is often NOT
compiled → passing any `databaseKey` throws "Database encryption requires
better-sqlite3-sqlcipher". So a test that passes `databaseKey` and expects a real
encrypted connection fails in such environments. Fix pattern (issue #198): mock
the factory module (`vi.mock("../infrastructure/database/factory", importOriginal)`)
to capture the key argument and strip it (delegate with `undefined`), asserting
`createDatabaseConnection` received the injected key. Deterministic everywhere.
Reserve real-encryption assertions for environments where the binding is built.

