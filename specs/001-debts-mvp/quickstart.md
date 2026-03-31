# Quickstart: Debt Management MVP

## Goal

Validate the MVP debt workflow end-to-end for both internal workers and external counterparties.

## Setup

1. Start the app normally.
2. Sign in as an admin-capable user.
3. Ensure at least one worker already exists.

## Flow 1: Internal worker debt

1. Open a worker detail page.
2. Open the new debts tab.
3. Create an opening balance.
4. Confirm:
   - positive balance shows as green
   - label means the worker owes us
5. Add a payment/adjustment entry.
6. Confirm the net balance updates.
7. Use settle/close.
8. Confirm:
   - a settlement ledger row is added
   - final balance is zero

## Flow 2: External counterparty debt

1. Open the debts page.
2. Choose to create an external counterparty.
3. Save name, phone, and note.
4. Confirm the app returns to debt-related flow.
5. Create an opening balance for the external counterparty.
6. Add a payment entry.
7. Confirm the running balance and ledger are correct.

## Flow 3: Debts hub

1. Open the debts page.
2. Confirm both internal and external records appear.
3. Confirm:
   - positive = green = they owe us
   - negative = red = we owe them
   - settled accounts show zero/settled state

## Automated verification

Run:

```bash
pnpm --filter @tuari/api test && pnpm --filter @tuari/api typecheck
pnpm --filter @tuari/web test && pnpm --filter @tuari/web typecheck && pnpm --filter @tuari/web lint
cargo test --manifest-path "apps/desktop/src-tauri/Cargo.toml"
```
