## Don't "exercise" no-op operations to make a test title honest: rename instead (🟡 Minor)

Issue #228: the recovery-key e2e test "recovery keys survive simulated
password change" claimed a rekey that never happened. The password change
was only a comment. `PRAGMA key` and `rekey` on plain better-sqlite3 are no-ops,
so invoking them on that connection would still not test encryption.

**Always**: verify the driver under test. The encrypted successor now ships
prebuilds and real file-backed rekey tests need no SQLCipher compilation.
Use a keyed factory connection for encryption behavior; keep a plain-driver
test named for the narrower behavior it actually exercises.

Seen in: #501; retained in #504.
