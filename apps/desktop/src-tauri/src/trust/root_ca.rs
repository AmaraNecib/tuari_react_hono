//! # Root CA — trust anchor for key rotation certificates
//!
//! In the target deployment this is an offline Ed25519 key pair held on an
//! air-gapped HSM with dual-control access. Until that exists, the 0.1.x line
//! uses the SAME offline vendor key that signs licenses (see
//! `license::EMBEDDED_PUBLIC_KEY`): its private half lives in
//! `license-signing.pem` outside the repository, so nothing here is public.
//!
//! Never set this to zeros or to a published test key — either one makes every
//! rotation certificate (and license) forgeable. `root_key_is_production`
//! pins that.

/// Root CA public key used to verify key rotation certificates.
///
/// Embedded at build time; the corresponding private key is held offline.
pub(crate) const ROOT_CA_PUBLIC_KEY: [u8; 32] = [
    0xec, 0xc4, 0x53, 0x6d, 0x47, 0x83, 0x74, 0xbd, 0x65, 0xc0, 0x33, 0x53, 0x2c, 0xe1,
    0x2d, 0x2c, 0x83, 0xcb, 0x50, 0x2f, 0x72, 0x11, 0xbc, 0x93, 0xe1, 0x41, 0x07, 0xda,
    0x97, 0xf8, 0x92, 0x8b,
];
