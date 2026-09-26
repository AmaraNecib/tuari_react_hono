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

**After the 30-day trial the app locks: it refuses changes until a valid license
is activated.** The desktop shell reports the license status to the API, and the
API refuses every audited mutation while the status is `expired`, `inactive`,
`suspicious` (clock tampering) or `unknown`, with a message telling you what to
do. Reading data still works, so you can reach the License screen and activate.

During the trial (`trial`) and any post-expiry grace period (`grace`) everything
works normally.

Edition and feature lists are recorded in the license and shown on the License
screen, but the API does not yet restrict any operation by them — the status
check above is the only license enforcement that applies to everyday changes.

Troubleshooting:

| Symptom | Cause |
| --- | --- |
| "invalid signature" | The license was edited, truncated, or issued for a different vendor key |
| "expired" | `--valid-until` has passed; renew the license |
| "clock tampering" | The system clock moved backwards, or it was previously set far forward and then corrected. Fix the clock, then contact support: the only reset step clears the recorded install time that starts the 30-day trial, so it is not a self-service fix. |
| Expected feature not listed on the License screen | The license does not carry it. Editions and features are recorded but not yet enforced by the API. |

## 4. Your data

The database, attachments, `license.lic` and `clock-tracker.json` live under the
app's data directory — `%APPDATA%\com.tuari.desktop\Tuari` on a normal install
(a portable build keeps the same tree in `<install folder>\data`).

**The database is encrypted, and its key is kept in the Windows Credential
Manager, not in that directory.** So:

- Copying the data directory alone is **not** a restorable backup: on a new
  Windows profile, or after the credential entry is lost, the app generates a
  fresh key at startup and cannot open the restored database.
- A complete backup is the data directory **plus** the database-key credential
  entry (service `com.tuari.desktop.secrets`, account `app-db.key`, in Windows
  Credential Manager) — export it, or keep the original Windows profile.
- Restoring a backup onto a new Windows profile, or any install whose credential
  store no longer holds the matching `app-db.key`, is **not supported by the app
  today**: there is no screen that lets you supply a key before the database
  opens. Keep the Windows profile, or the key entry, with the backup; if both are
  lost, contact support.

**Settings → Security** is not a restore flow. It changes the database key while
the database is already open (current key → new key) and manages one-time
recovery keys, which authorize an administrator password reset — neither can
open a restored database.

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
