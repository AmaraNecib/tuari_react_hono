# Standard E2E exact isolation

## Scope and authority

Worktree: `D:/worktrees/tuari_react_hono/t3-8c976d4e-19e4daf6d705ec4f`.
Base: `18b065b1345653166eec74ade50ba9c41b7333fc`.
Mode: focused-local / CI-final-pending. High assurance because the harness owns real auth and immutable financial state. Parent owns combined-delta review, integration, hosted acceptance and publication. No production source, contracts, dependencies or workflows change.

Hosted item 11 reports that the standard reset names removed salary tables. Replacing those names is insufficient: DELETE reset conflicts with immutable ledger triggers. The parent approved closing the owned API before preparing a fresh exact database.

## Interface and lifecycle

The test-only managed module exposes restart and stop. It forks one non-watching process, starts the same fresh exact composition and real Hono/auth application, and waits for IPC readiness from its own PID and exact database path. Port binding must succeed before readiness. No HTTP health response can impersonate ownership. A fresh random path under API data must not exist. The exact composition validates and creates its own schema; incompatible existing files never become reset targets.

Restart awaits HTTP server close, dependency close and child exit before assigning the next file. Old files remain available for inspection. Production triggers remain installed. IPC disconnect closes the process if the Playwright worker dies. Failure to close blocks restart rather than replacing a live file. Vite stays on one stable API URL. No watcher, production reset route or file deletion is involved.

Every standard spec explicitly registers lifecycle hooks before its own hooks. Import-time hook registration is incorrect because Playwright caches helpers across spec files in a worker. Existing serial spec state survives between tests. Existing per-test resets are now awaited; retries rerun hooks against a fresh process and file. The dedicated connected-payroll configuration is unchanged.

The seam earns its depth by hiding subprocess ownership, bind readiness, file identity and graceful shutdown behind restart/stop. Removing it would duplicate these obligations across 32 standard specs. Financial domain terminology does not change.

## Assertions and seeds

The shell performance assertion now counts exactly one real `financial/metadata` POST and still rejects duplicate individual organizational reads. The old snapshot endpoint is obsolete.

Employee/project/reference seeds already reach the exact schema successfully in selected employee, project and expense cases. The asset seed did fail on the exact invoice currency column. It now uses an authenticated real exact purchase writer, preserving the generated invoice, entry, asset and purchase movement identities instead of constructing a partial financial graph with old numeric fields. Placement reads use stored integer minor text and BigInt formatting. The selected purchase fixture remains 5000.00 DZD.

## Proof and limits

Selected browser scope covers employee, project, bootstrap auth, expense, debt, inventory, metadata and lifecycle rather than the full browser matrix. These are direct reset callers, an explicit beforeAll-free spec, ordered serial cases, reference seed consumers and the reached stale monetary seed. The lifecycle regression checks two different process/file identities, dead old PID, retained old rows, no inherited employee row, all five exact markers, installed triggers and absent legacy payment table. Another case checks the real purchase writer and its movement. Unmanaged restart is rejected.

Raw logs and commands are retained under `.scratch/reviews/579/`. Early attempts exposed Windows import URL, ESM launcher and stale borrowed contracts output; these are preserved, not counted as product failures. Contracts were compiled locally after isolating their generated output from the parent. Existing dependency junctions are ignored; no package was added.

The bounded 20-case run after per-file registration passed 11 cases, failed two old UI contracts and left seven serial successors unrun. Debt expects the old `مركز الديون` heading; the exact page renders `الديون`. Inventory expects the retired item-definition screen; the exact inventory page renders `المخزون والمشتريات`. No assertion was weakened to pass those flows. The asset seed subsequently passed exact purchase creation, then the legacy invoice detail URL could not show the purchased asset, matching hosted finding 7's separate inventory/invoice route seam. Production lanes own that seam; this lane does not edit web source. These failures remain explicit, not skips or synthetic responses.

Focused typecheck covers changed helpers, launcher and lifecycle spec with production imports and local contracts source. Parent review and current-head CI remain required. No full browser matrix or hosted acceptance is claimed.

## Applied lessons

Use distinct ports and bind-owned readiness rather than trusting another worktree's health response. Avoid watcher trees and await closure before touching database identity. Rebuild contracts before runtime API proof and do not consume another writer's generated output. Use native SQLite already installed; no encryption proof is claimed for this plain E2E database. Auth dedupe history was read but no dependency alignment is part of this task.
