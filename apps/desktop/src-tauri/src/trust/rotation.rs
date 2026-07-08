//! # Key Rotation — RotationCertificate with KeyPurpose
//!
//! Rotation certificates authorize new signing keys and are signed by the
//! Root CA. Each certificate includes a `purpose` field that restricts
//! which system can use the key (license signing vs. update signing).

use crate::error::RustCoreError;
use crate::trust::root_ca::ROOT_CA_PUBLIC_KEY;
use base64::Engine;

/// The purpose of a key rotation certificate.
///
/// Prevents cross-domain authorization: a license rotation cert cannot be
/// replayed for update signing, and vice versa.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum KeyPurpose {
    /// Key is authorized for signing licenses.
    #[serde(rename = "license-signing")]
    License,
    /// Key is authorized for signing update packages.
    #[serde(rename = "update-signing")]
    Update,
}

impl std::fmt::Display for KeyPurpose {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            KeyPurpose::License => write!(f, "license-signing"),
            KeyPurpose::Update => write!(f, "update-signing"),
        }
    }
}

/// A key rotation certificate authorizing a new signing key.
///
/// Signed by the Root CA private key. Includes a `purpose` field that
/// restricts the key's use to either license or update signing.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationCertificate {
    #[serde(rename = "type")]
    pub cert_type: String,
    /// The new Ed25519 public key (base64url-encoded).
    pub new_public_key: String,
    /// When this key becomes effective (RFC 3339).
    pub effective_from: String,
    /// SHA-256 of the previous public key (hex).
    pub previous_key_id: String,
    /// Reason for rotation.
    pub rotation_reason: String,
    /// The purpose this key is authorized for.
    pub purpose: KeyPurpose,
    /// Root CA signature over the certificate fields (base64url-encoded).
    pub root_ca_signature: String,
}

impl RotationCertificate {
    /// Verify this certificate's signature against the embedded Root CA public key.
    pub fn verify(&self) -> Result<[u8; 32], RustCoreError> {
        self.verify_inner(&ROOT_CA_PUBLIC_KEY)
    }

    /// Verify against a specific Root CA key (useful for testing).
    pub fn verify_with_key(&self, root_ca_key: &[u8; 32]) -> Result<[u8; 32], RustCoreError> {
        self.verify_inner(root_ca_key)
    }

    /// Shared verification logic.
    fn verify_inner(&self, root_ca_key: &[u8; 32]) -> Result<[u8; 32], RustCoreError> {
        // URL_SAFE_NO_PAD because all real-world base64url tools (Node.js, JWT)
        // emit unpadded encoding
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;

        let new_key_bytes = engine
            .decode(&self.new_public_key)
            .map_err(|_| RustCoreError::InvalidFormat)?;
        if new_key_bytes.len() != 32 {
            return Err(RustCoreError::InvalidFormat);
        }
        let mut new_key = [0u8; 32];
        new_key.copy_from_slice(&new_key_bytes);

        let sig_bytes = engine
            .decode(&self.root_ca_signature)
            .map_err(|_| RustCoreError::InvalidFormat)?;
        if sig_bytes.len() != 64 {
            return Err(RustCoreError::InvalidFormat);
        }
        let mut sig = [0u8; 64];
        sig.copy_from_slice(&sig_bytes);

        // Reject if not yet effective
        let effective = chrono::DateTime::parse_from_rfc3339(&self.effective_from)
            .map_err(|_| RustCoreError::InvalidPayload)?;
        if chrono::Utc::now() < effective {
            return Err(RustCoreError::InvalidPayload);
        }

        let msg = self.to_canonical_json();

        match crate::crypto::ed25519_verify(root_ca_key, msg.as_bytes(), &sig) {
            Ok(()) => Ok(new_key),
            Err(_) => Err(RustCoreError::InvalidSignature),
        }
    }

    /// Produce the canonical JSON that was signed (all fields except signature).
    fn to_canonical_json(&self) -> String {
        let value = serde_json::json!({
            "effectiveFrom": self.effective_from,
            "newPublicKey": self.new_public_key,
            "previousKeyId": self.previous_key_id,
            "purpose": self.purpose.to_string(),
            "rotationReason": self.rotation_reason,
            "type": self.cert_type,
        });
        serde_json::to_string(&value).unwrap_or_default()
    }
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

