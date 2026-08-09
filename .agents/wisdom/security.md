# Security Wisdom

## Multipart bodies are fully buffered before any size check — pre-check Content-Length (🟠 Major)

`await c.req.formData()` in `apps/api/src/app/create-app.ts` parsed the ENTIRE
multipart body into memory before the 25 MB attachment cap was checked — a
loopback-only memory-exhaustion vector that becomes an unauthenticated DoS if
`API_HOST` is ever set to LAN/public (auth endpoints only had a 30 req/15 min
limiter; the upload route requires a session). Fix (#272): a global,
content-type-aware `bodyLimit` (1 MB JSON/urlencoded, 30 MB multipart)
registered before ALL route handlers, a `Content-Length` short-circuit that
returns 413 before the body is read, and the existing per-file/total caps kept
as defense in depth.

**Always**: when an endpoint calls `c.req.formData()` or `c.req.text()`, check
for an upstream size gate BEFORE the read; a route-level cap after a full
buffered parse is not a limit. Content-type-aware caps (JSON vs multipart) and
a `Content-Length` pre-check are the cheap first line; keep the multipart cap
ABOVE route-level per-file caps so the route still enforces its own totals.

## Re-run `pnpm audit` at fix time — advisory lists drift (🟡 Minor)

#274's issue said 165 vulnerabilities / 3 critical from an earlier audit. At
fix time `pnpm audit --prod` reported **170** (14 low / 93 moderate / 60 high /
3 critical): the second better-auth critical (GHSA-2vg6-77g8-24mp stale
sessions) had been **downgraded to low** in the current advisory DB, and a
**NEW critical** appeared (`seroval ≤1.5.2` via
`@tanstack/router-core > seroval`, GHSA-mv8w-475r-vwqw, patched ≥1.5.3).

**Always**: never trust vulnerability counts or severities from an older issue
or report — re-run the audit at implementation time and act on the current
findings. When bumping one dependency for security, check the audit output for
sibling advisories (new transitive criticals) in the same lockfile pass.

## better-auth dedupe: per-package resolution keeps two physical copies (🟡 Minor)

The API resolved `better-auth@1.6.20` while the web app resolved `1.6.2`
(vulnerable line) — two physical copies in `node_modules/.pnpm/` because each
workspace package declares its own specifier. Confirm divergence with
`pnpm --filter <pkg> why better-auth` and by listing
`node_modules/.pnpm/better-auth@*`; fix = align the web specifier to the
patched line (`^1.6.20`), dedupe the lockfile, and handle the `tar ≤7.5.18`
(sqlcipher toolchain, resolves to deprecated `tar@4.4.19`) via a root
`pnpm.overrides` entry.

**Always**: for security-version dedupes, check every importer's specifier —
`^1.6.2` and `^1.6.20` look compatible but resolve to different lines and
silently keep the vulnerable copy alive in the lockfile.


## Entropy gates must be calibrated to finite-sample distributions, not theoretical maxima (🟠 Major)

#273's first secret-strength gate required Shannon entropy ≥ 4.0 bits/char.
Theoretical max for hex is 4.0 bpc — but empirical entropy of FINITE random
hex samples is 3.6–3.9 bpc (finite-sample bias). Simulation showed the gate
would reject the app's own `OsRng`/`openssl rand -hex` secrets: 18.6% of
32-char, 0.9% of 48-char, 0.02% of 64-char samples fall below 4.0 bpc →
intermittent API startup failure. Greptile round 1 caught it. Fixed with a
2.0 bpc floor + ≥8 distinct-character diversity rule: P(fail) = 0 over 500k
hex samples at lengths 20–96, while degenerates (single symbol, repeated
4-symbol groups) and shipped placeholders are still rejected.

**Always**: when gating on entropy, calibrate the threshold against the
actual generation path's distribution by simulation BEFORE shipping — a
gate at the alphabet's theoretical maximum will reject real random output.
Pair entropy with a distinct-character/pattern rule so diverse-but-degenerate
strings (e.g. `password`×4) don't pass.
