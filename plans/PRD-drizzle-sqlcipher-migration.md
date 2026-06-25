# PRD: Drizzle ORM Migration + SQLCipher Encryption

**Status**: Ready for Agent
**Triage**: `ready-for-agent`
**Created**: 2026-06-25
**Parent PRD**: `PRD-production-readiness.md` (this PRD completes the remaining Phase 1 item)

---

## Problem Statement

Tuari stores sensitive business data — employee names, phone numbers, salaries, debt amounts, inventory values — in an unencrypted SQLite file. If someone gains access to the file (stolen USB drive, copied database, unauthorized filesystem access), all data is readable in plaintext. This is the single remaining blocker from the Production Readiness PRD that prevents selling to customers.

The current stack is split: `company.repository.ts` and `inventory.repository.ts` use raw `better-sqlite3` with hand-written SQL and manual mappers (2000+ lines), while `account.repository.ts` and `auth/bootstrap.service.ts` use Prisma via `@prisma/adapter-better-sqlite3`. This split means two different database access patterns coexist, making the codebase harder to maintain and impossible to swap the underlying driver without touching both layers.

Additionally, the CI runs on GitHub Actions (`ubuntu-latest`), but the portable Windows build requires native module compilation targeting Windows. Moving CI to Blacksmith unblocks reliable Windows builds.

---

## Solution

Migrate the entire data layer from Prisma + raw better-sqlite3 to **Drizzle ORM + better-sqlite3-sqlcipher**, delivering full database encryption in four incremental PRs. Each PR keeps the app working and CI green.

### Encryption Architecture

**Two-password model:**

| Credential | Purpose | Stored? | Used for |
|------------|---------|---------|----------|
| Database encryption key | "Break glass" — full DB access | Never on disk | Initial setup, disaster recovery, password change |
| App login credentials | Daily access | Hashed in DB | Normal app usage |

**Recovery key system:**

- 3 recovery keys generated on first launch, configurable maximum (5)
- Each key is an independent one-time-use **app-layer credential** that authorizes a password reset — not a direct SQLCipher unlock key
- Keys are shown **once** at generation time, then masked forever (`TUARI-A1B2-****-****`)
- Admin can **revoke** any key without using it (if compromised)
- Admin can **generate new keys** from the dashboard (up to max)
- Recovery keys survive DB password changes (they are independent app-layer tokens)
- DB password changes survive recovery key usage (they are independent)

**Key independence matrix:**

| Credential | DB password change | Recovery key used | Recovery key revoked |
|------------|-------------------|-------------------|---------------------|
| DB password | — | Still works | Still works |
| Recovery key 1 | Still works | — | N/A |
| Recovery key 2 | Still works | N/A | Still works |
| App password | Unaffected | Unaffected | Unaffected |

**Password change flow:**
- Admin enters current DB key → enters new DB key → `PRAGMA rekey = 'new-key'` re-encrypts in place (<1 second)
- Recovery keys remain valid (they are independent app-layer tokens)

**Recovery flow:**
1. User forgets app password → opens the app → sees the login screen
2. User clicks "Forgot password?" → enters a recovery key
3. The app validates the recovery key against the stored verification hash (app-layer check, DB is already unlocked at this point since the app holds the key in memory)
4. Key is marked as consumed → user is prompted to set a new app password
5. User is prompted to generate a replacement recovery key from Settings

### Multi-User Model

- Only the admin knows the DB encryption key
- Other users authenticate through the app (username + password), verified by the app layer
- The app holds the decryption key in memory while running
- RBAC is an application-layer concern, not a database-layer concern
- The DB encryption key is a deployment-level secret, not a per-user credential

### Migration Strategy (4 Incremental PRs)

**PR 1 — Drizzle + SQLCipher foundation:**
- Install `drizzle-orm`, `better-sqlite3-sqlcipher`, `@better-auth/drizzle-adapter`
- Create Drizzle schema definitions (port existing `schemaStatements` to Drizzle schema files)
- Replace Prisma with Drizzle in `account.repository.ts` and `auth/bootstrap.service.ts`
- Replace `better-auth` Prisma adapter with Drizzle adapter
- Update `prisma.ts` to Drizzle connection factory
- Migrate test helpers to file-based SQLite (temp directory, cleanup after tests)
- Remove Prisma dependencies

**PR 2 — Company repository migration:**
- Rewrite `company.repository.ts` from raw better-sqlite3 to Drizzle queries
- Remove manual `company.repository-mappers.ts` (Drizzle handles mapping)
- Migrate company tests to Drizzle + file-based SQLite
- Verify all 388+ tests pass

**PR 3 — Inventory repository migration:**
- Rewrite `inventory.repository.ts` from raw better-sqlite3 to Drizzle queries
- Remove inventory manual mappers
- Migrate inventory tests to Drizzle + file-based SQLite
- Verify all tests pass

