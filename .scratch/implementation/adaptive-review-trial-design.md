# Adaptive-review trial policy patch

Status: owner adoption recorded. The owner explicitly directed the parent to apply the global instruction alignment after the reviewed trial implementation. Global and project alignment are part of this bounded adoption delta. Routing may use the exception only after this delta is reviewed and its instructions are loaded; no additional owner consent is required. Publication and merge remain separate gates.

## Decision

Add one concise proposal section to `docs/engineering-workflow.md`. Keep the existing policy requirements as the governing behavior. In particular, shadow mode is observation only, while future explicitly owner-approved activation could select up to eight eligible routine tasks for one code-review session. Elevated tasks retain three distinct initial lenses in their existing order. No check, review, protection, publication, independence, or owner-decision gate changes.

Eligibility is recorded before review outcomes, against the complete changed-file scope and the task's contract, callers, consequences, uncertainty and reversibility. Start with narrow factual corrections directly checked against source. Broad material removals, accepted-source conflicts, and consequential test weakening without demonstrated equivalent failure detection are excluded. Reassess and escalate when evidence or scope changes.

Record reviewer and parent active and elapsed time, executions, unique confirmed defects, duplicates, false positives, later misses and observed cost. Unknown stays unknown. Compare only comparable historical evidence and disclose sample limits. Pause after consequential misclassification, escaped consequential defect or unusable evidence. Owner chooses adoption, revision or retirement; rollback restores prior routing for future work and preserves evidence and current-head checks.

## Activation delta and approval

The parent supplied owner authorization to implement the bounded trial after the owner said, "ok u can do that" to the described plan of up to eight new routine tasks, with tests, CI, hosted review and merge safeguards retained. This authorizes drafting and reviewing the policy, not publication, merge or bypass of higher-priority instructions.

The patch replaces the inactive proposal with explicit routing conditions and updates the workflow pointers in `AGENTS.md`, `feature-implement` and `guard`. Those three-lens instructions remain binding until this patch is reviewed and the higher-priority instructions are aligned through their own review. Therefore this patch alone does not activate reduced review depth.

The trial cap counts eligible cases escalated back to three lenses. It excludes prior/synthetic cases and cannot be filled with manufactured work. Selection, complete changed-file manifest and per-file disposition are recorded before outcomes. Eligible work gets one combined review covering standards, spec and applicable proof. Elevated risks and broad or conflicted documentation remain excluded. No local numeric score or change to elevated scheduling is introduced. Existing evidence, CI, hosted, protection, independence, finding-resolution, reliability and owner-only gates remain intact. Missing cost remains unknown.

## Scope and proof

Initial proposal base: `f94af99e1dee404e704d44c4d5d67d161a9a5efe`. Routing implementation base: `7f787e9ea04724e789ef593ca827c053795902a8`.
Verification mode: focused-local / CI-final-enforced. CI acceptance and effective protection remain separate; this local patch makes no claim about a current PR's checks.

Changed-file dispositions for the routing implementation:

- `docs/engineering-workflow.md`: authoritative bounded trial conditions, explicit owner adoption and retained risk exclusions.
- `AGENTS.md`: pointer to the workflow; preserves binding routing until all prerequisites are met.
- `.agents/skills/feature-implement/SKILL.md`: follows the same conditional workflow route without adding policy authority.
- `.agents/skills/guard/SKILL.md`: checks the same adoption and higher-priority boundaries.
- `.scratch/implementation/adaptive-review-trial-design.md`: design, approval boundary and full scope record.

No application, tests, CI, configuration, tracker, global-instruction or third-party skill changes. Current routing remains unchanged.

Required policy review remains parent-owned because the document has elevated governance risk. The implementation agent does not run the three initial lenses and does not claim final approval. Focused policy test, applicable prose/link/source checks and `git diff --check` are required before commit. Evidence is local and ignored under `.scratch/reviews/`.
