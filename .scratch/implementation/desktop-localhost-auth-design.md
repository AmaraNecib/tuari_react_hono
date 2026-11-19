# Desktop auth detection on the localhost dev URL

## Pinned state

- Worktree: `D:/worktrees/tuari_react_hono/t3-d5a68276-97285353df356c66`
- Base and starting HEAD: `4ec4cf23fcda50e143d85d241a2b23522e1e96b0`
- Earlier local launcher commits: `27cabea7d0cd38d08565959f1ce9b381e7a9d978` and test-audit correction `4ec4cf23fcda50e143d85d241a2b23522e1e96b0`.
- Verification mode: `focused-local / CI-final-enforced`, supplied by parent.
- Review tier: high-assurance, because this detector chooses auth and session transport.
- The owner has the desktop app open. They were warned that frontend edits may reach it through Vite HMR. No app stop, login attempt, database reset or browser automation is authorized here.
- Existing dirty `apps/desktop/src-tauri/Cargo.toml` and generated schema files are preserved and excluded.

## Diagnosis

Ranked hypotheses:

1. The runtime detector misclassifies the configured Tauri dev URL. `tauri.conf.json` loads `http://localhost:1420`, while `isDesktopRuntime()` only recognized `tauri.localhost` and `tauri:`. This predicts localhost with Tauri's marker takes the browser branch for sign-in and session requests.
2. Correct credentials may still fail after transport selection because the native bridge or session state has another defect. Passing local selection tests cannot prove a live login.
3. The official Tauri marker may be missing in the development webview. Installed sources contradict this: `@tauri-apps/api@2.10.1` exports `isTauri()` which reads `globalThis.isTauri`; Tauri `2.10.3` injects `window.isTauri = true` in its webview initialization script.

The focused red test on `http://localhost:1420` returned `false` despite `isTauri=true`. The sign-in mutation then called the browser auth client; the native error assertion instead saw an undefined browser result. The oRPC credential test returned `include`, not the desktop-required `omit`. These are the predicted branch-selection failures. The owner also observed the browser POST to `127.0.0.1:4318` and an oRPC `AbortError`; this is consistent with a browser session transport in a Tauri webview, but does not prove the valid-password request reaches the native bridge after the fix.

## Decision and boundary

Use the installed public `isTauri()` helper from `@tauri-apps/api/core`. Do not infer Tauri from a loosened localhost hostname rule, and do not probe private `__TAURI_INTERNALS__`. This keeps ordinary browser localhost in browser mode while recognizing Tauri's dev and production webviews from their runtime-provided marker.

`isDesktopRuntime()` is the shared classifier used by the phone sign-in mutation, auth bridge, desktop API bridge and oRPC client. Keep this interface and correct its implementation. Tests cross the real detector from dev localhost and exercise the sign-in/credential callers. Keep invalid credentials rejected and translated; no auth rules, cookie security, token storage, Rust IPC, schema or database behavior changes.

Applied lessons: `process/testing-a-never-typed-defensive-branch-and-an-auth-plugin-validator` is not directly applicable because this change concerns frontend runtime selection, not the auth plugin validator. The general red-first testing guidance is applied at the detector and real caller seams. No matching security or desktop-auth lesson was found. No glossary term changed; `CONTEXT.md` remains untouched. Architecture: no interface or seam moved.

## Proof boundary

The regression tests must cover Tauri on `localhost:1420`, an ordinary browser on that exact URL, production Tauri detection, sign-in bridge selection, session cookie policy and invalid-credentials rejection. Local evidence must not claim a full login. Full Tauri launch and credential exercise remain owner actions after the reviewed change is integrated.
