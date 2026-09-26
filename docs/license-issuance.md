# Issuing a customer license

Tuari licenses are **offline**: you sign a license file with the vendor private
key, the customer pastes its contents into the app, and the desktop app verifies
the Ed25519 signature against a public key compiled into the binary. No licensing
server is involved.

## Key material

| Item | Location | Notes |
| --- | --- | --- |
| Vendor private key | `license-signing.pem`, **outside the repository** | Ed25519, PKCS#8 PEM. Back it up in two places. |
| Embedded public key | `apps/desktop/src-tauri/src/license.rs` → `EMBEDDED_PUBLIC_KEY` | Ships inside the app. |
| Root CA public key | `apps/desktop/src-tauri/src/trust/root_ca.rs` → `ROOT_CA_PUBLIC_KEY` | Same key for 0.1.x; used for key-rotation certificates. |

`.gitignore` refuses `*.pem`, `*.key` and `*.lic`, and two tests
(`embedded_key_is_production`, `root_key_is_production`) fail the build if either
anchor is a zeroed placeholder or the published RFC 8032 test vector — the value
that shipped before 0.1.0, which would have let anyone mint a working license.

**If the private key is lost**, no new licenses can be issued. Existing installs
keep working; issuing again requires shipping a build with a new public key (or
a key-rotation certificate signed by the current Root CA key).

## Mint a license

```bash
node scripts/generate-license.mjs \
  --edition professional \
  --features multi_user,lan_server \
  --max-users 10 \
  --license-type perpetual \
  --issued-to "Customer Company SARL" \
  --email "owner@customer.dz" \
  --private-key /path/to/license-signing.pem \
  --output customer-license.lic
```

Options: `--edition standard|professional|enterprise`, `--features` (comma
separated), `--max-users` (`0` = unlimited), `--license-type
perpetual|subscription|trial`, `--valid-until <ISO 8601>` (omit for perpetual).

The output is the signed wire format the app verifies:
`<base64url(payload JSON)>.<base64url(signature)>`.

## Customer activation

1. Install the app (the NSIS installer from the release).
2. Open **Settings → License**, paste the license file's contents.
3. The app verifies the signature, persists it to `<data-dir>/license.lic`, and
   reports the edition, feature flags and expiry.

A tampered or unsigned license is rejected with an invalid-signature error; the
customer sees the activation failure instead of a silently unlicensed app.

## Verifying a minted license before sending it

The end-to-end check lives outside the repo (it needs a real license file):

```bash
# mint, then confirm the app's anchor accepts it
cd apps/desktop/src-tauri
LICENSE_UNDER_TEST=/path/to/customer-license.lic cargo test --lib
```

`cargo test --lib --tests` runs in CI, so the trust anchors and the wire format
are covered on every change.
