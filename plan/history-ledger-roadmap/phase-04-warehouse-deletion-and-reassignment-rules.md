# Phase 04 - Warehouse Deletion And Reassignment Rules

## Goal

Make warehouse lifecycle and reassignment behavior safe and predictable.

## Scope

- allow warehouse deletion only when operational links make it safe
- block deletion when active manager or worker relations still require the warehouse to exist
- on project manager change, move active workers under the new manager when the business rule says they follow the project manager
- keep history of these changes so the employee and warehouse views remain accurate

## Deliverables

- explicit warehouse deletion rules
- explicit project manager reassignment propagation rules
- tests for linked worker reassignment and warehouse deletion safety

## Dependency

Needs Phase 01 to make sure manager/warehouse history stays correct when reassignment happens.
