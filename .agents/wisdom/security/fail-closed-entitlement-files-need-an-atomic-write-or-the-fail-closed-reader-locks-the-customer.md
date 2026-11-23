## Fail-closed entitlement files need an atomic write, or the fail-closed reader locks the customer (🟠 Major / Greptile P1)

The trial anchor is read fail-closed: unparseable JSON means "tampered", which
locks the installation. That makes the write path part of the security story —
an in-place `fs::write` that is interrupted (power loss, crash, a second
instance reading mid-write) leaves truncated JSON, and the fail-closed reader
then punishes a legitimate customer for a crash. Fixed with `write_atomic`:
stage the bytes in a sibling temp file (`<file>.<pid>.<seq>.tmp`, so two
processes never share a staging name), `write_all` + `sync_all`, then
`fs::rename` over the target — a same-directory rename is atomic, so readers see
either the old file or the new one, never a half-written one. On any failure the
staging file is removed and the target is left intact.

**Always**: when a reader treats malformed content as hostile, the writer must
be atomic (temp + fsync + rename). Pair it with a test that a corrupt file is
left byte-for-byte untouched, so a retry cannot silently "repair" it into a
fresh entitlement. A parent-directory fsync is not worth it on Windows (no
meaningful directory fsync, and a lost rename keeps the *earlier* — safer —
anchor value), so skip it rather than writing platform-specific code for
durability the threat model does not need.

