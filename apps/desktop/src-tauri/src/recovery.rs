// Rust Core — recovery primitives
//
// Minimal filesystem recovery utilities for the future Recovery Environment.
// This module has zero tauri imports.

use crate::error::RustCoreError;
use std::path::Path;

/// Check if there is enough disk space available at the given path.
pub fn check_disk_space(path: &Path, required_bytes: u64) -> Result<bool, RustCoreError> {
    #[cfg(not(target_os = "windows"))]
    {
        use std::ffi::CString;
        let path_cstr = CString::new(path.to_str().unwrap_or("."))
            .map_err(|_| RustCoreError::Internal("invalid path".to_string()))?;
        let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
        let ret = unsafe { libc::statvfs(path_cstr.as_ptr(), &mut stat) };
        if ret != 0 {
            return Err(RustCoreError::IoError(
                std::io::Error::last_os_error().into(),
            ));
        }
        let available = (stat.f_frsize as u64).saturating_mul(stat.f_bavail);
        Ok(available >= required_bytes)
    }

    #[cfg(target_os = "windows")]
    {
        let _ = path;
        let _ = required_bytes;
        // TODO: implement GetDiskFreeSpaceExW for Windows
        Ok(true)
    }
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
