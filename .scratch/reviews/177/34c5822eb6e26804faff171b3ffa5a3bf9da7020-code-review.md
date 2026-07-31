# Code Review — Phase 1: Config Module

**Issue:** #177 (remaining)
**Base SHA:** 6583785d3f1363cbe0a242912af300354032118d
**Head SHA:** 34c5822eb6e26804faff171b3ffa5a3bf9da7020
**Tier:** Standard
**Date:** 2026-07-29

## Standards

### Files reviewed
- `apps/api/src/config/index.ts` (NEW)
- `apps/api/src/config/database.ts` (NEW)
- `apps/api/src/config/config.test.ts` (NEW)

### Findings

1. **Middle Man** (hard) — `createWorkforceRepository`, `createOperationsRepository`, `createFinanceRepository`, `createAuditRepository` are pure pass-throughs to `createCompanyRepository`. They exist as stubs for Phase 3. **Accepted as intentional** — documented in design doc, removed in Phase 3 when per-domain adapters arrive.

2. **Speculative Generality** (minor) — `dbAdapterSchema = z.enum(["sqlite"])` with a single variant. **Accepted** — planned for in the architecture.

3. **Divergent Change** (judgement) — `index.ts` bundles URL helpers, env parsing, Zod schema, and factory assembly. Acceptable for a new module; can split as it grows.

### Fixed during review
- Removed unused `_config` parameter from `buildSqliteRepository`
- Added real `DB_ADAPTER` env reading (was hardcoded to `"sqlite"`)
- Replaced misleading "enforces dbAdapter" no-op test with real invalid-adapter rejection test

## Spec

### Spec sources
- `.scratch/planning/177-remaining-tickets.md`
- `.scratch/implementation/177-phase1-config-module-design.md`

### Findings
- All required files created: `index.ts`, `database.ts`, `config.test.ts`
- Config validated with Zod ✅
- Typed `AppConfig` exported ✅
- Adapter factory functions for all 4 domains + CompanyRepository ✅
- 26 tests covering defaults, env overrides, validation errors ✅
- Coexists with existing `env.ts` (not modified) ✅
- No circular dependency introduced ✅

### Fixed during review
- `DB_ADAPTER` env var now read (was hardcoded) ✅

## Summary
- **Standards:** 3 minor findings, all addressed or accepted
- **Spec:** All requirements met, 1 fix applied
