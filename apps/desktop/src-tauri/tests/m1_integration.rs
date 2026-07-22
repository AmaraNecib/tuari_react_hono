//! M1.10 — Milestone Integration Tests
//!
//! End-to-end tests verifying all M1 modules work together.

#[cfg(test)]
mod integration_tests {
    use app_lib::license::{LicenseManager, LicenseStatus};
    use app_lib::clock;
    use app_lib::error::RustCoreError;
    use ed25519_dalek::Signer;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("tuari-m1-integration-{nanos}"))
    }

    /// License lifecycle: create manager with known keys, activate, verify status
    #[test]
    fn license_lifecycle() {
        let sk = ed25519_dalek::SigningKey::generate(&mut rand::rngs::OsRng);
        let pk = sk.verifying_key().to_bytes();
        let manager = LicenseManager::with_keys(vec![pk]);

        use base64::Engine;
        let engine = base64::engine::general_purpose::URL_SAFE;
        let payload = serde_json::json!({
            "licenseId": "LCE-20260701-INTEG01",
            "issuedTo": "Integration Co",
            "email": "integ@test.com",
            "edition": "enterprise",
            "features": ["encrypted_db", "lan_server"],
            "maxUsers": 0,
            "validFrom": "2020-01-01T00:00:00Z",
            "validUntil": "2099-01-01T00:00:00Z",
            "licenseType": "perpetual"
        });
        let payload_bytes = serde_json::to_vec(&payload).unwrap();
        let sig = sk.sign(&payload_bytes);
        let content = format!("{}.{}", engine.encode(&payload_bytes), engine.encode(sig.to_bytes()));

        let result = manager.activate(&content);
        assert!(result.is_ok(), "activation should succeed");
        assert_eq!(manager.edition(), "enterprise");
        assert!(manager.has_feature("encrypted_db"));
    }

    /// Clock consistency check works with LicenseManager
    #[test]
    fn clock_and_license_interaction() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();

        // First call creates clock tracker
        let status = clock::check_clock_consistency(&dir).unwrap();
        assert_eq!(status, clock::ClockStatus::Trusted);

        // LicenseManager also calls clock check
        let manager = LicenseManager::initialize(&dir).unwrap();
        assert_eq!(manager.status(), LicenseStatus::Grace);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// Rotation certificate verification (standalone)
    #[test]
    fn rotation_cert_verification() {
        use app_lib::trust::RotationCertificate;
        // Generate a CA keypair (ca_sk and ca_pk from the SAME keypair)
        let ca_sk = ed25519_dalek::SigningKey::generate(&mut rand::rngs::OsRng);
        let ca_pk = ca_sk.verifying_key().to_bytes();
        // Generate a new signing keypair to be certified
        let new_sk = ed25519_dalek::SigningKey::generate(&mut rand::rngs::OsRng);
        let new_pk = new_sk.verifying_key().to_bytes();

        use base64::Engine;
        // URL_SAFE_NO_PAD matches the trust module's unpadded convention
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let new_pk_b64 = engine.encode(new_pk);

        let cert_value = serde_json::json!({
            "effectiveFrom": "2020-01-01T00:00:00Z",
            "newPublicKey": new_pk_b64,
            "previousKeyId": "abc123",
            "purpose": "license-signing",
            "rotationReason": "scheduled",
            "type": "key_rotation",
        });
        let cert_json = serde_json::to_string(&cert_value).unwrap();
        let sig = ca_sk.sign(cert_json.as_bytes());

        let cert = RotationCertificate {
            cert_type: "key_rotation".to_string(),
            new_public_key: new_pk_b64,
            effective_from: "2020-01-01T00:00:00Z".to_string(),
            previous_key_id: "abc123".to_string(),
            rotation_reason: "scheduled".to_string(),
            purpose: app_lib::trust::KeyPurpose::License,
            root_ca_signature: engine.encode(sig.to_bytes()),
        };

        let result = cert.verify_with_key(&ca_pk);
        assert!(result.is_ok(), "valid rotation cert should verify");
    }

    /// Error types are consistent across modules
    #[test]
    fn error_type_consistency() {
        // All core modules use RustCoreError
        let io_err = RustCoreError::IoError(Box::new(std::io::Error::new(std::io::ErrorKind::Other, "test")));
        assert!(format!("{io_err}").contains("I/O error"));
    }
}
