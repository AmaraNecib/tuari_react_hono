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


## Greptile "Summary" comment vs inline findings — score alone isn't proof (🟡 Minor)

On all three merged PRs (#295/#296/#300) Greptile posted only a summary comment
(5/5, "safe to merge") with **zero inline threads** — that is the clean state the
guard's Phase 3 check wants. The score is not the evidence: Greptile can emit a
high score while leaving inline findings, and a summary comment is not a
finding.

**Always**: check `gh api repos/<owner>/<repo>/pulls/<n>/comments` (the review
threads endpoint) for actual inline findings, not just the score or summary
comment, before calling a PR ready to merge.
