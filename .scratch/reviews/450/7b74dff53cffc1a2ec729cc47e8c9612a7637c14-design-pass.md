# #477 design-pass

Base: 073af118d4f10dd1e7c4099a36a228b2035b00bb.
Source: 7b74dff53cffc1a2ec729cc47e8c9612a7637c14.
Reviewer: GPT-6 Luna, high, read-only delegated review.
Mode: remote. Tier: High-assurance.

**Review complete** at source SHA `7b74dff53cffc1a2ec729cc47e8c9612a7637c14`, against the fixed `073af118…` → `7b74dff5…` boundary.

**Findings:** No actionable findings.

**Spec coverage:** The source and tests cover definition IDs versus concrete stock-row IDs, optional `optionId` selection, legacy definition-level allocation, picker/write-gate availability parity, archived filtering, and rollback on shortage or persistence failure. Decimal tests check six-decimal conservation, representable deltas, large-balance edge cases, and inbound transfer arithmetic.

**Architecture lens:** I loaded `codebase-design` and `domain-modeling`, read their deep-module criteria, and checked the inventory-related architecture wisdom. No inventory glossary or relevant inventory ADR was present. The separate architecture-improvement skill is absent; I did not claim to load it. Under the documented lens, the repository read is a focused seam, the private allocator hides stock allocation and delta checks, and the outer service transaction owns debt, stock, movements, and transfer persistence. `itemId` remains the definition identity; optional `optionId` selects a concrete row without adding a persisted FK. Existing movement rows record the consumed entry or asset unit. These choices fit the stated requirements; I found no behavior-based reason to recommend an ADR or glossary change.

**Limitations:** The V2 picker still constrains consumable quantities to integers; the design records that as out of scope. I ran no tests. The retained guard evidence reports API 1,750 passed / 3 skipped, web 968 passed, and contracts, typecheck, and lint green. It does not establish E2E or hosted final-head review; those remain separate gates.

**Next:** Attach this review to the parent’s required hosted final-head review.
