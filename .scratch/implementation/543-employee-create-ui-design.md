# Employee batch creation UI

Base: `612d69040a1ced8d7a28061385f1ee7d107d1cfb`. Mode: focused-local / CI-final-pending. Tier: high-assurance because an employee salary reference is money data. The supplied #522 contract is unchanged.

The batch row owns an optional salary reference draft as amount text plus period. Blank/blank submits `salaryReference: null`; a legal zero remains a string amount and requires a period. `parseLocalizedUnitPriceInput` is the existing exact input seam; normalize to its exact wire decimal without a JavaScript number. DAILY accepts four fractional places, MONTHLY two. New rows offer DAILY and MONTHLY only. API validation paths remain attached to the matching amount or period field.

Scope is the original batch-create page, row card, schema, inline employee create payload and their focused tests. Existing RTL layout and controls remain. No new module seam or architecture move.

Expected red: the focused schema regression cannot resolve the unbuilt workspace contracts package; build that already-present workspace package, then rerun to capture the behavior failure. Local proof is the focused employee batch schema and interaction test, employee feature lint, and web typecheck. Full suite/build/browser are CI-final.

Applied wisdom: `.agents/wisdom/testing/employee-creation-via-ui-is-impossible-on-develop.md`, rechecked against the current create contract. Blank reference must not block native submit. No other matching lesson applied.
