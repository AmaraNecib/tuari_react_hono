## Whole-issue fix landing in forbidden files → the run is report-only by design (🟡 Minor)

#274's entire fix (bump `apps/web/package.json` to `better-auth@^1.6.20`, dedupe
`pnpm-lock.yaml`, root `pnpm.overrides` for tar) lived in parent-owned files that
agents may never edit. The agent ran the diagnosis stage only (read-only
`pnpm why`/`pnpm audit`, no install) and stopped with a per-file change list.
That report-only run was still high-value: it surfaced a **NEW critical** the
issue didn't know about (`seroval ≤1.5.2` via `@tanstack/router-core`,
GHSA-mv8w-475r-vwqw) and a severity downgrade in the current advisory DB.

**Always**: when an issue's fix is entirely forbidden-file territory, dispatch a
diagnosis-only run (read-only commands, no installs, because `pnpm install` rewrites
the forbidden lockfile) and require it to return the exact per-file diff needed.
Don't let it open a PR or make partial non-forbidden changes that don't advance
the issue.


