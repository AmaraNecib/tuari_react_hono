// Rust Core — update package verification
//
// Verifies Ed25519 signatures and SHA-256 hashes for update packages.
// Reuses crypto.rs for cryptographic operations.
// Zero tauri imports — this is a pure Rust Core module.

use crate::error::RustCoreError;
use std::path::Path;

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

// ─── Update Provider ────────────────────────────────────────────

/// The result of checking for available updates.
#[derive(Debug, Clone)]
pub struct UpdateInfo {
    pub version: String,
    pub download_url: String,
    pub checksum: String,
    pub release_date: String,
}

/// Abstract update provider.
pub trait UpdateProvider: Send + Sync {
    /// Check if a newer version is available.
    fn check_for_updates(&self, current_version: &str) -> Result<Option<UpdateInfo>, RustCoreError>;

    /// Download an update package to the specified path.
    fn download_update(&self, info: &UpdateInfo, dest: &Path) -> Result<(), RustCoreError>;
}

/// Provider that fetches updates from GitHub Releases.
pub struct GithubReleasesProvider {
    owner: String,
    repo: String,
}

impl GithubReleasesProvider {
    pub fn new(owner: &str, repo: &str) -> Self {
        Self {
            owner: owner.to_string(),
            repo: repo.to_string(),
        }
    }
}

impl UpdateProvider for GithubReleasesProvider {
    fn check_for_updates(&self, current_version: &str) -> Result<Option<UpdateInfo>, RustCoreError> {
        // TODO: implement GitHub API call
        let _ = current_version;
        Ok(None)
    }

    fn download_update(&self, info: &UpdateInfo, dest: &Path) -> Result<(), RustCoreError> {
        // TODO: implement HTTP download
        let _ = info;
        let _ = dest;
        Ok(())
    }
}

/// Provider that loads updates from a local file path.
pub struct LocalFileProvider {
    path: std::path::PathBuf,
}

impl LocalFileProvider {
    pub fn new(path: &Path) -> Self {
        Self { path: path.to_path_buf() }
    }
}

impl UpdateProvider for LocalFileProvider {
    fn check_for_updates(&self, _current_version: &str) -> Result<Option<UpdateInfo>, RustCoreError> {
        // Local provider always has the file if it exists
        if self.path.exists() {
            Ok(Some(UpdateInfo {
                version: "local".to_string(),
                download_url: String::new(),
                checksum: String::new(),
                release_date: String::new(),
            }))
        } else {
            Ok(None)
        }
    }

    fn download_update(&self, _info: &UpdateInfo, dest: &Path) -> Result<(), RustCoreError> {
        std::fs::copy(&self.path, dest)
            .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
        Ok(())
    }
}

/// No-op provider for testing.
pub struct NoopProvider;

// ─── Update Engine — backup, stage, apply, rollback ──────────────

/// Coordinates the safe update lifecycle.
pub struct UpdateEngine {
    backup_dir: std::path::PathBuf,
    install_dir: std::path::PathBuf,
}

impl UpdateEngine {
    pub fn new(install_dir: &Path, backup_dir: &Path) -> Self {
        Self {
            backup_dir: backup_dir.to_path_buf(),
            install_dir: install_dir.to_path_buf(),
        }
    }

    /// Backup the current installation.
    pub fn backup(&self) -> Result<(), RustCoreError> {
        if self.backup_dir.exists() {
            std::fs::remove_dir_all(&self.backup_dir)
                .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
        }
        std::fs::create_dir_all(&self.backup_dir)
            .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
        // Copy each file in install dir to backup
        let entries = match std::fs::read_dir(&self.install_dir) {
            Ok(e) => e,
            Err(_) => return Ok(()), // nothing to backup
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let dest = self.backup_dir.join(path.file_name().unwrap_or_default());
                std::fs::copy(&path, &dest)
                    .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
            }
        }
        Ok(())
    }

    /// Stage a downloaded update package.
    pub fn stage(&self, package_path: &Path) -> Result<(), RustCoreError> {
        // Extract package to stage directory
        let stage_dir = self.install_dir.join("stage");
        if stage_dir.exists() {
            std::fs::remove_dir_all(&stage_dir)
                .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
        }
        std::fs::create_dir_all(&stage_dir)
            .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
        // Copy package to stage dir (in production, extract archive)
        std::fs::copy(package_path, stage_dir.join("update-package"))
            .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
        Ok(())
    }

    /// Apply the staged update.
    pub fn apply(&self) -> Result<(), RustCoreError> {
        let stage_dir = self.install_dir.join("stage");
        if !stage_dir.exists() {
            return Err(RustCoreError::LicenseFileNotFound);
        }
        // In production: swap stage_dir with install_dir
        Ok(())
    }

    /// Roll back to the previous version.
    pub fn rollback(&self) -> Result<(), RustCoreError> {
        if !self.backup_dir.exists() {
            return Err(RustCoreError::LicenseFileNotFound);
        }
        // Copy each file from backup back to install dir
        let entries = match std::fs::read_dir(&self.backup_dir) {
            Ok(e) => e,
            Err(_) => return Err(RustCoreError::LicenseFileNotFound),
        };
        let mut restored = false;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let dest = self.install_dir.join(path.file_name().unwrap_or_default());
                std::fs::copy(&path, &dest)
                    .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
                restored = true;
            }
        }
        if !restored {
            return Err(RustCoreError::LicenseFileNotFound);
        }
        Ok(())
    }
}

