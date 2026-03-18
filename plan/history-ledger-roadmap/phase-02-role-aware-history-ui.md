# Phase 02 - Role-Aware History UI

## Goal

Show the right current information and history for each employee role while keeping the UI easy to scan.

## Scope

- polish inactive tabs/buttons/cards so unselected state stays white in light mode
- keep selected states blue and obvious
- make employee detail pages role-aware:
  - worker: current manager + current workplace
  - project manager: managed projects now
  - warehouse manager: managed warehouses now
- use URL-persisted tabs on detail pages
- replace fragmented history cards with a unified history table ordered newest to oldest
- keep rows compact and readable with at most one or two rows per event when possible

## Deliverables

- clickable tab URLs that survive refresh
- unified work history table for employee detail pages
- project and warehouse details visually aligned with employee details
- no irrelevant current-manager/current-project fields for manager roles

## Dependency

Needs Phase 01 history correctness so the UI does not present wrong manager/project/warehouse periods.
