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
keep working. There is no recovery path that avoids touching customers: the
Root CA used to sign rotation certificates *is* this same key, so a lost key
cannot sign its own replacement. Recovery means shipping a build carrying a new
public key.

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
separated), `--max-users` (non-negative integer; `0` = unlimited; anything
non-numeric, negative, or above 4294967295 is rejected before signing — the app
stores seats in 32 bits, so a larger count would wrap to unlimited),
`--license-type perpetual|subscription|trial`, `--valid-until <RFC 3339 or
YYYY-MM-DD>`. `--valid-until` is required for `subscription` and `trial`; only
`perpetual` may omit it. The date and time are validated before signing: a bare
date (`2027-01-01`) is normalised to `2027-01-01T00:00:00Z`, and impossible
dates (`2027-02-30`) or out-of-range times are rejected, so the app never
silently treats a time-limited license as perpetual.

The signer derives the public half of `--private-key` and refuses to issue
unless it matches `EMBEDDED_PUBLIC_KEY`, the anchor compiled into the app. A
license signed with any other key can never activate, so the mismatch fails
before a file is produced. Tests and dev builds that genuinely need another key
pass `--allow-nonproduction-key`; the runbook path never needs it.

The output is the signed wire format the app verifies:
`<base64url(payload JSON)>.<base64url(signature)>`. The license is the only
thing printed to stdout, so `> customer.lic` (no `--output`) produces a file the
app accepts; the human summary goes to stderr. `--output` writes the file with
owner-only permissions (0600) because it carries the customer's name, email,
and a transferable license value.

## Verifying a minted license before sending it

Mint the file, then point `LICENSE_UNDER_TEST` at it and run the license tests:

```bash
cd apps/desktop/src-tauri
LICENSE_UNDER_TEST=/path/to/customer-license.lic cargo test --lib
```

`verifies_license_under_test_when_provided` reads that file and verifies it
against the public key compiled into the app, using the same code path the
runtime uses. It fails if the minted file would not activate. Without the
variable the test prints a skip note — CI has no vendor key.

The signer's wire format is also pinned continuously: `tests/license_signer_interop.rs`
mints with a throwaway keypair through `scripts/generate-license.mjs` and
verifies the result with the Rust verifier. CI runs it whenever the signer or
the Rust crate changes (`cargo test`).

## Customer activation

1. Install the app (the NSIS installer from the release).
2. Open **Settings → License**, paste the license file's contents.
3. The app verifies the signature, persists it to `<data-dir>/license.lic`, and
   reports the edition, feature flags and expiry.

A tampered or unsigned license is rejected with an invalid-signature error; the
customer sees the activation failure instead of a silently unlicensed app.
