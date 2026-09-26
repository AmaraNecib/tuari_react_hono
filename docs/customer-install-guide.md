# Install and activate Tuari (customer guide)

This is the guide you hand a customer together with two files:

| File | Purpose |
| --- | --- |
| `Tuari_<version>_x64-setup.exe` | Windows installer (NSIS) |
| `customer-license.lic` | Their signed license (see `docs/license-issuance.md`) |

## Requirements

- Windows 10 or 11, 64-bit.
- ~300 MB free disk space.
- Internet access during the first install unless your build embeds the WebView2
  runtime (the default NSIS build downloads it if it is missing).

## 1. Install

1. Run `Tuari_<version>_x64-setup.exe`.
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

**After the 30-day trial, the app locks until a valid license is activated** —
the API sidecar is not started while locked, so nothing can be edited until then.

Troubleshooting:

| Symptom | Cause |
| --- | --- |
| "invalid signature" | The license was edited, truncated, or issued for a different vendor key |
| "expired" | `--valid-until` has passed; renew the license |
| "clock tampering" | The system clock moved backwards; fix the clock and restart |
| License accepted but features missing | The edition/features in the license do not include them |

## 4. Your data

The database and attachments live in the app's data directory (per-user
application data, `com.tuari.desktop`). **Back up that directory** — it holds
your entire workspace. A copy taken while the app is closed restores cleanly.

## 5. Updates

This build does not ship an automatic update channel yet: install the next
version by running its installer over the current one. Your data is preserved.

## Support

Include the app version (Settings → About) and, for license problems, the
license ID (`LCE-...`) from the License screen.
