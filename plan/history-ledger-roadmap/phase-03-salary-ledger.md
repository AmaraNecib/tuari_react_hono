# Phase 03 - Salary Ledger

## Goal

Separate salary setup from salary payment tracking.

## Scope

- keep employee salary amount + salary period as the current salary snapshot
- add a separate salary payment table to record what was actually paid
- default expected amount from the employee current salary
- allow admin to override the actual paid amount and add a note
- show finance summary + newest-to-oldest salary payment table in the employee finance tab
- prepare the model so debts/advances/deductions can be added later without redesigning everything

## Deliverables

- dedicated salary payment persistence
- finance tab payment form and table
- payment history visible in employee detail view
- backend validation so salary payment records stay trustworthy

## Dependency

Best after Phase 01, because salary changes and salary payments should be attributable to an actor.
