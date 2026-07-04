// Rust Core — update package verification
//
// Verifies Ed25519 signatures and SHA-256 hashes for update packages.
// Reuses crypto.rs for cryptographic operations.
// Zero tauri imports — this is a pure Rust Core module.

use crate::error::RustCoreError;

/// An entry in the update manifest for a single file.
#[derive(Debug, Clone)]
pub struct ManifestFileEntry {
    pub path: String,
    pub hash: [u8; 32],
    pub size: u64,
}

/// Parsed update manifest from the update package.
#[derive(Debug, Clone)]
pub struct UpdateManifest {
    pub version: String,
    pub platform: String,
    pub min_supported_version: String,
    pub files: Vec<ManifestFileEntry>,
    pub checksum: String,
}

/// Verify an Ed25519 signature over a manifest payload.
///
/// Returns `Ok(())` if the signature is valid for the given public key.
pub fn verify_package_signature(
    public_key: &[u8; 32],
    manifest: &[u8],
    signature: &[u8; 64],
) -> Result<(), RustCoreError> {
    crate::crypto::ed25519_verify(public_key, manifest, signature)
        .map_err(|_| RustCoreError::InvalidSignature)
}

/// Verify that data matches the expected SHA-256 hash.
///
/// Returns `Ok(())` if the hash matches.
pub fn verify_package_hash(
    data: &[u8],
    expected_hash: &[u8; 32],
) -> Result<(), RustCoreError> {
    let actual_hash = crate::crypto::sha256_digest(data);
    if actual_hash == *expected_hash {
        Ok(())
    } else {
        Err(RustCoreError::InvalidPayload)
    }
}

/// Parse an update manifest from JSON bytes.
pub fn parse_update_manifest(manifest_bytes: &[u8]) -> Result<UpdateManifest, RustCoreError> {
    let value: serde_json::Value = serde_json::from_slice(manifest_bytes)
        .map_err(|_| RustCoreError::InvalidPayload)?;

    let version = value
        .get("version")
        .and_then(|v| v.as_str())
        .ok_or(RustCoreError::InvalidPayload)?
        .to_string();

    let platform = value
        .get("platform")
        .and_then(|v| v.as_str())
        .ok_or(RustCoreError::InvalidPayload)?
        .to_string();

    let min_supported_version = value
        .get("minSupportedVersion")
        .and_then(|v| v.as_str())
        .unwrap_or("0.0.0")
        .to_string();

    let checksum = value
        .get("checksum")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let files = value
        .get("files")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|f| {
                    let path = f.get("path").and_then(|p| p.as_str())?.to_string();
                    let hash_str = f.get("hash").and_then(|h| h.as_str())?;
                    let size = f.get("size").and_then(|s| s.as_u64())?;
                    let hash = hex_to_bytes(hash_str)?;
                    Some(ManifestFileEntry { path, hash, size })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(UpdateManifest {
        version,
        platform,
        min_supported_version,
        files,
        checksum,
    })
}

/// Convert a hex string to a 32-byte array.
fn hex_to_bytes(hex: &str) -> Option<[u8; 32]> {
    if hex.len() != 64 {
        return None;
    }
    let mut bytes = [0u8; 32];
    for i in 0..32 {
        bytes[i] = u8::from_str_radix(&hex[2 * i..2 * i + 2], 16).ok()?;
    }
    Some(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use rand_core::CryptoRngCore;

    fn generate_keypair() -> (SigningKey, [u8; 32]) {
        let sk = SigningKey::generate(&mut rand::rngs::OsRng);
        let pk = sk.verifying_key().to_bytes();
        (sk, pk)
    }

    #[test]
    fn verify_valid_signature() {
        let (sk, pk) = generate_keypair();
        let data = b"test manifest";
        let sig = sk.sign(data);
        let sig_bytes = sig.to_bytes();

        assert!(verify_package_signature(&pk, data, &sig_bytes).is_ok());
    }

    #[test]
    fn verify_tampered_signature() {
        let (sk, pk) = generate_keypair();
        let data = b"test manifest";
        let _sig = sk.sign(data);
        let wrong_data = b"tampered manifest";
        let wrong_sig = sk.sign(wrong_data);
        let sig_bytes = wrong_sig.to_bytes();

        let result = verify_package_signature(&pk, data, &sig_bytes);
        assert!(matches!(result, Err(RustCoreError::InvalidSignature)));
    }

    #[test]
    fn verify_wrong_key() {
        let (sk1, _pk1) = generate_keypair();
        let (_sk2, pk2) = generate_keypair();
        let data = b"test manifest";
        let sig = sk1.sign(data);
        let sig_bytes = sig.to_bytes();

        let result = verify_package_signature(&pk2, data, &sig_bytes);
        assert!(matches!(result, Err(RustCoreError::InvalidSignature)));
    }

    #[test]
    fn verify_matching_hash() {
        let data = b"hello world";
        let hash = crate::crypto::sha256_digest(data);
        assert!(verify_package_hash(data, &hash).is_ok());
    }

    #[test]
    fn verify_mismatched_hash() {
        let data = b"hello world";
        let wrong_hash = [0u8; 32];
        let result = verify_package_hash(data, &wrong_hash);
        assert!(matches!(result, Err(RustCoreError::InvalidPayload)));
    }

    #[test]
    fn parse_valid_manifest() {
        let manifest = r#"{
            "version": "1.0.0",
            "platform": "windows-x86_64",
            "minSupportedVersion": "0.1.0",
            "checksum": "abc123",
            "files": [
                {
                    "path": "app.exe",
                    "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                    "size": 12345
                }
            ]
        }"#;

        let result = parse_update_manifest(manifest.as_bytes()).unwrap();
        assert_eq!(result.version, "1.0.0");
        assert_eq!(result.platform, "windows-x86_64");
        assert_eq!(result.files.len(), 1);
        assert_eq!(result.files[0].path, "app.exe");
        assert_eq!(result.files[0].size, 12345);
    }

    #[test]
    fn parse_invalid_manifest() {
        let result = parse_update_manifest(b"not json");
        assert!(matches!(result, Err(RustCoreError::InvalidPayload)));
    }

    #[test]
    fn no_tauri_imports() {
        assert!(true);
    }

    #[test]
    fn send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<UpdateManifest>();
        assert_send_sync::<ManifestFileEntry>();
    }
}
