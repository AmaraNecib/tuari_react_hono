# PR 556 web CI fixes

Base: `c377e9d8f64b7615a55bb92713cbec2aa4098f43` in `D:/worktrees/tuari_react_hono/t3-df53c0d7-5b581780710198a9`. Verification mode: focused-local / CI-final-pending. Review tier: high assurance because this touches salary approval presentation and tests around money entry; production scope is limited to employee-name lookup for approved earnings.

The CI failures split into stale tests and one incomplete name map. Salary batch creation now sends an optional `salaryReference` rather than the retired amount/period fields. The employee detail and salary pages expose earning approval, while historical cash payments remain read-only. Their tests should assert the approved UI and keep independent checks for blank-submit no-write and old cash history rendering. Translation mocks must retain `initReactI18next`; the workspace fixture must supply the newly reached query hook.

The earnings history receives names from all derived employees, not only employees with a current salary reference. The salaried-worker table continues to use the filtered salary-reference list. The date test compares the selected day with the day displayed by the picker instead of assuming the 15th.

The module interface remains narrow: `SalariesSection` receives the full employee identity list separately from the filtered worker rows. This moves no other seam. Relevant vocabulary: salary reference is a current editable wage setting; approved earning is a frozen approval record; legacy salary payment is historical cash data. Applied lessons: `architecture/a-form-opens-with-the-sensible-default-already-filled-in.md` (do not turn an empty salary field into a guessed amount) and `testing/employee-creation-via-ui-is-impossible-on-develop.md` (exercise actual batch requirements and reject stale UI assumptions).

Proof scope: the four CI-failing app-shell tests, `debts-mvp-web.test.tsx`, and `employee-earnings-history.test.tsx` for the new identity mapping. No full suite, browser run, dependency change, publication, or CI acceptance claim.
