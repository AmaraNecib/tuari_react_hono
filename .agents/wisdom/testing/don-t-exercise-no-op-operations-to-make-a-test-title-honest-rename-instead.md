## Don't "exercise" no-op operations to make a test title honest: rename instead (🟡 Minor)

Issue #228: the recovery-key e2e test "recovery keys survive simulated
password change" claimed a rekey that never happened. The password change
was only a comment. The tempting fix, "exercise a real rekey", is a trap:
`DatabaseKeyManager.changeKey` (`PRAGMA key`/`rekey`) is a **documented
no-op** on the plain better-sqlite3 the workspace tests use (the
`better-sqlite3-sqlcipher` binding is deliberately not built:
`pnpm-workspace.yaml` `onlyBuiltDependencies` lists only `better-sqlite3`
and `prisma`). Calling it would succeed silently and the test would still
lie. Enabling the sqlcipher build is a workspace-wide change (node-gyp
source build, CI compile time) disproportionate to a test-title fix.

**Always**: before "exercising" a DB operation in a test, verify it
actually does something on the connection type under test. If the only
honest options are rename-vs-heavy-infra, rename the test to what it
asserts (issue acceptance offered exactly this) and state the coverage
boundary in the module doc comment, citing the no-op documentation.

