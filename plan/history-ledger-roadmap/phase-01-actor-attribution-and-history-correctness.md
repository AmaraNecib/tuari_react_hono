# Phase 01 - Actor Attribution And History Correctness

## Goal

Make all employee/project/warehouse history trustworthy before adding more UI around it.

## Scope

- attach actor account identity to mutating operations
- add transaction/correlation id support for grouped changes
- fix project manager ownership history so manager changes always close/open exact periods
- fix warehouse manager ownership history the same way
- ensure employee state history clearly tracks role/status/salary changes over time
- ensure reassignment flows remain atomic and leave a reliable historical trail

## Deliverables

- actor metadata captured from authenticated admin account
- canonical history rows for:
  - employee state
  - worker manager assignment
  - worker workplace assignment
  - project manager ownership
  - warehouse manager ownership
- backend tests for reopen/reassign/resume scenarios

## Why First

Without this phase, later history tables and `السجل` screens will display incomplete or misleading information.
