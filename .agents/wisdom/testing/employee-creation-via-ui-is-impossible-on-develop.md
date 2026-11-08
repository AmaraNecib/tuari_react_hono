## Employee creation via UI is impossible on develop (🟠 Major)

> STATUS: tied to #263 (workforce role keys), re-verify once it lands; the **Always** action is the durable part.

`employeesBatchCreate` validates roles with `requireAssignableEmployeeRole`, which only
accepts role keys worker/project_manager/warehouse_manager, but the RBAC consolidation
(Slice 3) removed those roles; only admin/manager/viewer are seeded and the create form
offers only those. Every role is rejected with "يمكن اختيار الأدوار النظامية فقط في هذه
المرحلة." The form also blocks submit on required salary-period + salary-amount fields
(native validation, invisible to Playwright). employees.spec.ts is skipped (#227) until
the workforce role rule is fixed.

**Always**: before writing an employee-create e2e, probe the batch-create RPC with each
seeded role; check for required fields that block the native form submit.

