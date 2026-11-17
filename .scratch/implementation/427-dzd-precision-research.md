# Exact DZD precision investigation

Status: researched proposal, not an approved schema, contract or dependency change. Part of #427. Source inspected at `0fc85668231536e7c98a60359d584bfee7b3b1c0`, including merged #480 rounding and #454 money rendering. No runtime source, package manifest, lockfile or database was modified.

## Recommendation

For exact fractional DZD across the current monetary magnitude, recommend canonical DZD decimal text through input, API, authoritative money storage and display, with a small TypeScript money module backed by a vetted decimal library. Example storage and API value: `"100.50"`, meaning 100.50 DZD, never 10050 cents. Numeric operations consume a decimal value, not a JavaScript `number`. This is a technical representation of DZD, not a change of currency unit.

This is a wider decision than adding salary tables. The sole authoritative debt ledger currently uses REAL. Salary-only TEXT would leave debt balances approximate. Before implementation, present and obtain approval for the affected ledger fields, public contracts and consumers. There is no old real/customer data to migrate, but code, tests and dev records cannot be dropped or reset without authority.

The alternative is retaining `number`/REAL with an explicitly approved and tested fractional-precision, representability and range policy. That minimizes compatibility changes but cannot promise every two-decimal value over today's full allowed magnitude. Do not silently lower a cap, select a different bound or claim rounding fixes input precision loss.

## Why a database declaration alone does not fix it

SQLite REAL uses binary floating point. Declaring `DECIMAL(18,2)` produces NUMERIC affinity, not a fixed-precision decimal engine, and does not enforce the declared decimal scale. A database switch is not necessary merely to preserve DZD decimals: canonical TEXT can preserve values in the current SQLite/SQLCipher architecture, provided arithmetic never coerces them back to REAL.

Use explicit TEXT affinity and canonical-value validation. A possible canonical format is an optional minus sign where the domain permits it, an integer part and exactly two fractional digits. The user may enter 100 or 100.5; the normalized value is 100.00 or 100.50. This canonical format is proposed, not an approved new wire contract. Reject grouping symbols, exponent notation, NaN/infinity, noncanonical leading forms and unreasonable input length at the wire/module interface. Retain the existing magnitude meaning through exact decimal comparison unless a different bound is explicitly approved.

Database checks must enforce the actual shape and allowed signs rather than a permissive SQLite numeric cast. STRICT TEXT alone only enforces storage class, not a valid monetary grammar. Application validation and checks must agree. The exact check, schema evolution and compatibility policy require a concrete reviewed proposal before application.

SQL `SUM`, `+`, `CAST(... AS REAL)` and numeric conversion over TEXT would undo the fix. Lexical TEXT ordering is not numeric ordering. Perform exact sums/comparisons inside the money module, or use a separately justified exact query strategy. Existing observed salary read ordering uses dates/ids; inspect each affected report and writer before changing its amount type. Do not introduce a native SQLite decimal extension merely because one exists; distribution and SQLCipher compatibility are unproven and no extension was installed.

## TypeScript and wire plan

1. Inputs and JSON contracts preserve a canonical DZD decimal string before any `Number` coercion. A decimal library cannot recover digits already lost by parsing JSON numbers.
2. A private money module validates finite signed/unsigned domain amounts, exact magnitude and aggregate bounds, and provides addition, subtraction, comparison, approved rounding and deterministic allocation. Use one configured constructor, not mutable global decimal configuration.
3. Direct multiplication/division stays inside exact arithmetic. Reference-based suggestions and allocation suggestions round at the stated currency boundary. Explicit approved segment amounts are not silently redistributed. Prove residual allocation and totals using independent examples.
4. Repositories bind and retrieve canonical DZD text. No `Number(row.amount)` or `.toNumber()` conversion is permitted on an authoritative exact path. Debt entry movements and account totals must use the same representation. Keep the ledger as the sole obligation source, not a second salary balance or a rounded authoritative duplicate.
5. Reuse the landed `MoneyValue` and grouping preference after an approved string-capable update and real browser/runtime tests. Its current `value: number` type cannot preserve exact large fractions. Keep optional decimals, signs and zero-as-dash behavior. Do not add a second renderer or a centime setting.

