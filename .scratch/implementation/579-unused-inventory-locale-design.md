# Remove unused Arabic inventory locale leaves

- Worktree: `D:/worktrees/tuari_react_hono/t3-b4f961d9-df3e3bf14b28eb19`
- Base: `34e6416325865106bb69dffd58ce70308d949a92`
- Verification mode: focused-local / CI-final-pending
- Review tier: high assurance bounded correction, as assigned by the parent.
- Diagnosis: `D:/worktrees/tuari_react_hono/t3-48d661ef-3ae352d3d2c079c6/.scratch/reviews/579-integrated/34e64163/i18n.log`

Remove only these five unused Arabic translation leaves: `inventory.location.assets`, `inventory.location.consumables`, `inventory.location.noAssets`, `inventory.location.noConsumables`, and `inventory.transfer.button`. The task diagnosis identifies them as the final unused leaves and reports no missing keys. Keep every parent with surviving values, all used/history keys, current placement/live keys, and the numeric UI unchanged. No production consumer, scanner, test, configuration, locale refactor, dependency, or other source file is in scope.

The change removes dead locale data; no interface or architecture seam moves. Proof is the focused i18n checker/report, its actual Node test wrapper, and the exact id-less purchase-details HomeView test selected by its test name. No full suite is authorized. Parent performs the fresh combined review and final checker on the integrated tree.
