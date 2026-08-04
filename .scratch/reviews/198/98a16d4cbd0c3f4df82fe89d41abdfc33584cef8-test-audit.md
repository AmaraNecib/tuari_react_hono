# Test Audit — issue #198 (self-contained createAppDependencies)

**Base:** `develop` @ `bb49ec29335adb1564ba69bc7f1d91a2e9f43b33`
**Head:** `efbc95e4919763975989ae74ac1d55c30a03f0ee`
**Method:** edge-case hunter + coverage analyst + quality reviewer sub-agents over the changed test files.

## Edge case hunter

| # | Risk | Finding | Disposition |
|---|---|---|---|
| 1 | 🟠 | `changeKey` rekey failure escaped the try/catch → 500 instead of graceful `false` (violates the port's boolean contract) | **Fixed** — rekey wrapped; returns `false`; new test "returns false when the rekey itself fails". |
| 2 | 🟠 | Quoted `currentKey` escaping untested (only newKey was) | **Fixed** — new test pins `key = 'old-''quoted'''`. |
| 3 | 🟠 | `close()` double-close throws; construction failure leaks the connection (Windows EBUSY) | **Fixed** — idempotent `close()` (closed flag) + root closes on construction failure (try/catch). |
| 4 | 🟠 | `databaseKey` config seam untested (dropped key param would pass CI silently) | **Fixed** — wiring pinned via factory mock (`dbKeyCapture`); SQLCipher native behavior is the factory's concern (native binding not always built). |
| 5 | 🟡 | Empty/whitespace `databasePath` fallback untested | Guard in place; dedicated test skipped (cosmetic; noted in PR). |
| 6 | 🟡 | Raw-handle rejection untested (TS-level only) | Accepted — typecheck enforces; noted. |
| 7 | 🟡 | Boundary keys (`current===new`, empty) | Accepted — cosmetic; noted. |
| 8 | 🟡 | `_executor` concurrency race | Latent; tracked in #265. |

## Coverage analyst

- All 8 acceptance criteria covered by tests (signature, config object, creation inside, rawDatabase removal — direct `not.toHaveProperty("rawDatabase")` assertion, index.ts static, tests migrated, compiles, 692/692 pass).
- `databaseKey` gap closed (see above). No duplicate coverage (PRAGMA assertions relocated to port tests, not duplicated).

## Quality reviewer (grade: B+ → A- after fixes)

- Env-stub hygiene: `stubCleanEnv()` extracted to `beforeEach` (+`APP_DB_KEY`), `vi.unstubAllEnvs()` in `afterEach`; temp-file test closes deps before `rmSync`.
- **Fixed**: `:memory:` connections now closed — `afterEach` closes the last deps (idempotent); key-manager test wraps `sqlite.close()` in `finally`.
- **Fixed**: duplicated env-stub blocks removed (test 2, test 6).
- Accepted: `typeof deps.auth.handler === "function"` assertion is weak but exercises real `createAuth`; wrong-key-on-encrypted-db unverifiable on plain better-sqlite3 (documented residual).

## Net result

692 tests pass (3 new: quoted currentKey, rekey-throws, databaseKey wiring; 2 suites hardened).

---

## Post-evidence delta (5465bbc → 98a16d4)

Greptile round (2 P2 findings, both valid): removed dead `changeDatabaseKey`
(port fully replaces it; e2e comment updated), aligned the create-app mock with
`DatabaseKeyChangeResult` (`{ success: true }` instead of boolean). Test-only +
dead-code removal; the review conclusions above remain valid.
