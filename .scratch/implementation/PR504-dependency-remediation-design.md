# Dependency-audit remediation

## Boundary

Dependent security change on workflow PR #504, initial base `f3f7180cc7ea9fa25d38393dc759f7c395ce92e1`. High-assurance: authentication, HTTP transport, schema validation and supply chain. Mode: focused-local / CI-final-pending. Owner permits publication and forbids merge without explicit approval. No audit suppression, threshold reduction or cipher-driver replacement is authorized by this change.

## Decisions

Align Better Auth server, web client and Drizzle adapter at 1.7.7; pin Hono 4.13.11, Zod 4.6.6 across contracts/callers and Vite 7.3.7. Prefer Hono's September release over one published yesterday. Security advisory queries rejected several original audit floors as still vulnerable; use Seroval 1.6.11, PostCSS 8.5.23, fast-uri 3.1.9, brace-expansion 1.1.21/5.0.12 and ip-address 10.7.4 instead.

Use version-scoped compatible transitive overrides. Keep picomatch 2/4, brace-expansion 1/5 and Zod 3/4 separate. Upgrade Prisma/client owning packages together instead of forcing deepmerge 8 into an older consumer. Regeneration removed unused optional Next, sharp, Prisma and deepmerge branches; no global auto-install-peer switch was changed. Removed a Kysely override after it incorrectly narrowed peer compatibility; the second resolution has no peer warnings. Test resolved branches rather than assuming overrides took effect.

The legacy better-sqlite3-sqlcipher 5.4.3-3 dependency and tar 4 remain unresolved. Tar 7 is not a compatible override. The independent #501 cipher-driver work and #410 literal cipher-version acceptance remain separate owner gates; do not duplicate or silently resume those paused PRs. This dependency change cannot claim full audit clearance while that edge remains.

## Package vetting

Parent queried registry identity, version publication time, maintainers, weekly downloads, dist.attestations, OSV, deps.dev and GitHub advisories before package installation. Selected versions have no advisories returned by these services at query time; this is not a safety guarantee. Established unscoped dependencies were not replaced with look-alikes. Several existing unscoped packages lack registry attestations (including Seroval, picomatch, brace-expansion, js-yaml and source-map-js); record that supply-chain limit rather than invent provenance. New auth packages and Hono 4.13.11 are attested. Detailed measured records remain ignored in `.scratch/reviews/dependency-vetting/`.

Lock resolution ran with ignored scripts. A frozen installation then linked 809 packages and downloaded 802 with lifecycle scripts disabled. No native crypto compatibility claim follows. The lockfile remains the complete reproducible artifact; full audit and platform build acceptance belong to CI.

## Focused proof

Run dependency-lock contract checks and existing workflow/selector tests. Build contracts only as the prerequisite for selected auth/app/router tests. Check API/web/contracts types and relevant lint. Exercise API auth construction, dependencies, Hono app/RPC integration and web auth/session callers. Use the existing plain SQLite binding for fixtures; native loading must be proven independently. No local full suite/browser/audit/native cipher build is needed to validate these changed callers. Commit before background committed-head verification and three distinct initial local review sessions.

## Completion

Publish a dependent security PR with exact limitations, measured vetting summary and current-head results. Keep PR #504 watched. Neither PR may merge without the owner. Hosted audit establishes remaining findings; local lock tests only protect the documented dependency-resolution contracts.
