# #543 browser acceptance proof

Base: `0fdaff8fe76771c12a32bbe7bdd93f6c6935656f`. Initial parent head: `64a299490d0d55ec6c8f51e6b8a024a49a271fdf`. Verification mode: focused-local / CI-final-pending. Tier: high-assurance because approval writes money records and retry recovery must not duplicate them.

The new Chromium case drives the original employee, project, approval, history, and cost pages against Playwright's managed local API and Vite servers. It creates manager, projects, and worker through authenticated UI mutations. The worker's monthly reference is edited and checked as exact decimal text. The approval uses a known 62,500 total, zero unallocated, and ordered A/B/A segments for 5/15/5 days and 10,000/37,500/15,000 amounts.

The case checks localized precision rejection before approval, drops only the first real API response after the server responds, retries the frozen request unchanged, then checks one persisted history row and separate project-cost segments after reload. It saves element-cropped screenshots under ignored `.scratch/reviews/543-browser/`. The app-visible approval and cost assertions do not prove reopening encrypted native storage; that remains outside this browser task.

The workflow selector on the parent range selected `full` because `apps/api/src/app/dependencies.ts` is a critical path. A new E2E spec also selects full CI scope. This is a CI decision only; local execution remains limited to this one acceptance file, one Chromium worker, through `heavy_run`. No existing DB seeder is used because its employee insert names retired salary columns. Each run must supply a new absolute DB and config path under this worktree's ignored `apps/api/data`, plus unused loopback API and web ports.
