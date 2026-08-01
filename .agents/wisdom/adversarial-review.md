# Adversarial Review Wisdom

## Greptile inline findings must be verified against the code before fixing (🟠 Major)

On #202, Greptile flagged a "stale `AuditSnapshot` import" in
`inmemory-workforce.repository.ts`. It was wrong: the type is still used by
`endActiveStateHistory` (workforce-only employee state-history helper). The
parallel file (`inmemory-operations.repository.ts`) correctly dropped the
import because ALL its ownership helpers moved out — workforce kept its
state-history helpers. Rule: after an extraction, the import is only stale in
a file where every helper that referenced the type moved out.

**Always**: for each Greptile finding, grep the current file for the claimed
usage before editing; dismiss invalid findings with a concrete line-number
citation in a PR comment (never silently ignore).

## Changing the "local host" definition requires grepping ALL duplicate checks (🟡 Minor)

Extending `isLocalHostname` to loopback /8 fixed the config layer, but a
separate inline `isLocalhostHostname` in `app/create-app.ts` (HSTS skip)
still hardcoded `127.0.0.1` — Greptile caught the inconsistency (4/5 → 5/5
after fixing). The dedupe issue itself listed only `config/index.ts` and
`env.ts`, but a third copy lived in the transport layer.

**Always**: when the meaning of "local host" changes, grep the whole repo for
`127.0.0.1`, `isLocalhost`, and `tauri.localhost` and route every check
through the shared helper.
