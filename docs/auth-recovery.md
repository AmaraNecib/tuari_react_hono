# Auth Recovery — legacy whitespace-only passwords (#230 → #321)

Scope: regaining access to a workspace when the account's password was created
before the visible-character password policy landed (#230). This affects
accounts bootstrapped with an all-invisible password (e.g. 8 spaces) before the
policy was enforced — a window that only existed between bootstrap and #230.

## Background

#230 rejects all-invisible passwords (whitespace, format/control chars, …) when
a credential is **created** (bootstrap, change-password). The stored hash of a
pre-#230 account is untouched, but sign-in was blocked client-side because the
sign-in form validated against the same policy schema — leaving the account with
no escape hatch.

#321 fixes this by making **sign-in verification-only**: the sign-in schema no
longer carries the visible-character refine, so an all-invisible input is
accepted and verified against the stored hash. It can only match a hash that was
itself created from that exact value (impossible for accounts bootstrapped after
#230, which still reject all-invisible passwords). The policy for **new**
inputs at bootstrap is unchanged; the Settings change-password path is
gated exactly as it was before (client-side trim + length only — see the
known-gap note below).

## Supported recovery paths

### 1. Sign in with the legacy password, then rotate it (preferred)

A user whose password predates #230 can still sign in with it:

1. On the sign-in screen, enter the account phone number and the **original
   (all-invisible) password** — it is no longer blocked by the form.
2. Once signed in, go to **Settings → Account**, enter the legacy password as
   the current password and a new, policy-compliant password, then save.

The current-password field is deliberately not trimmed: the password is verified
against the stored hash exactly as typed (see `settings-section.tsx` /
`useUpdateAccountSettingsMutation`).

### 2. Last resort — wipe and re-bootstrap the workspace

If the legacy password is unknown or the account is otherwise unrecoverable:

1. Stop the app (including the API server).
2. Delete the workspace database: `apps/api/data/*.sqlite*` (the SQLite file
   plus its `-wal`/`-shm` sidecars).
3. Restart the app — it shows the first-run bootstrap screen and a fresh
   workspace can be created.

This destroys all workspace data and is only a recovery of last resort.

## Notes

- The sign-in schema still enforces length bounds (8–128) and the phone format;
  only the visible-character rule was relaxed for **verification**.
- Known gap (pre-existing, NOT introduced by #321): the change-password path is
  not schema-gated — the new-password field is checked client-side only (trim +
  8–128 length) and better-auth's route validates any string, so a
  format-character-only (e.g. ZWSP) new password can still be set. Since #321
  made sign-in verification-only, such a hash becomes usable at sign-in;
  recommended as a follow-up issue (a change-password policy gate).
- OTP-based reset and admin-assisted resets are intentionally not implemented:
  OTP delivery requires an external provider (#283), and a reset that bypasses
  the current password would be an account-takeover primitive on a loopback API.
