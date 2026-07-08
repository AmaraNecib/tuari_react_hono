# Update Signing Tools

This directory contains CLI tools for signing and verifying update package manifests
using Ed25519 cryptography. These tools are used in the release pipeline to produce
verifiable update packages.

## Tools

### `sign-update.mjs`

Sign an update manifest with an Ed25519 private key.

```bash
node scripts/sign-update.mjs --private-key <path> --manifest <path> --output <path>
```

**Arguments:**

| Argument          | Description                                      |
|-------------------|--------------------------------------------------|
| `--private-key`   | Path to Ed25519 private key PEM file (required)  |
| `--manifest`      | Path to `manifest.json` to sign (required)       |
| `--output`        | Output file path for signed manifest (required)  |
| `--help`          | Show usage                                       |

**Output format:**

```
<base64url(canonical_json)>.<base64url(signature)>
```

The manifest is serialized using canonical JSON (deterministic field ordering with
alphabetically sorted keys) before signing. The canonical JSON bytes are then signed
with Ed25519, and both the canonical JSON and the 64-byte signature are base64url-encoded.

**Example:**

```bash
node scripts/sign-update.mjs \
  --private-key ./dev-update-keys/dev-update-private-key.pem \
  --manifest ./release/manifest.json \
  --output ./release/manifest.signed
```

### `verify-signed-manifest.mjs`

Verify an Ed25519 signature on a signed update manifest.

```bash
node scripts/verify-signed-manifest.mjs --public-key <path> --manifest <path>
```

**Arguments:**

| Argument        | Description                                     |
|-----------------|-------------------------------------------------|
| `--public-key`  | Path to Ed25519 public key PEM file (required)  |
| `--manifest`    | Path to signed manifest file (required)         |
| `--help`        | Show usage                                      |

**Exit codes:**

- `0` — Signature is valid
- `1` — Signature is invalid or an error occurred

**Example:**

```bash
node scripts/verify-signed-manifest.mjs \
  --public-key ./dev-update-keys/dev-update-public-key.pem \
  --manifest ./release/manifest.signed
```

### `generate-dev-update-keys.mjs`

Generate Ed25519 key pair for development and CI use.

```bash
node scripts/generate-dev-update-keys.mjs [--output-dir <path>]
```

**Arguments:**

| Argument      | Description                                        |
|---------------|----------------------------------------------------|
| `--output-dir`| Output directory (default: current directory)      |
| `--help`      | Show usage                                         |

**Output files:**

| File                          | Contents                                                    |
|-------------------------------|-------------------------------------------------------------|
| `dev-update-public-key.txt`   | Rust byte array constant: `pub const UPDATE_PUBLIC_KEY: [u8; 32] = [...]` |
| `dev-update-public-key.pem`   | SPKI PEM-encoded Ed25519 public key (for verification tools) |
| `dev-update-private-key.pem`  | PKCS#8 PEM-encoded Ed25519 private key                      |

**Example:**

```bash
node scripts/generate-dev-update-keys.mjs --output-dir ./dev-update-keys
```

## Canonical JSON Format

All tools use deterministic canonical JSON serialization to ensure that
the bytes signed by `sign-update.mjs` are identical to those verified by
the Rust `verify_package_signature()` function.

**Rules:**

1. Object keys are sorted alphabetically (lexicographic order)
2. No whitespace between tokens
3. Arrays preserve element order
4. Strings are standard JSON-escaped UTF-8
5. Numbers are written as decimal (no leading zeros)

For the `UpdateManifest` struct, the canonical field order is:

```json
{
  "checksum": "...",
  "files": [
    {
      "hash": "...",
      "path": "...",
      "size": 0
    }
  ],
  "minSupportedVersion": "...",
  "platform": "...",
  "version": "..."
}
```

Individual file entries have sorted keys: `hash`, `path`, `size`.

## Signature Algorithm

- **Key type:** Ed25519 (curve25519)
- **Signing:** `crypto.sign()` with Ed25519 (RFC 8032)
- **Encoding:** Base64url (RFC 4648 §5, no padding)
- **Output format:** `<canonical-json-base64url>.<signature-base64url>`

This matches the verification in `update.rs` (`verify_package_signature`),
which calls `crypto::ed25519_verify(public_key, manifest_bytes, signature_bytes)`.

## Development Keys

Development keys for CI are stored in `scripts/dev-update-keys/`:

- `dev-update-public-key.txt` — Rust constant for use in `update.rs`
- `dev-update-public-key.pem` — PEM public key for verification tools
- `dev-update-private-key.pem` — Private key for local signing (never used in production)

Production keys must be kept outside the repository and managed through
secure secret storage.

## CI Integration

In CI, the signing step looks like:

```bash
# Install dependencies
pnpm install

# Sign the release manifest
node scripts/sign-update.mjs \
  --private-key $UPDATE_SIGNING_KEY_PATH \
  --manifest dist/manifest.json \
  --output dist/manifest.signed
```

The `UPDATE_SIGNING_KEY_PATH` environment variable points to the private key
PEM file, which is injected as a CI secret.

## Testing

Run the unit and integration tests:

```bash
node --test tests/sign-update.test.mjs
```

For Rust-side verification testing:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- update_integration

To run the Node-to-Rust cross-language integration test (requires Node.js in PATH):

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  -- cli_signed_manifest_rust_verification -- --include-ignored
```

