# Install and activate Tuari (customer guide)

This is the guide you hand a customer together with two files:

| File | Purpose |
| --- | --- |
| `tuari-<version>-stable-setup.exe` | Windows installer (NSIS). A local Tauri build names it `Tuari_<version>_x64-setup.exe`; the release uploads it as `tuari-<version>-stable-setup.exe`. |
| `customer-license.lic` | Their signed license (see `docs/license-issuance.md`) |

## Requirements

- Windows 10 or 11, 64-bit.
- ~300 MB free disk space.
- Internet access during the first install unless your build embeds the WebView2
  runtime (the default NSIS build downloads it if it is missing).

## 1. Install

1. Run the installer (`tuari-<version>-stable-setup.exe`).
2. Windows SmartScreen may warn that the publisher is unknown — the installer is
   not code-signed yet. Choose **More info → Run anyway**.
3. Follow the installer, then launch **Tuari** from the Start menu.

## 2. First run — create the administrator

The first launch asks you to create the administrator account (name, phone,
password). That account owns the workspace: it can create users, projects,
warehouses, items and invoices. There is no separate setup key on a fresh
install.

If the app does not offer account creation, a setup key was configured for that
build — ask the vendor for it.

## 3. Activate the license

The app runs for **30 days** without a license. During that period everything
works, and the License screen shows the days remaining.

1. Open **Settings → License**.
2. Open `customer-license.lic` in a text editor and copy its **entire** contents
   (one long line: `<payload>.<signature>`).
3. Paste it into the license field and activate.

The app verifies the signature offline and stores the license locally. You will
see the edition, the features and the expiry (perpetual licenses show no expiry).

**After the 30-day trial the app reports a locked license and stops serving
license-gated operations.** Be precise about the current scope of enforcement:
edition- and feature-gated operations are refused (`UPGRADE_REQUIRED`), an
expired license is refused, and the License screen shows the locked state — but
ordinary authenticated mutations are **not** blocked yet. Treat the trial as a
courtesy period, not as a technical lock: enforcement hardening (refusing
mutations while locked) is tracked separately.

Troubleshooting:

| Symptom | Cause |
| --- | --- |
| "invalid signature" | The license was edited, truncated, or issued for a different vendor key |
| "expired" | `--valid-until` has passed; renew the license |
| "clock tampering" | The system clock moved backwards, or it was previously set far forward and then corrected. Fix the clock, close the app, delete `clock-tracker.json` in the data directory, and start the app again (this resets the recorded time and clears the warning). |
| License accepted but features missing | The edition/features in the license do not include them |

## 4. Your data

The database, attachments and `clock-tracker.json` live in the app's data
directory (per-user application data, `com.tuari.desktop`).

**The database is encrypted, and its key is kept in the Windows Credential
Manager, not in that directory.** So:

- Copying the data directory alone is **not** a restorable backup: on a new
  Windows profile, or after the credential entry is lost, the app generates a
  fresh key and cannot open the restored database.
- A complete backup is the data directory **plus** the credential entry
  (service `com.tuari.desktop.auth`, account `desktop-bearer-token`, in Windows
  Credential Manager) — export it, or keep the original Windows profile.
- The reliable way to move a workspace is the app's own flow for it:
  **Settings → Security** (recovery keys and the database encryption key), which
  lets you re-wrap the database under a key you can reproduce on another
  machine.

Take backups with the app closed.

## 5. Updates

This build does not ship an automatic update channel yet: install the next
version by running its installer over the current one. Your data is preserved.

## Support

Include the app version (Settings → About) and, for license problems, the
**name and email the license was issued to** plus the edition and the exact
error message — the License screen shows those. The internal license ID
(`LCE-...`) is not displayed in the app yet; quote it from your license file if
you have it.
