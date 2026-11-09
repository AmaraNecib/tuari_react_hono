## E2E port contention across parallel worktrees (🟡 Minor)

`playwright.config.ts` uses fixed ports 3000/4318 with `reuseExistingServer: false`;
parallel worktrees run `pnpm dev` servers that grab the ports (seen from
issue-275/issue-284 worktrees), so `npx playwright test` dies with EADDRINUSE
before starting. `netstat -ano | grep "127.0.0.1:3000 "` → `taskkill //PID <pid> //F`
clears it, but another worktree can re-grab the port between kill and run. Kill
and run in ONE command. Also `playwright-report/index.html` is tracked: E2E runs
modify it: `git checkout -- playwright-report/index.html` before committing.

