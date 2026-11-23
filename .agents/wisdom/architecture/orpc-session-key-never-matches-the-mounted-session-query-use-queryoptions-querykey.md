## `orpc.session.key()` never matches the mounted session query: use `queryOptions().queryKey` (🟠 Major)

On #236, `getCachedSessionUserId` read the session from `orpc.session.key()`, but
that generates `[["session"], {}]` while the session query mounts under
`[["session"], { type: "query" }]` (`queryOptions().queryKey` omits nothing;
bare `key()` omits the `type` field). Result: the helper ALWAYS returned null.
The workspace mutations survived because `invalidateWorkspaceDomains`'s
`userId === null` branch over-invalidated the whole `["phase1","workspace-domain"]`
prefix. The null fallback masked the broken key. The typed inventory
invalidations (no fallback) exposed it: the item-definitions list went stale
after create. The same no-op invalidations existed in sign-out, account-settings
and phone sign-in (`invalidateQueries({ queryKey: orpc.session.key() })`).

Fix: `export const sessionQueryKey = orpc.session.queryOptions().queryKey` in
`workspace-keys.ts`, the same expression the session hook mounts with, so the
two cannot drift, and use it for every session cache read/invalidation.

**Always**: when matching the session query cache (or any ORPC procedure's
cache), derive the key from `queryOptions().queryKey`, never from bare
`key()`. If a helper has a "fall back to something broader" branch, verify the
primary path actually matches. A too-broad fallback can mask a broken key for
a long time.
