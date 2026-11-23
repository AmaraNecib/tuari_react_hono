# Connected selected-exact payroll acceptance

Base: 414a0235d957d5c91b1bdb7a66802759e3757e3f.
Worktree: D:/worktrees/tuari_react_hono/t3-c26613fc-c5c5d849cfd25dcd.
Mode: focused-local / CI-final-pending. Tier: high assurance, money and real
auth transport. Publication, all three review lenses, architecture review,
default activation and hosted protection remain parent-owned.

## Approved seams and case

The selected test server creates createFreshExactAppDependencies and createApp.
It uses the real native SQLite factory, BetterAuth and production RPC writers.
The browser runs the existing employee financial route with the production web
client. There is no report-page acceptance because ReportBuilder has no mount.
Authenticated systemLogList supports the writer receipt proof.

An authenticated owner creates employee/project and approves DZD 35000 through
RPC. The UI records one cash payment containing wages 25000 and advance 5000.
The UI independently offsets 2000 and repays 1000. Expected remaining wages
are 8000, advance 2000, and the persisted earning segment stays 35000.
Unknown opening balances remain null with a visible nonblocking reminder.
These terms keep earned labor, cash, offset and repayment distinct.

## Test-only selection and isolation

Use playwright.connected-exact.config.ts explicitly. It starts
apps/api/tests/connected-exact-server.ts, never apps/api/src/index.ts.
The server rejects an existing DB file and prints entry, mode, file and port.
Each run derives one fresh directory inherited by workers. DB, config,
attachments, backups, browser artifacts and Vite cache live there.
The dedicated spec skips under ordinary Playwright configuration.
Neither default entry nor business code changes.

Test-only TSX and Vite aliases resolve this checkout's contracts source.
This avoids stale shared dist without writing another checkout's outputs.
Existing installed dependencies can be reused through local node_modules
junctions. Vite permits the actual dependency directory for font assets.
No package addition, install, browser download or app build is needed.

## Recovery mechanism and independent receipts

Only the first cash response delivery is dropped. route.fetch sends the real
request and waits for its real successful response before route.abort.
No payroll, financial, earning or report result is fabricated. The retry
forwards its real request and response. Reload restores the frozen identity;
both request envelopes and committed receipts must be equal.

Offset and repayment are real UI requests. Their retained inputs are replayed
through authenticated HTTP after reload. Authoritative lifecycle counts and
read-only queries of the declared native file assert one cash, one offset,
one repayment and unchanged labor. Rendered remaining totals and lifecycle
history are also checked. The existing mocked two-tab/Web Lock case stays
unchanged and makes no connected persistence claim.

## Module design and proof limits

The server is a test adapter at the existing composition-root seam, not a new
financial interface. Removing it loses explicit selected-root browser startup,
not business logic. RPC setup stays local to this one spec rather than adding
a second fixture framework. No production seam moved.

Run exactly one Chromium case via heavy_run. Focused TypeScript covers the
new config, server and spec with current contracts source. Preserve every
startup failure and native exit in ignored evidence. Startup failures are
draft-first chronology, not a claimed financial mutation or red-on-parent
proof. The browser case demonstrates a committed-but-undelivered response.

Applied lessons: stale contracts output, schema-valid fixtures, canonical
DatePicker input, native binding evidence. This case uses the real unkeyed
native adapter, not encryption proof. Existing two-tab fixture remains the
separate lock test. No new wisdom files are written by this worker.
