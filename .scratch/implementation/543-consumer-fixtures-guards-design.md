# #543 consumer, fixture and guard corrections

Base: `0fdaff8fe76771c12a32bbe7bdd93f6c6935656f`; lane parent: `64a299490d0d55ec6c8f51e6b8a024a49a271fdf`; mode: focused-local / CI-final-pending; tier: high-assurance.

Scope is limited to direct consumers, tests, exact-import inventory, and feature-retired Arabic salary-form copy affected by #543. Approval actions in the employee, salaried-worker, and salary-payment tables now use the existing `earnings.approve` label; the old employee cash form and its unused copy were retired. Preserve DZD-only salary references, debt direction/auth/history assertions, original employee pages, and #522 semantics. No interface or architecture seam is intended to move. The employee-detail source commits are imported separately from authored corrections.
