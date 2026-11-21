# Invoice exact-form progressive disclosure restoration

Base: `bcbb97daee55b545f4b6e4911db0ce39c2e100f0`. Worktree: `D:/worktrees/tuari_react_hono/t3-735a52ee-8d4b6d8a510efe19`. Verification: focused-local / CI-final-pending; high-assurance bounded correction.

## Approved mapping

- Essential fields remain in `ExactInventoryPurchaseForm`: invoice number/date and exact-price line editor.
- Four existing `CollapsibleSection` disclosures provide accessible, initially closed groups: debt/payment; counterparty; typed warehouse/project defaults; note/attachments. Component-local state persists through line list updates.
- Current exact `party`, debt/payment inputs, `note`, and attachment draft stay the source of submitted values; no API/schema fields are introduced.
- Header destination is UI state encoded as `WAREHOUSE:<id>` or `PROJECT:<id>`. A line's explicit location wins; an unset line inherits the header value during line mapping. Group destination remains the header default. Existing `locationInput` resolves the typed pair, including same-string warehouse/project IDs.
- Existing exact price parsing, debt percent contract, create-once/upload retry and attachment validation remain unchanged.

Reachable risk: accidentally changing line placement, exact money/debt semantics, or attachment retry while hiding optional controls. Interface/seam: mounted `ExactInventoryPurchaseForm` with real query context, observing rendered controls and submitted exact command.

Architecture: no seam moved; the existing `CollapsibleSection` interface is reused. Applied wisdom: sensible editable defaults; typed composite location identity; hidden fields should be unmounted and section state should survive parent rerenders. Excluded: legacy numeric invoice field/DB assertions; exact command remains authoritative.

## Recovery and proof scope

Recovered the two existing source/test drafts without resetting or replacing the tree. Read-only dependency junctions reuse the parent's installed root and web toolchain. No package install, build, browser, server, schema or API change is part of this correction. Logs and native-command scripts live on C because D has less than 70 MB free.

Optional groups sit above the always-visible line grid. Their controls unmount while closed; their values remain in the purchase form and attachment draft. Existing disclosure IDs label the expanded regions. The typed header destination feeds only lines with an empty override. Same-string project and warehouse IDs remain distinct.

Mounted form cases cover all four toggles, actual hidden controls, RTL, expansion persistence, typed collision, explicit override versus header inheritance, retained note and party, exact canonical pricing and visible disabled-save reasons. The mounted real-QueryClient route case expands every section, submits schema-validated exact debt and four-place price input, fails upload, retries on the same created group, then mounts attachment detail. Existing attachment reconciliation failure and cross-owner draft tests remain intact.

The two historical invoice E2E specs were read but not changed or run. They assume legacy type-first rows, custom header warehouse/project comboboxes, numeric DZD columns and old detail navigation. Current exact form has a combined typed native destination selector. These browser assertions still need explicit exact-route/schema migration and parent browser proof after capacity recovery; mounted exact command and detail proof does not claim to replace them.

## Supplier correction after 3670ced8

The earlier supplier-gap conclusion was incomplete. The published runtime exact create schema inherits `supplierName` from `inventoryInvoiceGroupCreateInputSchema`. A direct probe against the installed contracts dist verifies trimmed strings up to 160 characters, null, omission, and rejection beyond the maximum. No contract change is needed.

Restored the supplier field inside the optional counterparty section. Semantics come from the legacy form at `inventory-invoice-create-page.tsx`: selecting a party seeds its full name; its selected full name is authoritative at submission; without a selected party, the manual supplier draft is used. Switching to another party replaces the previous seed. Clearing the party leaves the seed editable, matching the prior field state. Unlike the legacy misleading editable-but-ignored selected-party field, the restored field is read-only while a party is selected, with an explicit hint to clear the party before editing. An empty manual name submits null, and the existing codec trims it. Counterparty ID is submitted separately, including nondebt purchases as the legacy form did. Supplier text never chooses a debt party or creates a ledger.

Mounted tests cover initial party seeding, explicit selection changes, manual fallback and trim/null codec behavior, controlled-prop rerenders, line additions, section close/reopen, and exact create payloads. The full expanded debt/upload-retry route now asserts the actual supplierName property and uses a consistent schema-valid supplier-bearing create/get/list fixture. Existing exact service persistence remains unchanged. This supersedes only the earlier supplier-gap limitation; browser migration and hosted gates remain pending.

No new domain term, adapter or seam was introduced. Deleting this form would move its parsing, optional-state and upload lifecycle into the page, so the existing form interface remains useful. Broader extraction would add an interface without a second caller and is outside this bounded fix. Parent owns combined-delta review, browser proof and all hosted/CI/protection gates.

## Upload-error P2 correction after 2090f6ef

Read the complete independent `combined-full-sol.md` report. Confirmed its one P2: after selecting a valid file and closing Notes, upload failure only rendered inside the unmounted picker. The created-group freeze prevented reopening Notes. Retry still worked but hid the actual failure reason.

The form now owns one upload-failure alert outside both disclosures and the disabled fieldset. The picker receives the same draft handlers and state, with its displayed error limited to validation failures, so opening Notes cannot duplicate the global upload alert. Validation-only Save reason stays independent. No attachment-hook, batch, retry, create, freeze, owner-isolation or shared-disclosure behavior changed. No ARIA-controls change was made.

The existing mounted real-route debt/supplier/create/retry case now runs with Notes left open and with Notes collapsed before Save. Both assert a single literal upload-failure alert outside the locked fieldset, continued lock, identical captured file and group on both upload attempts, exactly one create, and eventual attachment detail. Red baseline against 2090f6ef production failed both new cases for the expected alert placement/absence. Affected forms/routes then passed all 19 cases, including the existing closed-section unsupported-file explanation, cached-owner isolation and reconciliation-only retry cases. Earlier equipment, attachment-rule, published-codec and backend/security proof retain their earlier exact-tree attribution rather than being counted as rerun. Parent owns the fresh combined-delta review with unchanged conclusions carried forward.