**PR 4 — Encryption, recovery keys, CI, portable build:**
- Add SQLCipher initialization (PRAGMA key on connection)
- Implement recovery key generation, storage, revocation, and consumption
- Add Settings UI for: change DB key, change app password, manage recovery keys
- Update portable build script to include `better-sqlite3-sqlcipher` (prebuilt from npm, not committed to repo)
- Switch CI from GitHub Actions to Blacksmith (Windows build support)
- Update `database-env.ts` to support encryption key parameter
- End-to-end test: create DB → encrypt → set password → generate recovery keys → revoke one → use one → change password

---

## User Stories

### Encryption Stories

1. As an admin, I want to set a database encryption key on first launch, so that my business data is protected at rest.
2. As an admin, I want the encryption to be transparent during normal use, so that I don't notice it's there after setup.
3. As an admin, I want to change my database encryption key from Settings, so that I can rotate it periodically.
4. As an admin, I want the key change to happen in-place without data loss, so that I don't need to export/import.
5. As an admin, I want the encrypted database to work in the portable app, so that USB drive data is protected.

### Recovery Key Stories

6. As an admin, I want 3 recovery keys generated on first launch, so that I have backup access if I forget my password.
7. As an admin, I want each recovery key to be one-time-use, so that a used key cannot be exploited.
8. As an admin, I want to see my recovery keys once at generation time, so that I can write them down.
9. As an admin, I want recovery keys shown masked after generation, so that someone looking at my screen can't copy them.
10. As an admin, I want to revoke a recovery key without using it, so that I can invalidate a compromised key.
11. As an admin, I want to generate new recovery keys from Settings, so that I can replenish my pool after using or revoking one.
12. As an admin, I want a configurable maximum pool size (default 5), so that the system adapts to future needs.
13. As an admin, I want my recovery keys to still work after I change my DB password, so that recovery is always available.
14. As an admin, I want my DB password to still work after using a recovery key, so that normal access is preserved.

### Password Stories

15. As an admin, I want to set my app login password separately from the DB encryption key, so that daily credentials don't expose the master key.
16. As an admin, I want to change my app password from Settings, so that I can rotate it without affecting encryption.
17. As a user, I want to log in with my phone number and password, so that I can access the app normally.
18. As a user, I want my password change to not affect database encryption, so that I don't trigger unnecessary re-encryption.

### Migration Stories

19. As a developer, I want to replace Prisma with Drizzle ORM, so that we have type-safe queries without code generation.
20. As a developer, I want to replace raw better-sqlite3 with Drizzle, so that all database access uses one consistent pattern.
21. As a developer, I want the migration to happen incrementally (4 PRs), so that each step is reviewable and CI stays green.
22. As a developer, I want tests to use file-based SQLite (not in-memory), so that we test closer to production behavior.
23. As a developer, I want test helpers migrated alongside production code, so that tests never pass while being wrong.

### CI and Build Stories

24. As a developer, I want CI to run on Blacksmith, so that we can build Windows portable binaries.
25. As a developer, I want the portable build to include `better-sqlite3-sqlcipher`, so that the encrypted DB works on end-user machines.
26. As a developer, I want the portable build to bundle Node.js, so that the app is self-contained.

### Settings UI Stories

27. As an admin, I want a Settings page with "Security" section, so that I can manage encryption and recovery.
28. As an admin, I want to see my active recovery keys (masked) in Settings, so that I know how many I have.
29. As an admin, I want a "Revoke" button next to each recovery key, so that I can invalidate compromised keys.
30. As an admin, I want a "Generate New Key" button, so that I can add keys to my pool.
31. As an admin, I want a "Change Database Key" form in Settings, so that I can rotate the encryption key.
32. As an admin, I want a "Change Password" form in Settings, so that I can update my app login credentials.

---

## Implementation Decisions

### ORM and Driver

- **Drizzle ORM** replaces Prisma for all database access. Drizzle provides TypeScript-native queries without code generation.
- **better-sqlite3-sqlcipher** replaces better-sqlite3 as the SQLite driver. Drop-in compatible with better-sqlite3 API.
- **@better-auth/drizzle-adapter** replaces @better-auth/prisma-adapter for better-auth integration.
- Drizzle schema definitions will be created in `apps/api/src/schema/` directory, one file per domain.
- Raw SQL statements currently in `schemaStatements` and `companyIndexStatements` will be converted to Drizzle schema definitions.

### Encryption Key Management

- DB encryption key is provided via `APP_DB_KEY` environment variable or prompted on first launch
- Key is derived using PBKDF2 (100,000 iterations, SHA-256) with a random salt
- Derived key is used as the SQLCipher encryption key via `PRAGMA key`
- Recovery keys are generated as `PREFIX-XXXX-XXXX-XXXX` where PREFIX is configurable (default: derived from app name)
- Each recovery key is an independent random 128-bit key, stored as a verification hash in an encrypted metadata table
- Recovery key metadata table is encrypted like all other tables — accessible only when DB is unlocked

### Schema Changes

- **New table**: `encryption_metadata` — stores recovery key verification hashes, key status (active/consumed/revoked), creation timestamps
- **Modified tables**: None — all existing tables remain unchanged, just accessed through Drizzle instead of Prisma/raw SQL
- **Removed**: Prisma schema file (`prisma/schema.prisma`), Prisma client generation step

