# History And Ledger Roadmap

This roadmap groups the remaining incomplete work and the latest requested changes into phased implementation steps.

## Goals

- preserve exact work history for workers, project managers, and warehouse managers
- record who did each important mutation in the system
- introduce a real salary payment ledger separate from employee state snapshots
- keep UI states, cards, tabs, and tables consistent and extendable
- prepare the codebase for future debt, material, and inventory domains without rewriting the foundation

## Phase Order

1. `phase-01-actor-attribution-and-history-correctness.md`
2. `phase-02-role-aware-history-ui.md`
3. `phase-03-salary-ledger.md`
4. `phase-04-warehouse-deletion-and-reassignment-rules.md`
5. `phase-05-system-log-and-sijil-page.md`

## Current Notes

- Prisma schema is the source of truth and must stay ahead of all runtime/manual schema mirrors.
- Some history foundations are already in progress, but past records created before history tracking cannot always be reconstructed perfectly.
- The next implementation should start from Phase 1 so later phases can reuse actor attribution and corrected history rows.
