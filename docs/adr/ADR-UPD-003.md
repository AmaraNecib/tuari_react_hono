# ADR-UPD-003 — Update Packaging: ZIP Archive with Signed Manifest

**Status:** Accepted  
**Date:** 2026-07-08

### Decision

Package updates as `.zip` archives containing:
- A signed manifest file (`manifest.json`) with Ed25519 signatures over canonical JSON
- Application binaries, runtime files, and migration manifests
- Release notes (`CHANGELOG.md`)

The manifest is serialized using **canonical JSON** (sorted keys, no whitespace) before signing. The signature is computed over the canonical manifest bytes with the `signature` field excluded.

Compression level is pinned to a specific zlib level (level 6) for deterministic builds. ZIP entry timestamps must also be normalized (set to a fixed epoch, e.g., the commit timestamp) to ensure byte-identical outputs across builds.

### Rationale

- ZIP is universally supported across Windows, macOS, and Linux with no additional dependencies.
- Ed25519 is already in the crypto stack (shared between licensing and update systems via `crypto.rs`), avoiding new cryptographic dependencies.
- Canonical JSON ensures deterministic signature verification regardless of the serialization library used (Rust `serde_json`, Node.js `JSON.stringify`, or any other conforming implementation).
- Pinning the compression level and normalizing ZIP entry timestamps eliminate the two primary sources of non-determinism in ZIP archives: the same source and toolchain always produce a byte-identical `.zip`, enabling reproducible builds and hash-based integrity verification.
- Storing the manifest separately from the binary contents allows signature verification without extracting the full archive.
- The alternative — a custom binary container format — would add complex parsing code and maintenance burden with no security benefit over a signed manifest in a standard archive.
- The alternative — using a TUF (The Update Framework) repository — is more infrastructure than the current use case requires. The architecture can adopt TUF in a future version without breaking the package format.

### Consequences

- The signing tool (`sign-update.mjs`) and the verification function (`update.rs`) must implement identical canonical JSON serialization. A shared test vector in the test suite must verify cross-implementation compatibility.
- Compression level must be documented in the build configuration and enforced in CI. ZIP entry timestamps must be normalized to a fixed value (e.g., the commit timestamp or Unix epoch) to eliminate non-determinism from file modification times.
- The manifest format must include a `manifestVersion` field to allow future format evolution (V1 = full-package ZIP, V2 = differential, V3 = chunked).
- ZIP's 4 GiB size limit per file is acceptable as update packages are expected to remain well under this limit.
- ZIP does not natively support incremental or differential updates; those will require a new format version when implemented.
- The SHA-256 hash of every file in the archive must be listed in the manifest, enabling per-file integrity verification during extraction.

### References

- **Architecture:** `docs/update-architecture.md` §14 (Update Package Format), §23.2 (Key Hierarchy), §8 (Algorithm consistency)
- **ADR-RCA-001:** Rust Core Architecture (shared `crypto.rs` with Ed25519 support)
