# Release Packaging Tools

This directory contains CLI tools for the release pipeline: signing, verifying,
packaging, and generating update metadata. These tools work together to produce
verifiable update packages for the Tuari application.

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

### `build-release-package.mjs`

The main release packaging tool. Assembles the full update package artifact set
for a release in a single command.

```bash
node scripts/build-release-package.mjs \
  --version 0.5.0 \
  --channel stable \
  --build-number 42 \
  --output-dir ./release \
  --web-dist ./apps/web/dist \
  --api-dist ./apps/api/dist \
  --desktop-binary ./apps/desktop/src-tauri/target/release/tuari.exe \
  --private-key ./scripts/dev-update-keys/dev-update-private-key.pem \
  --public-key ./scripts/dev-update-keys/dev-update-public-key.pem \
  --min-supported-version 0.4.0
```

**Arguments:**

| Argument              | Description                                        |
|-----------------------|----------------------------------------------------|
| `--version`           | Package version (semver, required)                 |
| `--channel`           | Release channel (stable/beta/nightly, required)    |
| `--build-number`      | CI build number (required)                         |
| `--output-dir`        | Output directory for artifacts (required)          |
| `--web-dist`          | Path to built frontend (`apps/web/dist/`, required)|
| `--api-dist`          | Path to built API (`apps/api/dist/`, required)     |
| `--desktop-binary`    | Path to Tauri binary (optional)                    |
| `--private-key`       | Ed25519 private key PEM file (required)            |
| `--public-key`        | Ed25519 public key PEM file (required)             |
| `--min-supported-version` | Min app version that can apply this update (required) |
| `--download-url`      | Download URL for the update package (optional)     |
| `--skip-changelog`    | Skip changelog generation                          |
| `--skip-validation`   | Skip post-build validation                         |
| `--help`              | Show usage                                         |

**What it does:**

| Step | Description |
|------|-------------|
| **1** | Collects all files from `--web-dist`, `--api-dist`, and `--desktop-binary`, computes SHA-256 hashes, creates `manifest.json`, signs it with `sign-update.mjs`, and packages everything into a `tuari-<version>-<channel>.update` ZIP archive. |
| **2** | Calls `generate-update-metadata.mjs` to produce `updates.json` with the update package hash, size, version, and release date. |
| **3** | Walks `git log` since the last tag to generate `CHANGELOG-<version>.md`. |
| **4** | Validates the `.update` package: checks ZIP validity, verifies the Ed25519 signature, and confirms every file in the manifest is present with a matching SHA-256 hash. |

**Output files:**

| File | Description |
|------|-------------|
| `tuari-<version>-<channel>.update` | Signed update package (ZIP archive) |
| `updates.json` | Update metadata for the update provider |
| `CHANGELOG-<version>.md` | Release notes from git log |

**Example output:**

```
Building release package v0.5.0 (stable, build 42)
Output: ./release

Step 1: Assembling update package...
  Found 45 web files
  Found 23 API files
  Desktop binary: tuari.exe
  Created tuari-0.5.0-stable.update (15.23 MB)
Step 2: Generating updates.json...
  Generated ./release/updates.json
Step 3: Generating changelog...
  Generated CHANGELOG-0.5.0.md

Validating update package...
  ✓ Manifest signature is valid
  ✓ All files present with correct hashes
  ✓ Update package validation passed

✓ Release package build complete!
  tuari-0.5.0-stable.update
  updates.json
  CHANGELOG-0.5.0.md
```

### `generate-update-metadata.mjs`

Generate `updates.json` — update metadata for the update provider. This file tells
clients what update is available, its hash, size, and release date.

```bash
node scripts/generate-update-metadata.mjs \
  --version 0.5.0 \
  --channel stable \
  --build-number 42 \
  --min-supported-version 0.4.0 \
  --update-package ./release/tuari-0.5.0-stable.update \
  --output-dir ./release \
  --download-url https://releases.example.com/tuari-0.5.0-stable.update
```

**Arguments:**

| Argument                  | Description                                        |
|---------------------------|----------------------------------------------------|
| `--version`               | Package version (semver, required)                 |
| `--channel`               | Release channel (required)                         |
| `--build-number`          | CI build number (required)                         |
| `--min-supported-version` | Minimum app version that can apply update (required) |
| `--update-package`        | Path to the `.update` package file (required)      |
| `--download-url`          | Download URL template or path (optional)           |
| `--output-dir`            | Output directory for `updates.json` (required)     |
| `--help`                  | Show usage                                         |

**Output format (`updates.json`):**

```json
{
  "latestVersion": "0.5.0",
  "minSupportedVersion": "0.4.0",
  "channel": "stable",
  "buildNumber": 42,
  "updatePackageSha256": "abc123def456...",
  "updatePackageSize": 15987200,
  "releaseDate": "2026-07-22T12:00:00.000Z",
  "downloadUrl": "https://releases.example.com/tuari-0.5.0-stable.update"
}
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
# Test signing tools
node --test tests/sign-update.test.mjs

# Test update metadata generation
node --test tests/generate-update-metadata.test.mjs

# Test release packaging (full lifecycle)
node --test tests/build-release-package.test.mjs

# Run all script tests
node --test tests/sign-update.test.mjs tests/generate-update-metadata.test.mjs tests/build-release-package.test.mjs
```

For Rust-side verification testing:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- update_integration
```

To run the Node-to-Rust cross-language integration test (requires Node.js in PATH):

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  -- cli_signed_manifest_rust_verification --include-ignored
```

