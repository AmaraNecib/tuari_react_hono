## Ownership extension mid-flight: agent asks supervisor, parent cross-checks (🟡 Minor)

#276's Greptile round 2 surfaced a real regression (reset mutation not
invalidating the snapshot) that required editing
`apps/web/src/features/app-shell/workspace-mutations.ts`. OUTSIDE its
announced owned paths. The agent stopped and asked via contact_supervisor
instead of silently editing. The parent checked the other 4 agents'
ownership lists (no one owned it), approved, and the fix landed cleanly.

**Always**: when a fix needs a file outside announced ownership, STOP and
ask the parent (contact_supervisor, reason need_decision) with the exact
file + why. Parent: cross-check the OTHER agents' announced lists before
approving; the owner is whoever needs it, not the first to claim.