    fn make_cert(
        root_ca_sk: &SigningKey,
        new_pk: &[u8; 32],
        purpose: &KeyPurpose,
        effective_from: &str,
    ) -> RotationCertificate {
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let new_pk_b64 = engine.encode(new_pk);

        let cert_value = serde_json::json!({
            "effectiveFrom": effective_from,
            "newPublicKey": new_pk_b64,
            "previousKeyId": "abc123",
            "purpose": purpose.to_string(),
            "rotationReason": "scheduled",
            "type": "key_rotation",
        });
        let cert_json = serde_json::to_string(&cert_value).unwrap();
        let sig = root_ca_sk.sign(cert_json.as_bytes());
        let sig_b64 = engine.encode(sig.to_bytes());

        RotationCertificate {
            cert_type: "key_rotation".to_string(),
            new_public_key: new_pk_b64,
            effective_from: effective_from.to_string(),
            previous_key_id: "abc123".to_string(),
            rotation_reason: "scheduled".to_string(),
            purpose: purpose.clone(),
            root_ca_signature: sig_b64,
        }
    }

    #[test]
    fn rotation_cert_verify_with_correct_root_ca() {
        let (root_ca_sk, root_ca_pk) = generate_keypair();
        let (_new_sk, new_pk) = generate_keypair();

        let cert = make_cert(
            &root_ca_sk,
            &new_pk,
            &KeyPurpose::License,
            "2026-01-01T00:00:00Z",
        );

        let result = cert.verify_with_key(&root_ca_pk);
        assert!(result.is_ok(), "valid rotation cert should verify");
        assert_eq!(result.unwrap(), new_pk);
    }

    #[test]
    fn rotation_cert_rejects_wrong_root_ca() {
        let (root_ca_sk, _root_ca_pk) = generate_keypair();
        let (_new_sk, new_pk) = generate_keypair();
        let (_, wrong_pk) = generate_keypair();

        let cert = make_cert(
            &root_ca_sk,
            &new_pk,
            &KeyPurpose::License,
            "2026-01-01T00:00:00Z",
        );

        let result = cert.verify_with_key(&wrong_pk);
        assert!(matches!(result, Err(RustCoreError::InvalidSignature)));
    }

    #[test]
    fn rotation_cert_rejects_future_effective_date() {
        let (root_ca_sk, root_ca_pk) = generate_keypair();
        let (_new_sk, new_pk) = generate_keypair();

        let cert = make_cert(
            &root_ca_sk,
            &new_pk,
            &KeyPurpose::Update,
            "2099-12-31T23:59:59Z",
        );

        let result = cert.verify_with_key(&root_ca_pk);
        assert!(matches!(result, Err(RustCoreError::InvalidPayload)));
    }

    #[test]
    fn key_purpose_license_serialization() {
        assert_eq!(
            serde_json::to_string(&KeyPurpose::License).unwrap(),
            r#""license-signing""#
        );
    }

    #[test]
    fn key_purpose_update_serialization() {
        assert_eq!(
            serde_json::to_string(&KeyPurpose::Update).unwrap(),
            r#""update-signing""#
        );
    }

    #[test]
    fn cert_to_canonical_json_includes_purpose() {
        let (_root_ca_sk, _root_ca_pk) = generate_keypair();
        let (_new_sk, new_pk) = generate_keypair();
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let new_pk_b64 = engine.encode(new_pk);

        let cert = RotationCertificate {
            cert_type: "key_rotation".to_string(),
            new_public_key: new_pk_b64,
            effective_from: "2026-01-01T00:00:00Z".to_string(),
            previous_key_id: "abc123".to_string(),
            rotation_reason: "scheduled".to_string(),
            purpose: KeyPurpose::Update,
            root_ca_signature: "AAAA".to_string(),
        };

        let json = cert.to_canonical_json();
        assert!(
            json.contains(r#""purpose":"update-signing""#),
            "canonical JSON should include purpose field"
        );
    }
}
