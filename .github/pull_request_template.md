# Pull Request

## Scope Statement

<!-- One paragraph: what does this PR deliver? -->

## Phase & Type

- [ ] Agent branch (implementation work for a single phase)
- [ ] Integration branch (merging multiple agent branches)
- [ ] Hotfix (urgent repair after integration validation)

**Phase:** Phase [0/1/2/3/4/5]

## Affected Surfaces

<!-- Which parts of the codebase change? List files or areas -->
- API
- Web frontend
- Desktop/Tauri
- Database schema
- Configuration/workflow

## Files Changed

<!-- Major files or directories affected -->

## Test Coverage

<!-- What testing was added or updated? -->

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing completed (describe below)

**Test results:**
```
npm test passes
npm run typecheck passes
npm run lint passes
```

## Verification Commands

<!-- Which commands did you run locally? Paste output or confirm pass -->

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build (if applicable)
```

**All passing:** Yes / No (if no, describe blocker below)

## Known Risks & Follow-ups

<!-- What could go wrong? What's deferred? -->

- Risky decisions:
- Deferred items:
- Cross-cutting concerns (auth, schema, contracts):
- Manual verification needed:

## Integration Notes (For Integration Branches Only)

<!-- If merging multiple agent branches, call out conflicts, intentional omissions -->

- Branches merged:
- Conflicts resolved: Yes / No
- Regressions fixed: Yes / No
- Unresolved blockers: None / [list]

## Checklist

- [ ] Branch naming follows rules (`agent/phaseN-*` or `integration/phaseN-*`)
- [ ] Scope matches declared phase
- [ ] Verification checklist from `.claude/branch-verification-checklist.md` completed
- [ ] No sensitive files committed
- [ ] All tests passing
- [ ] PR template sections filled in
- [ ] Known risks documented
