// Rust Core — recovery primitives
//
// Minimal filesystem recovery utilities for the future Recovery Environment.
// This module has zero tauri imports.

use crate::error::RustCoreError;
use std::path::Path;

/// Check if there is enough disk space available at the given path.
/// Uses `fs2` or falls back to `true` (stub for now).
pub fn check_disk_space(_path: &Path, _required_bytes: u64) -> Result<bool, RustCoreError> {
    // Stub: always returns true for now.
    // Full implementation requires the `fs2` crate for cross-platform
    // free-space queries, which will be added in a future milestone.
    Ok(true)
}

/// Atomically rename a file (crash-safe).
pub fn atomic_rename(src: &Path, dst: &Path) -> Result<(), RustCoreError> {
    std::fs::rename(src, dst).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            RustCoreError::LicenseFileNotFound
        } else {
            RustCoreError::IoError(Box::new(e))
        }
    })
}

/// Create a backup of a file by copying it to `<path>.bak`.
pub fn create_backup(path: &Path) -> Result<(), RustCoreError> {
    let backup_path = path.with_extension("bak");
    std::fs::copy(path, &backup_path).map_err(|e| RustCoreError::IoError(Box::new(e)))?;
    Ok(())
}

/// Restore a file from its `.bak` backup.
pub fn restore_from_backup(path: &Path) -> Result<(), RustCoreError> {
    let backup_path = path.with_extension("bak");
    if !backup_path.exists() {
        return Err(RustCoreError::LicenseFileNotFound);
    }
    std::fs::copy(&backup_path, path).map_err(|e| RustCoreError::IoError(Box::new(e)))?;
    Ok(())
}
