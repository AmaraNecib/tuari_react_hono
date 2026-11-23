---
name: improve-codebase-architecture
description: "Assess friction in changed modules and their direct callers after a clean review; explore broader architecture only when explicitly requested."
---

# Improve codebase architecture

Read `codebase-design`, `CONTEXT.md` and relevant ADRs.
The parent uses this after a clean local review when a module, interface,
adapter or seam changed. No seam moved means a one-line outcome, not a scan.

## Scope

Inspect the changed modules and direct callers. Ask whether the interface
hides meaningful complexity, the deletion test concentrates knowledge, the
seam has real adapters, and a domain rule was duplicated. Keep vocabulary
consistent with the domain model.

At most five candidates. Each names its files, concrete friction, smallest
change and deletion-test verdict. Fix a cause of an existing defect in scope;
do not turn a correctness fix into a broad consolidation project.

A specialist is justified only by a concrete unanswered question and explicit
delegation authority. No default exploratory child, whole-tree sweep or
browser run. A periodic whole-codebase review is separate owner-requested work.

## Outcome

Record exact source SHA and the scoped outcome locally under ignored
`.scratch/reviews/`. Do not commit or post the report. No findings is a valid
recorded outcome. A second pass is needed only if an architecture correction
changed source, and is limited to that correction.

Use `HTML-REPORT.md` only when the owner asks for a visual architecture
exploration. Do not open a browser or publish a report automatically.
