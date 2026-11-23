## Re-run `pnpm audit` at fix time: advisory lists drift (🟡 Minor)

#274's issue said 165 vulnerabilities / 3 critical from an earlier audit. At
fix time `pnpm audit --prod` reported **170** (14 low / 93 moderate / 60 high /
3 critical): the second better-auth critical (GHSA-2vg6-77g8-24mp stale
sessions) had been **downgraded to low** in the current advisory DB, and a
**NEW critical** appeared (`seroval ≤1.5.2` via
`@tanstack/router-core > seroval`, GHSA-mv8w-475r-vwqw, patched ≥1.5.3).

**Always**: never trust vulnerability counts or severities from an older issue
or report. Re-run the audit at implementation time and act on the current
findings. When bumping one dependency for security, check the audit output for
sibling advisories (new transitive criticals) in the same lockfile pass.

