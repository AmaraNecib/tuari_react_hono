# PR504 dependency and SQLCipher remediation

## Boundary

Consolidated workflow PR #504, based on integrated PR505 source at `2d539044463cfa608064995f2c67e940c5fd8f2d`. High-assurance crypto, native packaging and supply chain. Mode: focused-local / CI-final-pending. The owner explicitly authorized one consolidated PR and this cipher fix. The parent owns dependency vetting, publication and hosted checks. The owner forbids merge.

Port only the reviewed SQLCipher/runtime/packaging source and tests from historical PR501 commits `32a10d4bb426134f2deb947f9ab72b81203307dd` and `3329f64de105b1c4dfecbbb72d93bcff5074f3b3`. Do not revive other PR lanes or port unrelated historical auth, schema, SQLite bootstrap transaction, fixture, reports, wisdom or workflow changes. Preserve the integrated auth/schema source and the current dependency-security/workflow changes.

## SQLCipher decision

Use `better-sqlite3-multiple-ciphers@13.0.3`. Parent vetting and manifest/lock integration are complete; the old driver and its tar dependency are absent from the resolved graph. Configure the `sqlcipher` cipher and `legacy = 4` before setting the escaped key in both the API connection factory and snapshot workers. This driver supports SQLCipher 4 compatibility without SQLCipher's unsupported `cipher_compatibility` pragma. Escape the key before directory creation or database open. Close the connection if setup fails.

Packaging must copy the multiple-ciphers driver and its selected prebuild into the runtime, then verify the copied runtime loads that prebuild and performs a real encrypted round trip. Missing native prebuilds fail packaging. Do not compile during packaging or fall back to plaintext. Keep the plain SQLite driver for unkeyed connections.

The official upstream SQLCipher 4 fixture independently proves that the factory can open an existing encrypted file using the supported key. It does not prove an independent reader can open files Tuari writes. The runtime round-trip proves the packaged driver works; it is not independent interoperability evidence. No schema or user-format migration is part of this change.

The existing `#410`/`#499` literal nonempty `PRAGMA cipher_version` acceptance criterion remains owner-only and is not waived by the driver choice, fixture or self-read test. Preserve that exact limitation. The parent replaced `better-sqlite3-sqlcipher` through the authorized dependency lane. Lifecycle compilation for the replacement is not enabled: its shipped platform prebuild is used and packaging verifies that copy.

## Package vetting

The parent owns package vetting: registry identity, release history, maintainers, downloads, build attestations, OSV, deps.dev and GitHub advisories. The parent completed frozen installation and loaded the shipped Windows x64 prebuild. Package measurements are not native compatibility proof. The cipher package has one maintainer; the Chromium BiDi package lacks an attestation. Advisory-query absence is not a safety guarantee. Shadcn 4.22.1 and Puppeteer 25.14.0 adopt upstream Zod 4 support rather than forcing a major upgrade into old callers. The SDK and JSON-schema adapter declare Zod 4 support; scoped overrides select 4.6.6. No Zod 3 remains in the graph.

## Focused proof

Run the factory encryption and snapshot worker tests, desktop script-security tests, and the packaged-runtime encryption test. The factory tests check ciphertext bytes, wrong/missing-key rejection, the official SQLCipher 4 fixture, and plain unkeyed SQLite. Snapshot tests exercise an encrypted WAL source, escaped keys, copied rows, integrity, schema version and wrong-key rejection. The package test uses a stubbed API build command, a 120-second subprocess timeout, the real copied runtime and an injected missing-prebuild failure.

Native verification at committed head `d98180098edebe11fb51ae81e3a3492351ef4b14` passed: 173 focused API tests, the copied packaged-runtime test, and the legacy-password recovery browser test. API and web types passed after the contracts build prerequisite. The browser test covers the hosted failure caused by the old accountId fixture. Operational command records remain local and ignored. These results do not establish hosted CI acceptance or the literal cipher-version criterion.

## Phone-only auth compatibility (owner approved)

Owner approved the required schema migration and then accepted internal temporary addresses because there are no real users. Better Auth 1.7.7 has no supported core-field removal; do not disable its schema validation. Keep email login, OTP delivery and email recovery disabled. Add email/emailVerified compatibility storage with random unique 128-bit identifiers under reserved `users.invalid`, unverified by default. No phone number appears in the placeholder and no address is collected or mailed.

Fresh SQLite tables generate addresses with a database default. Existing tables receive additive columns, missing-address backfill, a unique index and an insert trigger because SQLite cannot ALTER in a nonconstant default. Preserve existing identities, credentials and nonempty email values; repeat initialization leaves generated identities unchanged. The Drizzle adapter receives the explicit application schema, including in tests that intentionally reject invalid phone input before database access. A legacy-password test now uses the production credential accountId=userId invariant instead of its old phone-number accountId fixture; it still verifies whitespace-password recovery and wrong-password rejection. Regression proof: two new schema tests failed before implementation; migration/default uniqueness/idempotence, auth and bootstrap files now pass19/19, API types pass.

Parent also vetted resolved Noble2.4.0 and JOSE; rejected remediation-day JOSE6.2.16 in favor of attested October20 release6.2.13 with no advisories returned by OSV/deps.dev/GitHub. Exact records remain local. This supports auth dependencies only, not SQLCipher database-driver acceptance.

## Completion

The reviewed-source port, dependency integration and affected local verification are complete. The parent publishes the single consolidated PR after resolving review findings; current-head hosted audit, review and CI acceptance remain pending. The owner forbids merge. The literal `cipher_version` acceptance gate remains open and owner-controlled.
