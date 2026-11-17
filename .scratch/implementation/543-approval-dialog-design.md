# Earned-wage approval composer

Base: `5c7f4e441d344dacb577cce7ceadfdc8388b3ded`; helper correction imported as `64ca4f102d00ade83bf0daf8032025d527214ea5`.

Verification mode: focused-local / CI-final-pending. High-assurance because this dialog writes exact-money approval payloads and persists retries after uncertain responses.

The existing `AddSalaryPaymentDialog` export remains at its current import path. Its new contract accepts `employeeId`, optional `employeeName`, optional string-valued `salaryReference`, `projects`, `open` and `onOpenChange`. Old numeric wage/period props, assignments and `initialDraft` are removed. Caller pages and tables are outside this change.

The dialog owns explicit inclusive Algeria-calendar start/end days, DZD total, unallocated amount and ordered stable-ID project rows. A project may appear more than once. Edits never alter another amount; only explicit add/remove changes rows. The shared draft helper validates and finalizes exact money. No prorating or per-row rounding is used; each row amount is the operator's explicit value.

Pending payloads use the authenticated session user's ID, employee ID and `resolveApiBaseUrl()` as the workspace identity. The app has one configured database per API endpoint; the normalized configured API base URL therefore identifies the current workspace. No auth material is stored. Pending payload and request ID remain unchanged after uncertain failures or close/reopen. Only a first-attempt `VALIDATION` or `NOT_FOUND` response, or a registered contract-validation `BAD_REQUEST`, proves no write and permits correcting the draft; any failure of an already-pending request keeps it frozen. Restored dates convert boundary instants back through the Algeria-local calendar formatter.

The production Dialog, field controls, DatePicker, RTL-compatible layout and mobile row breakpoints remain in use. DatePicker forwards field-error ARIA attributes to its trigger. Schema paths and `AppMutationError.fieldErrors` map to stable row IDs and form field names; unrecognized paths remain in the global error group. No caller page or table is in scope. Applied the identity-snapshot lesson by keying pending state to authenticated user, API endpoint and employee. The manual exact amounts avoid the old per-row rounding failure because this composer does not derive shares. Architecture: no seam moved; the dialog composes the existing draft and mutation modules.
