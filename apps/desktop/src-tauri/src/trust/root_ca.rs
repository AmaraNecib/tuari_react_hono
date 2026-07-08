//! # Root CA — trust anchor for key rotation certificates
//!
//! The Root CA is an offline Ed25519 key pair held on an air-gapped HSM
//! with dual-control access. The public key is embedded at build time.
//!
//! **Development placeholder:** Before the first production build, replace
//! this with the real Root CA public key generated on the air-gapped HSM.
//! Tests use `RotationCertificate::verify_with_key()` to bypass this
//! placeholder and test rotation cert verification with generated keys.

/// Root CA public key used to verify key rotation certificates.
///
/// Embedded at build time; the corresponding private key is held offline
/// on an air-gapped HSM with dual-control access.
pub(crate) const ROOT_CA_PUBLIC_KEY: [u8; 32] = [0u8; 32];
