# tsrs typechecking adoption

- Base: `0fdaff8fe76771c12a32bbe7bdd93f6c6935656f`
- Verification mode: focused-local / CI-final-pending
- Tier: High-assurance, because this changes a compiler toolchain dependency.
- Owner-approved tool: root exact dev dependency `tsrs@0.25.0-ts7.1.0-beta`. The parent installs and commits it after this code handoff. This change does not edit dependency sections or lockfiles.

## Scope

Use `tsrs --noEmit` for the contracts, API and web workspace typecheck scripts. Run the web build's typecheck through `pnpm run typecheck` before Vite. Remove the web config's obsolete `ignoreDeprecations` and `baseUrl` entries while keeping its `@/*` path mapping, include list, Vite types and `noEmit`. Set contracts `types` to `node`. Leave TypeScript versions and ranges, API/base config strictness and includes, root typecheck, desktop commands, Turbo graph and CI workflow unchanged.

`tsrs` is only the source-checking CLI. TypeScript 5.9.3 remains installed for `tsup` declaration/build work and `typescript-eslint`/ESLint APIs. This does not replace Playwright, change E2E scope or establish an E2E speedup.

## Risk and proof boundary

The approved tool is a six-day-old release with one maintainer. The owner accepted this disclosed supply-chain risk after provenance and advisory checks. The compatibility pilot found matching source lists and diagnostics for the selected contracts/API/web scope; that is evidence for these configs, not exhaustive checker equivalence.

Before parent installation, prove direct CLI compatibility against the production configs using the parent's already-approved local tool copy, plus retained TypeScript 5.9.3 direct checks. Build contracts once with TypeScript 5.9.3 for declaration consumers. Use independent positive and negative fixtures, including exact expected diagnostic codes and positions. Do not claim pnpm workspace PATH or root Turbo integration until the parent installs the dependency. Linux hosted CI remains pending.

No runtime module, public contract, test runner, CI gate, or architecture seam changes. Architecture: no seam moved.