### Connection Management

- Database connection factory returns a Drizzle instance (not raw better-sqlite3)
- SQLCipher initialization: `PRAGMA key = <derived-key>; PRAGMA cipher_compatibility = 4;`
- Connection is created once at app startup, shared across all modules
- Tests create their own Drizzle instances with temp files, cleaned up after each test

### Test Infrastructure

- Tests use file-based SQLite in temp directories (not `:memory:`)
- Temp directory created per test suite, deleted in `afterAll`
- Test helpers create Drizzle instances pointing to temp files
- Schema applied via manual `db.exec()` with the same SQL statements as production (not Drizzle migration tooling)
- Each test gets an isolated database file

### CI Changes

- Migrate from GitHub Actions to Blacksmith
- Blacksmith provides Windows runners for portable builds
- CI pipeline: lint → typecheck → test → build → portable build
- Blacksmith configuration in `.github/workflows/ci.yml` (Blacksmith is a GitHub Actions replacement, same YAML format)

### Portable Build Changes

- Replace `better-sqlite3` with `better-sqlite3-sqlcipher` in the sidecar build
- Native binary must be compiled for Windows (target platform)
- `build-sidecar.mjs` updated to copy `better-sqlite3-sqlcipher` instead of `better-sqlite3`
- `build-portable.mjs` unchanged (already copies native binaries)

---

## Testing Decisions

### What Makes a Good Test

- Tests behavior, not implementation details
- Uses the public interface (module methods, RPC handlers)
- Is deterministic and independent
- Has clear naming describing the scenario
- Follows Arrange-Act-Assert structure
- Tests one thing per test case

### Test Approach for This PRD

- **PR 1**: Migrate existing auth/account tests to Drizzle + file-based SQLite. Add encryption initialization tests.
- **PR 2**: Migrate company tests to Drizzle. Verify all 388+ tests pass. Add Drizzle query regression tests.
- **PR 3**: Migrate inventory tests to Drizzle. Verify all tests pass.
- **PR 4**: Add recovery key tests (generate, use, revoke, max pool). Add password change tests. Add re-encryption tests. Add settings UI tests.

### Prior Art

- Existing test patterns in `apps/api/src/modules/company/company.test-helpers.ts` (inline schema setup)
- Integration tests in `apps/api/src/tests/integration/` (full workflow tests)
- EXPLAIN QUERY PLAN regression test in `apps/api/src/tests/integration/query-explain-regression.test.ts`

### Specific Test Scenarios

- DB initialization with SQLCipher key
- Recovery key generation (3 initial, up to 5 max)
- Recovery key consumption (one-time use)
- Recovery key revocation (without use)
- Recovery key pool replenishment
- DB password change with re-encryption
- Recovery key independence from DB password
- App password change without re-encryption
- Drizzle query parity with raw SQL (same results)
- File-based SQLite temp cleanup

---

## Out of Scope

1. **Cloud backup or sync** — app remains offline-only
2. **Multi-tenant support** — single organization per installation
3. **Mobile app** — desktop only
4. **Biometric authentication** — password-based only for now
5. **Audit log UI** — audit logging exists but no dedicated UI
6. **Automated backup** — users manually copy database files
7. **Drizzle migration tooling** — schema changes are managed via Drizzle's built-in migration, not a separate tool

---

## Further Notes

### Risk Mitigation

**Risk: better-sqlite3-sqlcipher compilation fails on CI**
- Mitigation: Use prebuilt binaries from the npm package. Blacksmith Windows runners have build tools available. Do not commit native binaries to the repo — rely on deterministic CI builds or published npm prebuilt binaries.

**Risk: better-auth Drizzle adapter has incompatibilities**
- Mitigation: Test auth flow early in PR 1. The adapter is officially maintained by better-auth. Fallback: keep Prisma for auth only.

**Risk: Drizzle queries produce different results than raw SQL**
- Mitigation: Run existing test suite after each migration PR. All 388+ tests must pass. Add parity tests comparing Drizzle results with raw SQL results.

**Risk: Recovery key metadata table is inaccessible if DB is corrupted**
- Mitigation: Recovery keys are a last resort. Regular backups (manual file copy) are the primary recovery mechanism. Document this clearly.

**Risk: Portable build binary size increases with SQLCipher**
- Mitigation: SQLCipher adds ~1MB to the binary. Monitor total size. Use compression in the portable ZIP.

### Success Criteria

- [ ] All data encrypted at rest (SQLCipher verification)
- [ ] Prisma fully removed from the codebase
- [ ] All database access through Drizzle ORM
- [ ] Recovery key system working (generate, use, revoke, replenish)
- [ ] Password change triggers re-encryption
- [ ] Tests use file-based SQLite
- [ ] All 388+ tests passing
- [ ] CI running on Blacksmith
- [ ] Portable build includes SQLCipher binary
- [ ] Settings UI for security management
