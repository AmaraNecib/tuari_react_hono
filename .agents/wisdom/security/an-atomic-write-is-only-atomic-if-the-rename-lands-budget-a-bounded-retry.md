## An atomic write is only atomic if the rename lands: budget a bounded retry (🟠 Major / Greptile P1)

The temp+rename write above is correct but not sufficient on Windows. Replacing
a target that another process holds open for reading — a second app instance,
an antivirus scanner, a search indexer — makes the destination `fs::rename`
fail with a sharing violation / access denied. The lock is transient, but a
single-shot rename lets that reader *defeat the write*: the trial anchor is
never persisted and the customer sees a clock-tamper lock. Fixed (#398 round 3)
with a bounded retry around the rename: 5 attempts, 20/40/80/160 ms, staging
file kept across every attempt and removed only on final failure, and an error
naming the target path plus the OS error.

**Always**: for a fail-closed file whose *absence* is losing or hostile, the
rename must be retried on a short bounded backoff; a transient reader must not
be able to turn an atomic write into no write. Keep it bounded (a few attempts
over ~300 ms, never `loop {}`) so a genuinely un-writable target still fails
promptly, and keep the staging file alive between attempts — deleting it on the
first failure defeats the retry. Make the retry testable without the OS: inject
the rename closure and the sleep function, then assert success-after-N-failures,
the give-up bound, and staging cleanup on final failure. A test that only calls
the real `fs::rename` cannot cover any of those three.