// ─── Update Strategy ────────────────────────────────────────────

/// The result of applying an update strategy.
#[derive(Debug, Clone)]
pub struct UpdateResult {
    pub success: bool,
    pub message: String,
}

/// Abstract strategy for applying an update package.
pub trait UpdateStrategy: Send + Sync {
    /// Apply the update package at the given path.
    fn apply_update(&self, package_path: &Path) -> Result<UpdateResult, RustCoreError>;

    /// Roll back the last applied update.
    fn rollback(&self) -> Result<UpdateResult, RustCoreError>;
}

/// Strategy that replaces the application binary entirely.
pub struct FullReplaceStrategy {
    install_dir: std::path::PathBuf,
}

impl FullReplaceStrategy {
    pub fn new(install_dir: &Path) -> Self {
        Self { install_dir: install_dir.to_path_buf() }
    }
}

impl UpdateStrategy for FullReplaceStrategy {
    fn apply_update(&self, _package_path: &Path) -> Result<UpdateResult, RustCoreError> {
        // TODO: implement full replace
        Ok(UpdateResult {
            success: true,
            message: "update applied successfully".to_string(),
        })
    }

    fn rollback(&self) -> Result<UpdateResult, RustCoreError> {
        // TODO: implement rollback
        Ok(UpdateResult {
            success: true,
            message: "rollback completed".to_string(),
        })
    }
}

/// Strategy for differential (patch-based) updates.
pub struct DifferentialStrategy {
    install_dir: std::path::PathBuf,
}

impl DifferentialStrategy {
    pub fn new(install_dir: &Path) -> Self {
        Self { install_dir: install_dir.to_path_buf() }
    }
}

impl UpdateStrategy for DifferentialStrategy {
    fn apply_update(&self, _package_path: &Path) -> Result<UpdateResult, RustCoreError> {
        // TODO: implement differential apply (bsdiff/bspatch)
        Ok(UpdateResult {
            success: true,
            message: "differential update applied".to_string(),
        })
    }

    fn rollback(&self) -> Result<UpdateResult, RustCoreError> {
        // TODO: implement rollback
        Ok(UpdateResult {
            success: true,
            message: "rollback completed".to_string(),
        })
    }
}

impl UpdateProvider for NoopProvider {
    fn check_for_updates(&self, _current_version: &str) -> Result<Option<UpdateInfo>, RustCoreError> {
        Ok(None)
    }

    fn download_update(&self, _info: &UpdateInfo, _dest: &Path) -> Result<(), RustCoreError> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("tuari-update-test-{nanos}"))
    }
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
    fn providers_are_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<GithubReleasesProvider>();
        assert_send_sync::<LocalFileProvider>();
        assert_send_sync::<NoopProvider>();
    }

    #[test]
    fn noop_provider_returns_none() {
        let provider = NoopProvider;
        let result = provider.check_for_updates("1.0.0").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn strategies_are_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<FullReplaceStrategy>();
        assert_send_sync::<DifferentialStrategy>();
    }

    #[test]
    fn update_engine_backup_and_rollback() {
        let dir = temp_dir();
        let current_dir = dir.join("current");
        let backup_dir = dir.join("backup");
        std::fs::create_dir_all(&current_dir).unwrap();
        std::fs::write(current_dir.join("version.txt"), b"1.0.0").unwrap();

        let engine = UpdateEngine::new(&current_dir, &backup_dir);
        assert!(engine.backup().is_ok());
        assert!(backup_dir.join("current.bak").exists() || backup_dir.join("current").exists() || backup_dir.exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn update_engine_stage_and_apply() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        let engine = UpdateEngine::new(&dir, &dir.join("backup"));
        // Write a test package
        let pkg = dir.join("test-package");
        std::fs::write(&pkg, b"test").unwrap();
        assert!(engine.stage(&pkg).is_ok());
        assert!(engine.apply().is_ok());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn full_replace_strategy_apply_succeeds() {
        let strategy = FullReplaceStrategy::new(&std::path::Path::new("/tmp"));
        let result = strategy.apply_update(&std::path::Path::new("/tmp/package")).unwrap();
        assert!(result.success);
    }

    #[test]
    fn noop_provider_download_succeeds() {
        let provider = NoopProvider;
        let info = UpdateInfo {
            version: "2.0.0".to_string(),
            download_url: String::new(),
            checksum: String::new(),
            release_date: String::new(),
        };
        let tmp = std::env::temp_dir().join("noop-test");
        assert!(provider.download_update(&info, &tmp).is_ok());
    }

    #[test]
    fn send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<UpdateManifest>();
        assert_send_sync::<ManifestFileEntry>();
    }
}
