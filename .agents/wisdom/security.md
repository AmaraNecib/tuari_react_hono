# Security Wisdom

## Multipart bodies are fully buffered before any size check: pre-check Content-Length (🟠 Major)

`await c.req.formData()` in `apps/api/src/app/create-app.ts` parsed the ENTIRE
multipart body into memory before the 25 MB attachment cap was checked, a
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

## better-auth dedupe: per-package resolution keeps two physical copies (🟡 Minor)

The API resolved `better-auth@1.6.20` while the web app resolved `1.6.2`
(vulnerable line). Two physical copies in `node_modules/.pnpm/` because each
workspace package declares its own specifier. Confirm divergence with
`pnpm --filter <pkg> why better-auth` and by listing
`node_modules/.pnpm/better-auth@*`; fix = align the web specifier to the
patched line (`^1.6.20`), dedupe the lockfile, and handle the `tar ≤7.5.18`
(sqlcipher toolchain, resolves to deprecated `tar@4.4.19`) via a root
`pnpm.overrides` entry.

**Always**: for security-version dedupes, check every importer's specifier:
`^1.6.2` and `^1.6.20` look compatible but resolve to different lines and
silently keep the vulnerable copy alive in the lockfile.


## Entropy gates must be calibrated to finite-sample distributions, not theoretical maxima (🟠 Major)

#273's first secret-strength gate required Shannon entropy ≥ 4.0 bits/char.
Theoretical max for hex is 4.0 bpc, but empirical entropy of FINITE random
hex samples is 3.6–3.9 bpc (finite-sample bias). Simulation showed the gate
would reject the app's own `OsRng`/`openssl rand -hex` secrets: 18.6% of
32-char, 0.9% of 48-char, 0.02% of 64-char samples fall below 4.0 bpc →
intermittent API startup failure. Greptile round 1 caught it. Fixed with a
2.0 bpc floor + ≥8 distinct-character diversity rule: P(fail) = 0 over 500k
hex samples at lengths 20–96, while degenerates (single symbol, repeated
4-symbol groups) and shipped placeholders are still rejected.

**Always**: when gating on entropy, calibrate the threshold against the
actual generation path's distribution by simulation BEFORE shipping. A
gate at the alphabet's theoretical maximum will reject real random output.
Pair entropy with a distinct-character/pattern rule so diverse-but-degenerate
strings (e.g. `password`×4) don't pass.

## Verify which character a "whitespace pin" actually pins before deciding a rejection class (🟠 Major)

Issue #334 (follow-up to #234) claimed the #221 pinned behavior "deliberately
preserves internal whitespace (Zs) in recovery keys (wrapped-across-email-line
case)" and worried that "widening the class to Zs would break that pinned
test". The actual pinned test is
`consumeRecoveryKeyInputSchema.parse({ key: "a1b2-c3d4\ne5f6" })`. The
preserved character is **LF (`\n`), category Cc**, NOT Zs. This misreading cut
both ways: (1) the issue's own proposed class `[\p{Cf}\p{Mn}\p{Cc}]` would
have broken the pin (reject all Cc includes `\n`); (2) "excluding Zs to
preserve the pin" was unnecessary. Zs could be rejected anywhere (closing the
issue's own mid-string-NBSP bypass) with ZERO cost to the pin. The fix carved
`[\x09-\x0D]` (tab/LF/VT/FF/CR, the Cc members of ECMAScript WhiteSpace) out
of the Cc rejection, keeping the pin green, and rejected `\p{Zs}` outright.

**Always**: when an issue says "widening class X breaks pinned test Y", open
the pinned test and read the EXACT codepoint it uses before designing the
class. The issue text may misclassify it (here Zs vs Cc). Then verify the
chosen regex against a node matrix of the actual production regex: category
claims are subtle (Mn vs Mc: U+0301 rejected, U+0903 allowed; U+2028/U+2029
are Zl/Zp not Zs; every Zs is ECMAScript WhiteSpace so pure-Zs keys already
fail trim→min; U+2800 braille blank is the only blank So, rejecting all
`\p{So}` would over-reach into ©/emoji). Both debate agents re-verified
independently before the fix shipped.
