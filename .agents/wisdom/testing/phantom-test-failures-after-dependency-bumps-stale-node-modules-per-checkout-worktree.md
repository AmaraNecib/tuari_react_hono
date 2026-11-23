## Phantom test failures after dependency bumps: stale `node_modules` per checkout/worktree (🔴 Major)

On #57, `createable-select.test.tsx` "failed deterministically (3/3)" on develop after the
@base-ui/react 1.2→1.7 upgrade (#55) — but passed everywhere CI ran fresh installs. Root cause:
the local checkout/worktree that observed the failure still had the OLD version in
`node_modules` (`apps/web/node_modules/@base-ui/react/package.json` said 1.2.0 while the lockfile
said 1.7.0). Hours went into jsdom event-sequence debugging against 1.2.0 semantics.

**Always**: after any PR that bumps dependencies merges, run `pnpm install` in EVERY checkout and
worktree you will test in, BEFORE believing a failure. First diagnostic for "fails locally, passes
CI" on a dep-touching change: print the installed version from `node_modules/<pkg>/package.json`
and compare to the lockfile. Worktrees never share `node_modules` — each needs its own install.

