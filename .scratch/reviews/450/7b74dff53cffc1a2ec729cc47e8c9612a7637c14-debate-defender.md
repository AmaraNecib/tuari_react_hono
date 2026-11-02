# #477 debate-defender

Base: 073af118d4f10dd1e7c4099a36a228b2035b00bb.
Source: 7b74dff53cffc1a2ec729cc47e8c9612a7637c14.
Reviewer: GPT-6 Luna, high, read-only delegated review.
Mode: remote. Tier: High-assurance.

Keep **HEAD `7b74dff53cffc1a2ec729cc47e8c9612a7637c14`**. **No actionable findings**; I found no flaw I could not defend. Confidence: **8/10**.

- **Definition and stock-row IDs stay distinct.** The contract makes `optionId` optional (`packages/contracts/src/inventory.ts:472–482`); the picker sends the definition and selected row IDs separately (`apps/web/src/features/inventory/multi-source-item-picker.tsx:78–119`). The service rereads stock at the chosen source, applies the shared offer rule, then restricts consumption to the selected row when supplied (`apps/api/src/modules/inventory/inventory.service.ts:1169–1225`). That addresses #450’s ID mismatch while retaining definition-level callers.
- **Picker and write gate use aligned availability rules.** The repository shares the source-location predicate and six-decimal minimum between the picker query and stock read (`apps/api/src/modules/inventory/adapters/sqlite-inventory.repository.ts:269–320, 684–713`). Tests cover warehouse/project parity, archived and empty definitions, and concrete-row selection (`apps/api/src/modules/inventory/outbound-transfer-availability.test.ts:190–340`).
- **Quantity changes preserve the stated precision invariants.** Decimal helpers avoid scaled-float arithmetic and check the actual stored-number delta (`apps/api/src/modules/inventory/inventory.helpers.ts:63–145`). Allocation checks stock and request remainders and fails inside the transaction if they cannot represent the requested movement (`apps/api/src/modules/inventory/inventory.service.ts:1042–1096`). Tests cover representable large deductions, rejected mismatches, exact fulfillment, and rollback on shortage (`apps/api/src/modules/inventory/outbound-transfer-availability.test.ts:1104–1200`).
- **The UI distinguishes pending, error, and empty states** and filters archived definitions (`apps/web/src/features/inventory/multi-source-item-picker.tsx:64–98, 209–217`). The E2E workflow pins Ubuntu 24.04 (`.github/workflows/ci.yml:259`).

**Spec coverage:** The local #450 issue confirms the definition-ID versus entry-ID defect. The design document and tests cover definition-based selection, optional concrete-row selection, source availability, quantity precision, and transactional rollback.

**Limitations:** This was read-only; I did not rerun tests. The supplied guard evidence reports API 1,750 passed/3 skipped, web 968 passed, with contracts, typecheck, and lint green. I did not verify hosted CI, E2E, or Greptile results.
