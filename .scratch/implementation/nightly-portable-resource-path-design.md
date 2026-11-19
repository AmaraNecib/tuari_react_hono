# Nightly portable resource path

Base: `a51df21ffd9aac51a27d5d35344da309df7d6c4a`, fresh origin/develop. Branch: `fix/nightly-portable-resource-path`. Worktree: `D:/worktrees/tuari_react_hono/t3-412838f5-c2c7983838174217`.

Nightly run 44441282956 built app.exe and the NSIS installer, then failed because portable:only expected target/release/bin. build-sidecar.mjs stages Node and the API runtime in src-tauri/bin, and tauri.conf.json declares those same resources. A clean runner has no target/release/bin.

Use that existing staging directory as the portable packager input. Keep app.exe and portable outputs under target/release. Do not add fallback paths, weaken validation, bypass encryption proof, or change signing, release policy, runtime resolution or dependencies. Existing SQLCipher proof still runs against the copied portable candidate before replacing previous outputs.

The agreed packaging seam is the portable:only CLI. Its filesystem fixture now reproduces the actual producer layout instead of inventing target/release/bin. Existing success, failed proof, missing encrypted dependency and real plaintext binding/loader cases must still hold. Changing the fixture first produced five failures with the hosted missing-bin diagnostic. After the path correction, all five packaging cases pass.

Risk tier: High-assurance due to release packaging and encrypted runtime delivery. Owner explicitly narrowed review for this task to Greptile, with optional light local inspection instead of three local sessions. Parent performed that light inspection against build-sidecar.mjs, tauri.conf.json, candidate validation and proof ordering. Current-head Greptile 5/5 and CI acceptance remain merge gates. Mode: focused-local / CI-final-enforced, active ruleset26837184 inspected with strict required acceptance and no bypass.

Architecture: no seam moved. The portable module remains the adapter from built executable and staged bundle resources to a verified archive. No domain vocabulary or model changes. No useful new abstraction is needed for one corrected path. Desktop wisdom about environment isolation and Windows resource prefixes is unchanged and outside this path fix.

Focused proof: node --test apps/desktop/scripts/build-portable.test.mjs apps/desktop/scripts/script-security-utils.test.mjs. Result14passed,0failed,1skipped because this Windows account cannot create file symlinks. The real plaintext rejection cases passed. Node syntax checks and git diff --check passed. Full native build and installer smoke remain remote Nightly proof after gated merge. Unrelated synthetic backups remain untracked.
