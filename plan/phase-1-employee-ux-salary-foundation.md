# Phase 1 - Employee UX And Salary Foundation

## Goal

Make employee management feel production-ready before expanding more domains.

## Principles

- Use shared form controls everywhere instead of ad-hoc input/select styling.
- Keep forms denser and more structured on desktop and tablet.
- Hide fields that do not apply to the currently selected role.
- Keep one clear primary save action per page whenever possible.
- Keep server rules authoritative for leave/delete/assignment behavior.
- Treat salary as HR data and keep it out of crowded list views.

## Milestones

### Milestone 1 - Form System And Action Clarity

- Unify input, select, textarea, and currency styles.
- Rework employee edit page into clear sections:
  - personal info
  - work info
  - salary info
- Restore clearer white/blue action styling.
- Add tooltip explanations for disabled leave/delete actions.
- Hide role creation affordances from the current UI.

### Milestone 2 - Salary Domain Foundation

- Add employee salary amount in DZD.
- Add employee salary period using seeded system values only:
  - DAILY
  - WEEKLY
  - MONTHLY
- Keep salary type/rate-mode internal for now and do not expose a management page yet.
- Present salary nicely in Arabic using `دج` with the currency label visually on the left side of the numeric amount.

### Milestone 3 - Role-Aware Work Assignment UX

- Worker:
  - choose project manager
  - choose one project from that manager's projects
- Project manager:
  - choose one or more managed projects
- Warehouse manager:
  - choose one or more managed warehouses
- Never show irrelevant workplace fields for a role that does not need them.

### Milestone 4 - Warehouse Safety Rules

- Allow warehouse deletion only when domain rules say it is safe.
- Block deletion when active manager/worker assignments still make the warehouse operationally in use.
- Leave future inventory/material checks for later phases, but keep extension points ready.

## Phase 1 Scope Now

Current implementation work starts with Milestone 1 and the salary foundation needed by the employee form.

## Review Gates

- Frontend review for layout, density, and visual consistency.
- Backend review for salary and warehouse domain rules.
- Security review for salary exposure and admin-only mutation safety.
- QA review for routed pages, role-based field visibility, and disabled-action explanations.
