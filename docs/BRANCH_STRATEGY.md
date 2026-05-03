# Tuari Branch Strategy & Delivery Phases

This document defines how work flows from isolated agent branches into stable integration branches without mixing product work, workflow assets, and release preparation.

## Overview

Multi-agent delivery requires:
1. **Isolated work** on single-phase, single-feature branches
2. **Clear contracts** so branches don't conflict
3. **Validation at each stage** before integration
4. **Review discipline** with a consistent checklist

See also: `plans/tuari-multi-agent-delivery-plan.md` for the full delivery roadmap.

---

## Branch Naming Rules

All branches must follow these patterns:

| Branch Type | Pattern | Example | Purpose |
| --- | --- | --- | --- |
| Agent (implementation) | `agent/phaseN-short-description` | `agent/phase2-api-contracts` | Single agent implementing one phase milestone |
| Integration | `integration/phaseN-short-description` | `integration/phase2-contracts` | Merges multiple agent branches for a phase |
| Hotfix | `hotfix/short-description` | `hotfix/auth-token-leak` | Urgent repair only after integration is validated |

**Rules:**
- `phaseN` must match the active milestone (see Phase Roadmap below)
- Description in kebab-case, max 30 chars
- No underscores, double-hyphens, or random IDs
- Hotfixes only for production blockers after integration succeeds

---

## Phase Roadmap

### Phase 0: Repository Unblock
**Goal:** Fix infrastructure blockers so other phases can proceed safely.

**Deliverables:**
- Fix `apps/web` gitlink/index issue (if needed)
- Confirm web workspace tracking
- Repo sanity check (status, install, typecheck, build)

**Exit Criteria:**
- Core worktree opens cleanly
- `npm install && npm run typecheck` succeeds
- Web files can be committed from parent repo normally

---

### Phase 1: Delivery Foundations
**Goal:** Add workflow, process, and validation assets.

**Deliverables:**
- Branch verification checklist
- PR templates (agent + integration)
- Branch naming rules & phase docs
- Lightweight automated validation

**Exit Criteria:**
- Plan in `plans/`
- Checklist in `.claude/`
- PR template in `.github/`
- Docs in `docs/`
- CI validates workflow assets

**Non-Goals:**
- No feature delivery
- No UI/runtime changes
- No infrastructure rollout beyond workflow validation

---

### Phase 2: Shared Contracts and API Core
**Goal:** Stabilize shared contracts before downstream work depends.

**Deliverables:**
- API-side architectural fixes
- Service/repository coverage
- Integration tests for contracts
- Shared Zod schemas or type definitions

**Exit Criteria:**
- Typecheck passes for API and shared contracts
- Integration tests pass
- No breaking changes to consumed contracts
- Downstream (Phase 3) can pull these without conflicts

---

### Phase 3: Web App Improvements
**Goal:** Apply reviewed web structure and UI improvements.

**Deliverables:**
- Feature components and pages
- Unit/integration coverage for feature logic
- E2E coverage for critical paths
- Responsive design fixes (if applicable)

**Exit Criteria:**
- Web typecheck passes
- Feature tests passing
- No regressions in existing features
- Manual QA on golden paths

**Depends On:** Phase 0, Phase 2

---

### Phase 4: Desktop Runtime and Packaging
**Goal:** Implement Tauri, runtime, and packaging after API/web stabilize.

**Deliverables:**
- Tauri configuration
- Runtime commands and sidecar integration
- Path and logging improvements
- Packaging configuration

**Exit Criteria:**
- Desktop app builds and runs
- Startup health checks pass
- Portable behavior verified
- Integration with web and API validated

**Depends On:** Phase 0, Phase 2, Phase 3

---

### Phase 5: Integration and Release Readiness
**Goal:** Validate the entire system before shipping.

**Deliverables:**
- Integrated typecheck, build, test
- E2E verification across all surfaces
- Cross-branch regression fixes
- Release PR with summary and risk notes

**Exit Criteria:**
- All phases merged to integration branch
- Integrated build and tests pass
- Manual verification complete
- Release notes drafted
- Ready for final merge to main

---

## Working Agreement for Agent Branches

Every agent branch should:

1. **Target exactly one phase milestone**
   - Don't mix Phase 2 API work with Phase 3 web work
   - Keep scope narrow enough for one PR review

2. **Keep narrow scope**
   - One feature, one fix, one surface
   - Should fit in a single PR review session

3. **Add verification commands**
   - Document local test commands you ran
   - Include output in PR or checklist
   - If behavior changes, add verification

4. **Leave a review trail**
   - Use the PR template
   - State files changed, validation run, follow-ups
   - Document risky decisions or deferred items

### Minimum Checklist for Every Branch

- [ ] Scope statement and dependency statement
- [ ] Files or surfaces changed
- [ ] Tests added or updated
- [ ] Local verification commands run and passing
- [ ] Known risks, follow-ups, or deferred items
- [ ] Branch naming matches rules
- [ ] PR template sections filled in

See `.claude/branch-verification-checklist.md` for the full checklist.

---

## Parallel and Sequential Work

### When Parallel Work is Allowed

Branches can merge independently if:
- Branches touch different surfaces (API/web/desktop)
- No shared contract or schema dependency
- Both branches only consume already-merged interfaces
- Integration branch can absorb both without ambiguity
- One branch doesn't need unpublished changes from another

**Example:** Phase 2 API branch and Phase 3 web branch can run parallel after Phase 2 APIs are merged (not before).

### When Work Must Stay Sequential

Stay sequential if:
- A branch changes shared contracts, Prisma schema, auth/session, or build inputs
- Downstream work depends on new APIs, routes, or runtime commands not yet merged
- Multiple branches would edit the same feature area
- Repository blocker state makes branch validation unreliable

**Recommended Sequencing:**
1. **Contracts & repo fixes** (Phase 0, Phase 2)
2. **API & core behavior** (Phase 2)
3. **Web & desktop consumers** (Phase 3, Phase 4)
4. **Packaging & release** (Phase 5)

---

## Integration Branch Expectations

Create an integration branch when **multiple agent branches** for the same phase need to merge together before the final release.

### Integration Branch Responsibilities

1. **Merge only phase-matched agent branches**
   - Don't mix Phase 2 and Phase 3 into one integration branch
   - One integration branch per phase, if needed

2. **Rerun shared validation suite**
   - Full typecheck, build, test
   - Plus branch-specific checks

3. **Record conflicts, omissions, rollbacks in the PR**
   - Document what was merged and how
   - Call out intentional decisions

### Integration Branch Exit Criteria

- [ ] Merged branches conflict-resolved
- [ ] Integrated typecheck and build succeed
- [ ] Integrated unit, integration, and E2E pass
- [ ] Manual verification complete (desktop flows if Phase 4+)
- [ ] Blockers and follow-ups documented

---

## Definition of Done for Any Phase Branch

A branch is ready for review when:

- [ ] **Naming matches rules** (`agent/phaseN-*` or `integration/phaseN-*`)
- [ ] **Scope matches declared phase** (one phase, one surface)
- [ ] **Validation commands documented and passing**
- [ ] **PR template sections filled in** (not blank placeholders)
- [ ] **Follow-up work called out** instead of hidden in review comments
- [ ] **No sensitive files committed** (.env, secrets, credentials)
- [ ] **Branch verified against checklist** (`.claude/branch-verification-checklist.md`)

---

## PR Review and Merge Flow

1. **Agent branch**
   - Implementation work on one milestone
   - Code review within the team
   - All tests and verification passing
   - PR template filled in

2. **Approve and merge to integration branch** (or main if no integration branch)
   - PR approval required
   - CI/CD validation passes
   - No merge conflicts unresolved

3. **Integration branch** (if consolidating multiple agents)
   - Merge approved agent branches
   - Rerun full validation suite
   - Document any conflicts or trade-offs

4. **Final PR to main**
   - One PR from integration branch (or last agent branch) to main
   - Concise release summary
   - Risk notes and verification results
   - Approval required before merge

---

## References

- Delivery plan: `plans/tuari-multi-agent-delivery-plan.md`
- Feature delivery: `plans/007-phase-1-3-feature-delivery.md`
- Checklist: `.claude/branch-verification-checklist.md`
- PR template: `.github/pull_request_template.md`
