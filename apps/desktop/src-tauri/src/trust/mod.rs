//! # Trust — Root CA keys, rotation certificates, and trusted key store
//!
//! This module centralises all trust-related infrastructure so that both
//! license signing and update signing share the same Root CA, rotation
//! certificate verification, and key discovery logic.
//!
//! ## Modules
//!
//! - `root_ca` — embedded Root CA public key constant
//! - `rotation` — `RotationCertificate`, `KeyPurpose`, verification
//! - `trust_store` — `load_trusted_keys()` for discovering trusted keys

pub mod root_ca;
pub mod rotation;
pub mod trust_store;

pub use rotation::{KeyPurpose, RotationCertificate};
pub use trust_store::load_trusted_keys;
