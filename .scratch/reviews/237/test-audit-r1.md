# Issue 237 test audit, round 1

Reviewed code boundary: 55a1785d735a6fb19d4a1217215391ca9b50e61e. Later parent test additions are described below, not represented as independently re-reviewed.
Reviewers: three separate GPT-6 Luna sessions, read-only.
independence: { approvedBy: "owner", reason: "Standing owner approval: OpenCode unavailable; same-family separate-session review" }

## Edge cases

Missing session gating, user isolation, and filter reset coverage. Parent added tests for unresolved and absent session, delayed u2 response with u1 content absent, distinct cache contents, and domain/action reset to All. See edge-cases-r1.md for the original findings and resolution.

## Coverage

No blocking coverage gaps for acceptance criteria. Rendered-page tests exercise enum filters, inclusive dates, search and CSV. Manual invalidation refreshes displayed content. Shared-cache test checks one entry for matching filters. The observer and page already independently construct their empty filter objects. User isolation was identified as a lower-priority gap and is now explicitly tested. Existing shell tests cover translated labels. Mutation invalidation was not yet exercised end-to-end.

## Quality

Grade B. Isolated QueryClient instances, awaited UI changes, and meaningful filter/CSV/error assertions. P2: manual invalidateQueries proves refetch but not the mutation invalidation path. Requested a test invoking a relevant mutation.

## Parent resolution

Added an account update mutation integration test using the real useUpdateAccountSettingsMutation and shared query. Only the profile transport and toast boundary are mocked. Seeded the mounted session cache key with u1, changed the mocked log response after successful profile transport, clicked the mutation trigger, and verified refreshed audit content and exactly two log requests. No production mutation code was changed. All nine audit tests pass. Later code-review must inspect these test additions as well as production code.

No actionable test-audit finding remains after the added tests. No new runtime defect is claimed from coverage-only additions. Greptile is still blocked by expired authentication; no external verdict is claimed.
