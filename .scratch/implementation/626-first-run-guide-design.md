# Issue #626: remove first-run tour interception

- Base: `d9510a7ec43986d825139b72d04ecf70253322d6`.
- Verification mode: focused-local / CI-final-enforced, supplied by the coordinator.
- Spec: owner-supplied issue body says a new profile enters the ordinary workspace without a tour, click-through, focus capture, or dismissal; preserve user-invoked help and setup/permission/safety prompts; verify fresh and existing profiles without changing user data.
- Risk: mounted signed-in app shell enables a persisted modal tour that intercepts normal use. Existing `useUserJourney` and `UserJourneyTour` support explicit activation and persisted state; this change removes only the shell's automatic activation.
- Test seam: mounted `HomeView` shell. The regression mounts a fresh signed-in profile, waits past the 500ms auto-start delay, checks workspace navigation, dialog absence and no persisted tour status, then remounts and repeats.
- Review tier: elevated runtime/UI behavior; three initial lenses required.
- Docs audit: onboarding tour references found in `tests/e2e/dialogs-a11y.spec.ts` and session helpers. The dialog tests exercise explicitly persisted active status; helper dismissal workarounds and first-run wording require follow-up audit before handoff.
