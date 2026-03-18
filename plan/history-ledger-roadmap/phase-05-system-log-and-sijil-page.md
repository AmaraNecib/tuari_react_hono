# Phase 05 - System Log And `السجل`

## Goal

Expose a general transaction log for admins so they can see who changed what and when.

## Scope

- add an append-only system log table
- record actor account, action, target entity, timestamp, and grouped transaction id
- support Arabic-friendly presentation for updates, transfers, salary actions, deletes, assignments, and status changes
- show grouped changes in one row when they belong to the same user action where possible
- add a dedicated `السجل` page reachable from the workspace navigation/dashboard

## Deliverables

- append-only system log storage
- grouped readable `السجل` UI
- filters by entity, actor account, date, and action type

## Dependency

Needs Phase 01 actor attribution and corrected history first, then can layer on top of it safely.
