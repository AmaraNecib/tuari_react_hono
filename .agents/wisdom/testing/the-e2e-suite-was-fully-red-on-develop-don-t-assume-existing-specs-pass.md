## The e2e suite was fully red on develop: don't assume "existing" specs pass (🟠 Major)

> STATUS: historical incident (pre-#227). The **Always** action below is the durable part.

Before #227, no Playwright spec could get past login: the helper's
`getByLabel("كلمة المرور")` strict-violated (the PasswordInput show/hide button made
the field's accessible name "كلمة المرور إظهار كلمة المرور", and the button's
aria-label "إظهار كلمة المرور" also matched), and the post-login marker "مساحة العمل"
is never rendered (shell.workspace exists in i18n but no component uses it). The
onboarding tour (autoStart, storageKey home-tour) also blocks as a modal on first
visit. Fix: `getByRole("textbox", { name: /^كلمة المرور/ })`, wait for the dashboard
heading "لوحة التحكم", dismiss the tour via its "تخطي" button (try/catch, it may not
show). There was no test-e2e CI job, so nothing caught this.

**Always**: when adding or touching e2e specs, run the FULL suite locally (workers:1,
fresh DB per run). The target spec passing alone doesn't mean CI e2e is green.