The five items describe an integration proposal, not authority to update all financial features. Scope exact changed contracts and direct callers first. A no-write arithmetic prototype can demonstrate behavior without publishing these contracts or changing schema.

## Existing seams that must be accounted for

- Salary inputs and outputs: `packages/contracts/src/workforce.ts`. Salary service: `apps/api/src/modules/company/workforce.service.ts:616-721`.
- Debt account/entry wire values: `packages/contracts/src/debts.ts`; numeric arithmetic and generic commands: `apps/api/src/modules/company/finance.service.ts:437-795`.
- Authoritative debt/salary storage: `apps/api/src/schema/company.ts`, raw definitions in `apps/api/src/infrastructure/database/schema-definitions.ts`, SQLite adapters and `company.repository-mappers.ts` number coercions.
- Project cost: `apps/api/src/modules/project-cost/project-cost.service.ts:55-102,148-160`, its SQLite adapter and `packages/contracts/src/project-cost.ts:59-69`. Salary labor cost must change from cash/day rows to approved segment amounts once, independent of payment count.
- Display: `apps/web/src/features/shared/money-value.tsx:5-40` and `features/preferences/money-format-preference.ts`. #454 is landed and reused, not replaced.

Explicit settlement attribution and a real immediate transaction remain necessary. Decimal arithmetic alone does not repair ambiguous payments or generic opening-void cascades. Do not freeze accounts containing unrelated obligations.

## Package vetting, no package added

Preferred candidate: `decimal.js` 10.6.0. The exact version is already pinned transitively through jsdom in this repository's lockfile, and an existing installation was used for the research probe. It is NOT a declared production dependency. Runtime use would require a parent-owned, explicitly staged direct dependency and lockfile decision after approval. Do not import it through an undeclared transitive path in production.

Registry and primary API measurements retrieved 2026-11-09:

| Finding | decimal.js 10.6.0 | big.js 7.0.1 |
| --- | --- | --- |
| Official identity | Unscoped package linked by MikeMcl/decimal.js | Unscoped package linked by MikeMcl/big.js |
| Selected release date | 2025-07-06 | 2025-04-21 |
| Registry versions | 53 | 36 |
| Weekly downloads, Nov 2-8 | 137,581,757 | 42,417,914 |
| Maintainers and runtime dependencies | One maintainer, no dependencies | One maintainer, no dependencies |
| Registry build attestation | None | None |
| OSV, deps.dev, GitHub queries | No listed advisories returned for selected version/package queries | No listed advisories returned for selected version/package queries |
| Unpacked registry size | 284,347 bytes | 58,948 bytes |
| Already locked here | Yes, transitive | No matching lockfile dependency found |

Both are established packages by the same maintainer, not scoped-package look-alikes. Single-maintainer and absent provenance remain real supply-chain limitations; downloads and absent advisories do not prove safety. Prefer the already pinned decimal.js candidate over adding a second decimal engine. Registry integrity for the selected decimal.js version matches the lockfile's sha512 record. No socket.dev automated verdict is claimed.

`decimal.js` includes TypeScript declarations, immutable operations and isolated constructors. It rounds calculations by significant-digit precision, so configure and justify sufficient working precision against supported magnitude, scale and intermediate operations. The probe used 80 significant digits only as an experiment, not an approved production parameter or full proof. Reject NaN/infinity explicitly even though the library can represent them. Limit input length/scale to prevent unbounded resource use. Persist and serialize DZD strings, never number-based scaled cents. Quantization must be deliberate; the library is not automatic policy.

A small BigInt coefficient/scale module is possible without a dependency, but it shifts parsing, rounding, division, exponent rejection and overflow/resource-limit correctness onto our own financial code. That is a trade-off, not inherently safer just because no package is added. A second generic arithmetic implementation should not coexist with a chosen decimal engine without a concrete need.

## Measured proof and honest boundaries

Research script: ignored `.scratch/reviews/427/precision-research/precision-probe.mjs`. Successful log: `precision-probe-attempt2.json`. Node v22.23.2, built-in SQLite 3.51.3, in-memory only; 17 checks passed with exit 0. The test used the existing decimal.js10.6.0 installation without downloads or dependency changes.

