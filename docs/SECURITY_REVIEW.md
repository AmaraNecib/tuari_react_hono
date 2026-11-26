# Security review: MVP source boundaries

## Scope and method

This is a static source review pinned to commit `c363f0306668c1329a20700b8d36e26698630693`, the `origin/develop` tip at review start. It covers the license and entitlement path, desktop authentication bridge, API transport and session checks, and the manual update path. It does not cover the whole product or treat the test-only startup-rollback change in #643 as product-security evidence.

The threat model treats renderer input and network requests as untrusted. A person with administrator access to a customer's computer can also change local files or patch the application. Client-side licensing therefore is not an anti-tamper guarantee against that person.

I inspected source, relevant documentation, and existing test definitions. I did not run tests for this report or execute a packaged application. Existing test names below describe evidence in the repository; they are not results from this review. A source fact does not prove behavior in a shipped Windows or Linux build.

## Findings by boundary

### License verification and entitlement

The native [`LicenseManager`](../apps/desktop/src-tauri/src/license.rs) reads a signed license and checks its Ed25519 signature against the embedded license key and accepted license-purpose rotation keys. `activate_from_key` verifies the content before persisting it, then updates in-memory state. The implementation writes the file with `std::fs::write`; this review did not establish crash-safe or atomic replacement.

The API has separate entitlement checks in [`infrastructure/license.ts`](../apps/api/src/infrastructure/license.ts), [`create-app.ts`](../apps/api/src/app/create-app.ts), and [`rpc-middleware.ts`](../apps/api/src/rpc/rpc-middleware.ts). These are distinct from the native signature check. The code and tests do not establish resistance to an administrator patching their local application.

Existing test definitions include `initialize_rejects_unsigned_license`, `activate_returns_invalid_signature_for_tampered_content`, and `activate_returns_invalid_signature_for_wrong_key` in [`license.rs`](../apps/desktop/src-tauri/src/license.rs). `embedded_key_is_production` rejects a zero key and the public RFC test vector. It does not prove signing-key custody or that a customer license was signed by the corresponding private key. [`license-issuance.md`](license-issuance.md) describes the issuance process; this review did not inspect private keys or issue a license.

### Desktop authentication and token custody

[`lib.rs`](../apps/desktop/src-tauri/src/lib.rs) keeps the active bearer token in native Rust state. When the user chooses to remember the session, the code uses the native keyring. The sign-in command consumes the token in Rust rather than returning it to renderer code. The API bridge rejects renderer-supplied `authorization`, `cookie`, `host`, `origin`, and `content-length` headers before adding the native bearer token for authenticated calls. Sensitive commands check the calling window against an allowlist before side effects. [`desktop-auth-boundary.md`](desktop-auth-boundary.md) documents this intended boundary.

Existing test definitions `allows_only_expected_desktop_bridge_paths` and `allows_only_expected_sensitive_command_windows` in [`lib.rs`](../apps/desktop/src-tauri/src/lib.rs) check path and window-label allowlists, including rejected values. They do not exercise Tauri IPC or an OS keyring. No renderer or desktop binary was exercised for this review.

### API authentication and transport

[`create-app.ts`](../apps/api/src/app/create-app.ts) configures origin checks for auth and RPC routes, an auth-route limit of 30 requests per 15 minutes, body limits, and security headers. [`rpc-middleware.ts`](../apps/api/src/rpc/rpc-middleware.ts) requires an authenticated user for protected procedures and applies a separate rate limit to wrapped RPC handlers. The unauthenticated `authBootstrap` setup route is intentional and applies the shared per-IP limit. The auth-origin guard allows originless top-level GET/HEAD requests; the inventory attachment route also has a narrow originless navigation allowance. These exceptions mean the origin checks are not a universal block on every originless request.

Existing test definitions include selected Hono application cases in [`selected-http.integration.test.ts`](../apps/api/src/app/selected-http.integration.test.ts), `rejects protected procedures when no session exists`, and `rate-limits the unauthenticated authBootstrap setup-secret endpoint (#175)` in [`router.test.ts`](../apps/api/src/rpc/router.test.ts). `rpc-middleware.test.ts` includes `keys the budget on the socket address and ignores spoofed x-forwarded-for`. These tests cover selected paths, not every API route. They do not establish the production origin allowlist, trusted-proxy configuration, or deployed network behavior.

### Manual updates

The MVP update path is manual. [`apply_update` in `lib.rs`](../apps/desktop/src-tauri/src/lib.rs) dispatches to [`FullReplaceStrategy`](../apps/desktop/src-tauri/src/update.rs), whose current `apply_update` implementation returns `success: false` without replacing files. The existing test `full_replace_strategy_returns_failure_as_stub` checks that stub. Helper tests such as `verify_tampered_signature` and `verify_wrong_key` in [`update.rs`](../apps/desktop/src-tauri/src/update.rs) exercise signature-verification helpers, not the active apply path. Those helpers and the separate `DifferentialStrategy` do not show that the active path verifies or installs an update. [`manual-update-runbook.md`](manual-update-runbook.md) states that a download or UI state is not an installed update and that it does not authorize installation.

Automatic updater signing and activation are outside this review. This document makes no release, artifact, or trust-key decision.

## Limits and next evidence

This review establishes only what the inspected source says and which relevant test definitions exist. It does not establish:

- which source produced a customer binary or how that binary behaves;
- custody of the private license-signing key or a real license's signer/verifier match;
- OS keyring behavior or Tauri IPC/window checks on supported platforms;
- production origin, proxy, or API deployment configuration.

No concrete reachable defect was identified in the inspected paths. That is not a claim that the product has no vulnerabilities or that this review covers all security controls. The direct license-file write noted above was not tested for interruption or partial-write recovery, and this review makes no claim that such a failure has occurred.

The next useful evidence is a separately authorized review or execution of the selected customer build against the existing release and recovery gates. This document does not authorize that work, select an artifact, or change the manual-update runbook's authority.
