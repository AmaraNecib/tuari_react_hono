# #543 contract inventory and fixture corrections

- Worktree: `D:/worktrees/tuari_react_hono/t3-bbe6e2ed-3a4ef9f4f2a8b7fb`.
- Base: `fc157af72650e350153647833753f36fd879b165`; branch `fix/stale-exact-money-tests`.
- Mode: focused-local / CI-final-pending. Parent manages publication and CI. No old DB or historical dataset exists. The #522 exact-money contract and hashes remain unchanged.
- Scope: `packages/contracts/src/exact-money-inventory.test.ts`, `packages/contracts/src/index.test.ts`, and `docs/money/523-caller-matrix.md`. The fixture uses the current required `salaryReference: null`. Whitespace correction is limited to the employee fixture in `index.test.ts`.
- Inventory: the #523 27-field matrix remains a historical baseline. #543 replaced the two employee salary fields with period-tagged TEXT references and introduced four INTEGER monetary fields: earning total, unallocated amount, reference salary units, and segment amount. Current initialized inventory is 31: 25 unchanged baseline fields plus these six current fields. `reference_salary_period` is a semantic qualifier; day and quantity fields are not money. The test checks mapped physical names and types against initialized CREATE TABLE declarations.
- Exact import allowlist: the five added paths have actual imports/usages: workforce salary-reference parsing and earning approval normalization; project-cost repository Money/Quantity/UnitPrice mapping; project-cost service Money/UnitPrice calculations; employee-earning repository conversion between persisted integer units and exact wire values; workforce contract schemas use Money and SalaryReference validation.
- Architecture: no seam moved. Applied wisdom: `testing/test-fixture-data-must-satisfy-contracts-schemas-vitest-does-not-typecheck`. No lesson candidate.
- Verification: pending focused tests, relevant lint/typecheck, diff check, and committed-head evidence.