Results include:

- REAL stored the supplied `9007199254740990.99` as `9007199254740991`; SQLite DECIMAL did not preserve it either. TEXT preserved the original literal.
- `DECIMAL(18,2)` accepted `1.234`; its declared scale was not enforced.
- SQLite `SUM` of TEXT 0.10 and 0.20 produced approximate `0.30000000000000004`; the decimal sum of the retrieved strings was exactly `0.30`.
- Decimal `0.30 - 0.10 - 0.20` produced `0.00`. The large fractional value plus `0.01` produced exact `9007199254740991.00`. Signed half-up checks matched half-away-from-zero examples.
- JSON numeric input and conversion back to Number lost large fractional information; JSON string input preserved it. Exact magnitude comparison detected a value above the current DZD bound without converting to Number.

Attempt 1 failed because the expected production SQLCipher package was not installed in the existing reference checkout. Preserve `precision-probe-attempt1.json`; it was not treated as a pass. The successful built-in SQLite experiment is NOT production adapter/SQLCipher, concurrency, rollback or migration verification.

A separate Node Intl probe preserved `9007199254740990.99` when formatting a decimal string, while Number formatting lost its fraction. It displayed 100.00 as 100 and 100.50 as 100.5 under the landed optional-decimal convention. This is Node evidence only; TypeScript Intl typings, Tauri/WebView/browser support and actual shared-renderer integration remain to test. It does not grant UI implementation or merge approval.

## Required next proof before write enablement

Use the chosen supported representation at real public interfaces, not implementation-only mocks. Prove canonical input and rejection, exact supported-bound/aggregate cases, reference suggestions, repeated A/B/A segments, explicit remainder, deterministic rounding and independent expected sums. Then prove production SQLite/SQLCipher round trips, same-connection immediate reservation, competing connections, rollback, replay/conflict, targeted debt settlement, unrelated-obligation preservation and approved labor cost counted once across multiple payments. Full suites/builds remain CI-final.

No representability cap, schema migration, direct package dependency, published contract or UI change is approved by this research. Obtain a concrete owner decision before applying those changes.

## Excess cash after downward correction

The owner agreed that the operator must select an explicit treatment and raised the possibility of a combination. Do not interpret that as approved three-option semantics yet.

A concrete proposal to clarify is an explicit split of the excess into cash actually returned by the worker, an amount the company explicitly approves the worker retaining as earned compensation, and a recoverable amount remaining owed by the worker. Every portion must be nonnegative and the split must equal the excess. Cash return needs an actual recorded receipt, not a fictional refund. Approved retained compensation changes earnings and needs explicit labor-cost allocation or unallocated treatment. A recoverable portion creates an explicit receivable. The ledger remains the sole source; unrelated wages must not be silently netted.

This split is a proposal, not an owner-selected policy. Confirm whether retaining a portion means earned bonus or a separate non-labor write-off before implementation. Do not treat the user's ambiguous example as authority to choose accounting treatment.

## Primary sources and records

- SQLite floating-point documentation: https://www.sqlite.org/floatingpoint.html
- SQLite storage affinity and DECIMAL behavior: https://www.sqlite.org/datatype3.html
- SQLite STRICT tables: https://www.sqlite.org/stricttables.html
- decimal.js official README for v10.6.0: https://github.com/MikeMcl/decimal.js/tree/v10.6.0 and https://mikemcl.github.io/decimal.js/
- Drizzle custom type documentation: https://orm.drizzle.team/docs/custom-types . A custom mapping does not itself make SQLite arithmetic exact.

Registry snapshots, download measurements, OSV POST results, deps.dev version records, GitHub advisory responses and fetched primary documents are ignored under `.scratch/reviews/427/precision-research/primary/`. The SQLite aggregate documentation fetch timed out; the SQL SUM claim above is measured in the probe and is not attributed to a successful fetch of that page. The technical feasibility advisor inspected source at the named HEAD and wrote no files or execution claims; its final report is saved locally as `luna-feasibility.json`. Local reports are not committed or uploaded.
