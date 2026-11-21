# Debt payment preview restoration

## Authority and recovery

Worktree: `D:/worktrees/tuari_react_hono/t3-2623865b-5003a46f3bf84a70`.
Original and effective base: `bcbb97daee55b545f4b6e4911db0ce39c2e100f0`.
Mode: focused-local / CI-final-pending. High-assurance bounded correction because an incorrect projection can misrepresent a debt payment.
Owner restoration approval is recorded in the parent's ignored `579-e2e/owner-ux-restoration-approval.md`. The parent owns combined-delta review, integration, browser acceptance and publication. This worker does not publish or delegate.

Recovered the retired `t3-b2885718-59b5417ba3210be8` binary diff from HEAD and its untracked current design explicitly. Preserved retired source, dependency links and logs. The recovered draft already implemented the preview and had one expanded mounted test. New boundary tests were added around that implementation rather than restarting it. No original feature red run is claimed. A temporary preview-removal mutation demonstrates sensitivity, with byte-for-byte restoration in `finally`.

## Model and interface

The selected original entry's `remainingDzd` is the authoritative per-obligation maximum. The account balance and gross account totals are not payment targets. The untouched input draft goes through the existing localized parser; its validated positive canonical `parsed` string is both the command amount and the preview amount. Subtraction uses existing bounded Money, not Number. An account-wide aggregate remains a display-only aggregate string and is never parsed as stored Money for this preview.

A valid payment shows the existing MoneyValue representation of paid and remaining amounts. Full payment projects a genuine zero. Invalid, empty, negative, zero, over-remaining, over-scale and input-bound violations show no projection and cannot write. Existing parser policy is unchanged, including accepted notation. The server remains the final validator; this is not an optimistic ledger or authoritative balance update.

The new section reuses `debts.payment.preview`, `debts.payment.amount` and `debts.payment.balanceAfter`, with polite live announcements and RTL inherited from the real dialog. No locale file changes. PAYABLE and RECEIVABLE direction semantics, producer restrictions, original-only pay/correct guards and manual child cancellation are unchanged.

Architecture: no seam moved. The existing mounted page/dialog and injected ExactDebtsClient are the agreed public test interfaces. Deleting the section loses observable preview behavior; deleting its validation condition projects invalid money. No new helper, module, command or domain term is necessary. No API, contract, schema, query identity, accounting, write-guard or default changes.

## Proof

Mounted tests retain all 16 recovered cases and add 18 cases. They exercise the real CurrencyAmountInput and dialog, not a mocked preview. Literal expected amounts and mutation payloads cover:

1. Original 2500.00, localized draft `2 000.50`, paid 2000.50, remaining 499.50, both account directions, server-returned reload state and switching to an unrelated 75.00 original with full payment.
2. Empty, whitespace, sign-only, decimal-only, malformed/mixed grouping, zero, negative, over-remaining, over-scale, storage overflow and 129-character drafts. Submission is blocked even through direct form submission. Malformed/overflow input has aria-invalid after blur. Zero and negative retain existing input accessibility policy but cannot submit.
3. Maximum original 92233720368547758.07, one-cent payments, one-cent remainder, full payment, localized grouping and the valid 128-character input boundary. A real wide gross account total is rendered simultaneously, without using it in preview arithmetic.

Relevant direct-caller proof includes CurrencyAmountInput, exact-money-input and MoneyValue test files, canonical web TypeScript and changed-file package-cwd ESLint. Browser debt-entry assertions remain unchanged, including preview and persistence assertions; the parent runs the actual browser case after integration. No browser, server, build, installation or API suite runs here.

All new raw evidence and temporary files live at `C:/Users/sensei57/AppData/Local/Temp/debt-proof-2623865b`. Earlier setup and fixture-timing failures are preserved separately from passing runs. The final exact-SHA verification record is local, not committed. Source is frozen for parent review after this commit.

## Shared toolchain and wisdom

Only ignored root and web node_modules junctions point to the matching installed parent toolchain in `t3-48d661ef-3ae352d3d2c079c6`. The unchanged contracts source matches the base, and its existing parent dist is reused read-only. No package manifests, lockfiles or generated contracts are changed. Execution uses this tree's web cwd and actual source aliases. The final temporary Vitest config imports this tree's canonical config and changes only cacheDir to C:. No fresh dependency copies, installs or builds.

Applied the false-zero lesson by omitting invalid projections, while using current exact MoneyValue rather than that lesson's historical numeric formatter advice. Applied the unused-i18n-key lesson by wiring existing keys without adding leaves. Applied the whitespace lesson by testing literal grouping characters rather than assuming character classes. Existing exact localized-input, wide-balance, debt-direction, producer and original-target decisions were checked against current source and the prior debt-wide design. There is no dedicated matching wisdom entry for those exact-money decisions in this checkout. Excluded recovery-key rejection policy and numeric legacy formatting because neither governs this input. No wisdom is written by this worker.
