//! M2.7 — Milestone Integration Tests
//!
//! End-to-end tests verifying the full update lifecycle.

#[cfg(test)]
mod update_integration_tests {
    use app_lib::update::{self, UpdateStrategy, UpdateProvider, MigrationRunner};
    use ed25519_dalek::{Signer, SigningKey};
    use rand_core::CryptoRngCore;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("tuari-m2-integration-{nanos}"))
    }

    #[test]
    fn full_update_lifecycle() {
        // Generate a signing keypair
        let sk = SigningKey::generate(&mut rand::rngs::OsRng);
        let pk = sk.verifying_key().to_bytes();

        // Create a signed manifest
        let manifest = r#"{"version":"2.0.0","platform":"windows-x86_64","minSupportedVersion":"0.1.0","checksum":"abc","files":[]}"#;
        let sig = sk.sign(manifest.as_bytes());
        let sig_bytes = sig.to_bytes();

        // Verify the signature
        assert!(update::verify_package_signature(&pk, manifest.as_bytes(), &sig_bytes).is_ok());

        // Parse the manifest
        let parsed = update::parse_update_manifest(manifest.as_bytes()).unwrap();
        assert_eq!(parsed.version, "2.0.0");
    }

    #[test]
    fn provider_strategy_engine_interaction() {
        // Test that provider and strategy traits work together
        let provider = update::NoopProvider;
        let strategy = update::FullReplaceStrategy::new(&PathBuf::from("/tmp"));

        // Provider says no update
        let info = provider.check_for_updates("1.0.0").unwrap();
        assert!(info.is_none());

        // Strategy applies and can roll back
        let result = strategy.apply_update(&PathBuf::from("/tmp/pkg")).unwrap();
        assert!(result.success);
        let rollback = strategy.rollback().unwrap();
        assert!(rollback.success);
    }

    #[test]
    fn migration_runner_rollback() {
        let migrations = vec![
            update::Migration {
                version: "001".to_string(),
                description: "create users".to_string(),
                sql_up: "CREATE TABLE users".to_string(),
                sql_down: Some("DROP TABLE users".to_string()),
            },
            update::Migration {
                version: "002".to_string(),
                description: "add email".to_string(),
                sql_up: "ALTER TABLE users ADD email TEXT".to_string(),
                sql_down: Some("ALTER TABLE users DROP COLUMN email".to_string()),
            },
        ];
        let mut output = Vec::new();
        let applied = update::MigrationRunner::run_migrations(&mut output, &migrations, "0.0.0").unwrap();
        assert_eq!(applied.len(), 2);

        let rolled_back = update::MigrationRunner::rollback_migrations(&mut output, &migrations, 1).unwrap();
        assert_eq!(rolled_back.len(), 1);
        assert_eq!(rolled_back[0], "002");
    }
}
