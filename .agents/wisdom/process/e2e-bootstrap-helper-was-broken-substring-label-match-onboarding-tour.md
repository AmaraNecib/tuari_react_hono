## E2E bootstrap helper was broken: substring label match + onboarding tour (🟠 Major)

`bootstrapOrSignIn` used `getByLabel("كلمة المرور")`. Playwright substring
matching hit both the password input AND the PasswordInput toggle button
(aria-label "إظهار كلمة المرور"). Then the first-run UserJourneyTour
(z-50 backdrop) intercepted clicks, and the post-login assertion
`getByText("مساحة العمل")` matched nothing (dead translation key). All
E2E specs failed at bootstrap until the helper was fixed: `exact: true`
on the label, `addInitScript` pre-seeding
`localStorage["journey-home-tour-status"] = "skipped"` (JourneyStateManager
keys are `journey-<key>-<type>`, NOT `tour-<key>`), and asserting the
sidebar "لوحة التحكم" link instead.

**Always**: when writing E2E specs in this repo, `getByLabel` on fields
whose label is a substring of a toggle's aria-label needs `{ exact: true }`;
pre-seed journey/localStorage state via `page.addInitScript` rather than
clicking through tours.

