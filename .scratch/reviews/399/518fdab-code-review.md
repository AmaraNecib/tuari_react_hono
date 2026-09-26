# #399 code review — `<sha>` `518fdab`

- **Reviewed HEAD:** `518fdab` (branch `fix/shell-license-status`, worktree `fix-shell-license-status`)
- **Base:** `17911dc` (`origin/develop`)
- **Ticket:** #399 — "Desktop shell: emit an explicit license status when
  LicenseManager init fails (instead of omitting the env block)"
- **Tier:** High-assurance (licensing). In-lane: code-review + test-audit +
  adversarial self-review. Independent debate is for the parent to schedule;
  see "Tier note".

## Scope of the diff

```
apps/desktop/src-tauri/src/lib.rs        | 171 ++++++++++++++++++++++++++++--
apps/desktop/src-tauri/src/license.rs    |   9 +
docs/licensing-architecture.md           |  19 ++--
.scratch/implementation/399-design.md    |  87 +++++
```

No API change. `apps/api/src/infrastructure/license.ts` is untouched.

## Spec axis — #399 acceptance criteria

| AC | Verdict | Evidence |
| --- | --- | --- |
| clock inconsistency → `TUARI_LICENSE_STATUS=suspicious` | PASS | `license_status_for_error` matches `ClockTampered => "suspicious"`; test `maps_every_initialize_failure_to_an_explicit_license_status` |
| malformed/invalid `license.lic` or IO failure → `unknown` | PASS | `_ => "unknown"`; test covers `InvalidFormat`, `InvalidPayload`, `InvalidSignature`, `IoError` |
| emit an explicit value, not an omitted variable | PASS | `license_failure_env_map` always inserts the key; test `failed_init_env_map_contains_an_explicit_status_not_an_omitted_block` |
| keep the API fail-closed default as defence in depth | PASS | API untouched; docs §15.5 updated to say so |
| keep "no license, inside trial window" on `trial` | PASS | `to_env_map` success branch untouched; new test `to_env_map_reports_trial_for_no_license_inside_the_trial_window` |

## Standards axis

- Follows the existing module style: private pure helpers near
  `spawn_api_process`, `HashMap<String, String>` matching `to_env_map`'s
  signature, doc comments naming the contract (`LICENSE_STATUSES`).
- The env-block defaults are copied from `getLicenseInfo`'s actual defaults
  (`standard`, `""`, `0`, absent customer → `null`, `expiresAt || null`), not
  invented: verified line-by-line against `apps/api/src/infrastructure/license.ts`.
- No new dependency, no new public API, no `unwrap`/`expect` on the failure
  path. `clippy -D warnings` clean.
- Existing `if let Ok(manager)` became a `match` so the `Err` branch cannot be
  silently dropped again. `APP_DB_KEY` is intentionally NOT set on failure.

## Adversarial self-review (critic pass)

- **Does mapping everything-but-clock to `unknown` lose information?** No — the
  API only has one refusal message for "verification failed"; the specific
  error is already surfaced in the desktop `get_license_status` command. The
  status contract (`LICENSE_STATUSES`) has no finer value that the API would
  act on differently.
- **Could a bad signature be a genuine tamper that deserves `suspicious`?**
  `suspicious` is documented and messaged as a *clock* problem
  (`apps/api/src/infrastructure/license.ts`: "تم اكتشاف تغيير في ساعة النظام").
  Mapping a corrupt file there would send the customer to the wrong fix.
  `unknown` is correct.
- **Can the failure path accidentally grant `APP_DB_KEY`?** No — it sets no
  `APP_DB_KEY` at all.
- **Does the trial path regress?** `to_env_map` is unchanged and now has an
  explicit regression test.
- **Residual gap (out of scope):** if `resolve_tuari_dir(app)` fails, neither
  branch runs and no status is set. That failure predates #399, is a shell
  path-resolution failure rather than a license-verification failure, and the
  API still fails closed to `unknown`. Noted, not fixed.

## Verification (run on `518fdab`)

| Command | Result |
| --- | --- |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib` | 128 passed, 0 failed |
| `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --lib -- -D warnings` | clean |
| `pnpm --filter @tuari/api test` | 72 files, 1312 passed, 1 skipped |
| rustfmt on new code | new hunks clean (repo is not globally rustfmt-clean) |

## Tier note

The guard classifies licensing as High-assurance, which normally adds an
independent `debate`. The lane brief scoped this to the standard local gates +
the three verify commands above; the adversarial pass here is a self-review,
not two independent agents. Flagged for the parent: if the parent wants a
true independent debate artifact before merge, hold the lane and request it.
