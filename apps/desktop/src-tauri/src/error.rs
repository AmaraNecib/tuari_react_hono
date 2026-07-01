use std::fmt;
use std::io;

/// Standard error type for all Rust Core operations.
///
/// Every Rust Core module returns `Result<T, RustCoreError>`.
/// This enables callers (Tauri Adapter, tests) to handle all errors uniformly.
#[derive(Debug)]
pub enum RustCoreError {
    // --- Crypto errors ---
    /// An Ed25519 signature did not verify.
    InvalidSignature,
    /// A cryptographic operation failed.
    CryptoError(String),

    // --- License errors ---
    /// The license file could not be found at the expected path.
    LicenseFileNotFound,
    /// The license has expired.
    Expired,
    /// The license file has an invalid format.
    InvalidFormat,
    /// The license payload failed semantic validation.
    InvalidPayload,
    /// License activation failed for a specific reason.
    ActivationFailed(String),

    // --- Clock errors ---
    /// The system clock appears to have been tampered with.
    ClockTampered {
        /// Best estimate of the current time, based on monotonic clock.
        estimated_time: chrono::DateTime<chrono::Utc>,
        /// Human-readable reason for the suspicion.
        reason: String,
    },

    // --- File system errors ---
    /// An I/O operation failed.
    IoError(Box<dyn std::error::Error + Send + Sync>),
    /// Not enough disk space to perform the requested operation.
    InsufficientDiskSpace {
        /// Amount of space required, in bytes.
        required: u64,
        /// Amount of space available, in bytes.
        available: u64,
    },

    // --- Internal errors ---
    /// An unexpected internal error occurred.
    Internal(String),
}

impl fmt::Display for RustCoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RustCoreError::InvalidSignature => write!(f, "invalid cryptographic signature"),
            RustCoreError::CryptoError(msg) => write!(f, "cryptographic error: {msg}"),
            RustCoreError::LicenseFileNotFound => write!(f, "license file not found"),
            RustCoreError::Expired => write!(f, "license has expired"),
            RustCoreError::InvalidFormat => write!(f, "invalid file format"),
            RustCoreError::InvalidPayload => write!(f, "invalid license payload"),
            RustCoreError::ActivationFailed(reason) => write!(f, "license activation failed: {reason}"),
            RustCoreError::ClockTampered { estimated_time, reason } => {
                write!(f, "clock integrity check failed: {reason} (estimated time: {estimated_time})")
            }
            RustCoreError::IoError(err) => write!(f, "I/O error: {err}"),
            RustCoreError::InsufficientDiskSpace { required, available } => {
                write!(f, "insufficient disk space: required {required} bytes, available {available} bytes")
            }
            RustCoreError::Internal(msg) => write!(f, "internal error: {msg}"),
        }
    }
}

impl std::error::Error for RustCoreError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            RustCoreError::IoError(err) => Some(err.as_ref()),
            _ => None,
        }
    }
}

impl From<io::Error> for RustCoreError {
    fn from(err: io::Error) -> Self {
        RustCoreError::IoError(Box::new(err))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    #[test]
    fn display_invalid_signature() {
        let err = RustCoreError::InvalidSignature;
        let msg = format!("{}", err);
        assert!(!msg.is_empty());
        assert!(msg.to_lowercase().contains("signature"));
    }

    #[test]
    fn display_expired() {
        let err = RustCoreError::Expired;
        let msg = format!("{}", err);
        assert!(msg.to_lowercase().contains("expir"));
    }

    #[test]
    fn display_license_not_found() {
        let err = RustCoreError::LicenseFileNotFound;
        let msg = format!("{}", err);
        assert!(msg.to_lowercase().contains("license"));
    }

    #[test]
    fn display_invalid_format() {
        let err = RustCoreError::InvalidFormat;
        let msg = format!("{}", err);
        assert!(msg.to_lowercase().contains("format"));
    }

    #[test]
    fn display_io_error() {
        let io_err = io::Error::new(io::ErrorKind::NotFound, "file not found");
        let err = RustCoreError::from(io_err);
        let msg = format!("{}", err);
        assert!(!msg.is_empty());
    }

    #[test]
    fn from_io_error_not_found() {
        let io_err = io::Error::new(io::ErrorKind::NotFound, "test file missing");
        let err: RustCoreError = io_err.into();
        match err {
            RustCoreError::IoError(_) => {}
            _ => panic!("Expected IoError variant"),
        }
    }

    #[test]
    fn from_io_error_permission_denied() {
        let io_err = io::Error::new(io::ErrorKind::PermissionDenied, "access denied");
        let err: RustCoreError = io_err.into();
        match err {
            RustCoreError::IoError(_) => {}
            _ => panic!("Expected IoError variant"),
        }
    }

    #[test]
    fn display_crypto_error() {
        let err = RustCoreError::CryptoError("test crypto error".to_string());
        let msg = format!("{}", err);
        assert!(msg.contains("test crypto error"));
    }

    #[test]
    fn send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<RustCoreError>();
    }

    #[test]
    fn error_trait_implemented() {
        // Verify the Error trait is implemented
        let err = RustCoreError::InvalidSignature;
        let source = std::error::Error::source(&err);
        assert!(source.is_none());
    }

    #[test]
    fn display_is_deterministic() {
        let err = RustCoreError::InvalidSignature;
        let msg1 = format!("{}", err);
        let msg2 = format!("{}", err);
        assert_eq!(msg1, msg2);
    }
}
