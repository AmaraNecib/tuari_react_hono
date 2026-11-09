# Full API suite with one Vitest worker

- HEAD: `dcce6f34cd61f5b3dcd44545b555a367b8c51736`
- Command: `cd /d D:/projects/tuari_react_hono/worktrees/fix-algeria-day-pins && set VITEST_MAX_WORKERS=1 && pnpm --filter @tuari/api test > .scratch/reviews/473/guard-api-one-worker-20261102/api-test.log 2>&1`
- Environment override: `VITEST_MAX_WORKERS=1` (test suite, assertions, hook deadlines, and production settings unchanged)
- Result: exit 0; 94 test files passed; **1687 passed, 3 skipped, 1690 total**; duration 177.05s.
- Pre-run heavy status: 13.2 GB free RAM; CPU 0%; capacity 4/5. One separate web-validation job was running.
- Pre-run disk: C: 1,036,316,672 bytes free; D: 3,115,898,832 bytes free.
- Interpretation: the previously observed beforeEach timeouts did not reproduce at one worker. This is consistent with heavy I/O contention under parallel workers, but does not prove that contention caused the earlier failures.

Full Vitest output: `api-test.log`.
