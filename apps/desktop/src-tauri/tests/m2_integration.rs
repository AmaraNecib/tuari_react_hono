//! M2.7 — Milestone Integration Tests
//!
//! End-to-end tests verifying the full update lifecycle.

#[cfg(test)]
mod update_integration_tests {
    use app_lib::update::{self, UpdateStrategy, UpdateProvider};
    use ed25519_dalek::{Signer, SigningKey};
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
    fn signed_manifest_format_compatibility() {
        // Verifies that the signed manifest format
        // (<base64url(canonical_json)>.<base64url(signature)>) with unpadded
        // base64url (matching the CLI output) can be verified by Rust.
        use base64::Engine;
        // URL_SAFE_NO_PAD matches the CLI's no-padding output
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;

        // Generate a keypair
        let sk = SigningKey::generate(&mut rand::rngs::OsRng);
        let pk = sk.verifying_key().to_bytes();

        // Create a manifest with canonical JSON (sorted keys)
        let canonical_json = r#"{"checksum":"abc","files":[{"hash":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","path":"app.exe","size":12345}],"minSupportedVersion":"0.1.0","platform":"windows-x86_64","version":"2.0.0"}"#;
        let canonical_bytes = canonical_json.as_bytes();

        // Sign with Rust (simulating what the CLI does)
        let sig = sk.sign(canonical_bytes);
        let sig_bytes = sig.to_bytes();

        // Format as <base64url(canonical_json)>.<base64url(signature)>
        let encoded_json = engine.encode(canonical_bytes);
        let encoded_sig = engine.encode(sig_bytes);
        let signed_format = format!("{}.{}", encoded_json, encoded_sig);

        // Now verify by parsing the signed format
        let parts: Vec<&str> = signed_format.splitn(2, '.').collect();
        assert_eq!(parts.len(), 2);

        let decoded_json = engine.decode(parts[0]).unwrap();
        let decoded_sig: [u8; 64] = engine.decode(parts[1]).unwrap().try_into().unwrap();

        // Verify with the Rust function
        assert!(update::verify_package_signature(&pk, &decoded_json, &decoded_sig).is_ok());

        // Verify it also parses correctly
        let parsed = update::parse_update_manifest(&decoded_json).unwrap();
        assert_eq!(parsed.version, "2.0.0");
        assert_eq!(parsed.files.len(), 1);
        assert_eq!(parsed.files[0].path, "app.exe");
    }

    #[test]
    fn provider_strategy_engine_interaction() {
        // Test that provider and strategy traits work together
        let provider = update::NoopProvider;
        let strategy = update::FullReplaceStrategy::new(&PathBuf::from("/tmp"));

        // Provider says no update
        let info = provider.check_for_updates("1.0.0").unwrap();
        assert!(info.is_none());

        // Strategy stub returns failure (not yet implemented)
        let result = strategy.apply_update(&PathBuf::from("/tmp/pkg")).unwrap();
        assert!(!result.success, "stub should return failure to avoid misleading users");
        let rollback = strategy.rollback().unwrap();
        assert!(rollback.success);
    }

    #[test]
    fn file_lock_prevents_concurrent_updates() {
        let dir = temp_dir();
        let lock = app_lib::update::UpdateFileLock::new(&dir.join("update.lock"));
        assert!(lock.acquire().is_ok());
        // Second acquire should fail
        let lock2 = app_lib::update::UpdateFileLock::new(&dir.join("update.lock"));
        assert!(lock2.acquire().is_err());
        lock.release().unwrap();
        assert!(lock2.acquire().is_ok(), "should be able to acquire after release");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    #[ignore = "requires Node.js in PATH"]
    fn cli_signed_manifest_rust_verification() {
        // End-to-end test: sign with the Node.js CLI, verify with Rust.
        // This requires Node.js to be available in PATH.
        use base64::Engine;
        use std::process::Command;
        use std::fs;
        // URL_SAFE_NO_PAD because the Node.js CLI produces unpadded base64url
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;

        let tmp = temp_dir();
        fs::create_dir_all(&tmp).unwrap();

        // Generate a keypair using Node.js
        let output = Command::new(if cfg!(target_os = "windows") { "node.exe" } else { "node" })
            .args(["-e", &format!(
                r#"
                const crypto = require('node:crypto');
                const fs = require('node:fs');
                const {{ publicKey, privateKey }} = crypto.generateKeyPairSync('ed25519');
                fs.writeFileSync('{0}/key.pem', privateKey.export({{type:'pkcs8',format:'pem'}}));
                fs.writeFileSync('{0}/pubkey.pem', publicKey.export({{type:'spki',format:'pem'}}));
                const pubDer = publicKey.export({{type:'spki',format:'der'}});
                const rawPub = pubDer.slice(-32);
                console.log('PUB:' + Array.from(rawPub).join(','));
                "#,
                tmp.display().to_string().replace("\\", "/")
            )])
            .output()
            .expect("Node.js is required for this integration test");

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            panic!("Failed to generate keypair via Node.js: {stderr}");
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let pub_key_line = stdout.lines().find(|l| l.starts_with("PUB:")).unwrap();
        let pub_key_bytes: Vec<u8> = pub_key_line.strip_prefix("PUB:")
            .unwrap()
            .split(',')
            .map(|s| s.parse::<u8>().unwrap())
            .collect();
        let public_key: [u8; 32] = pub_key_bytes.try_into().unwrap();

        // Create manifest
        let manifest_json = r#"{"version":"99.99.99","platform":"integration-test","minSupportedVersion":"0.0.1","checksum":"cross-lang-test","files":[{"path":"test.exe","hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","size":123}]}"#;
        let manifest_path = tmp.join("manifest.json");
        fs::write(&manifest_path, manifest_json).unwrap();

        // Find the script directory (relative to CARGO_MANIFEST_DIR)
        // CARGO_MANIFEST_DIR is apps/desktop/src-tauri, go up 3 levels to project root
        let project_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent().unwrap()
            .parent().unwrap()
            .parent().unwrap();
        let script_path = project_root.join("scripts").join("sign-update.mjs");

        // Sign with CLI
        let output_path = tmp.join("manifest.signed");
        let sign_output = Command::new(if cfg!(target_os = "windows") { "node.exe" } else { "node" })
            .args([
                script_path.to_str().unwrap(),
                "--private-key",
                tmp.join("key.pem").to_str().unwrap(),
                "--manifest",
                manifest_path.to_str().unwrap(),
                "--output",
                output_path.to_str().unwrap(),
            ])
            .output()
            .expect("Failed to run sign-update.mjs");

        if !sign_output.status.success() {
            let stderr = String::from_utf8_lossy(&sign_output.stderr);
            panic!("sign-update.mjs failed: {stderr}");
        }

        // Read signed manifest
        let signed_content = fs::read_to_string(&output_path).unwrap();
        let signed_content = signed_content.trim();

        // Parse the signed format: <base64url(json)>.<base64url(sig)>
        let parts: Vec<&str> = signed_content.splitn(2, '.').collect();
        assert_eq!(parts.len(), 2, "Signed manifest should have format <json>.<sig>");

        let decoded_json = engine.decode(parts[0]).unwrap();
        let decoded_sig_bytes = engine.decode(parts[1]).unwrap();
        let decoded_sig: [u8; 64] = decoded_sig_bytes.try_into().unwrap();

        // Verify with Rust
        let result = update::verify_package_signature(&public_key, &decoded_json, &decoded_sig);
        assert!(result.is_ok(), "CLI-signed manifest should be verifiable by Rust: {:?}", result);

        // Also verify the manifest parses correctly
        let parsed = update::parse_update_manifest(&decoded_json).unwrap();
        assert_eq!(parsed.version, "99.99.99");
        assert_eq!(parsed.platform, "integration-test");

        // Cleanup
        fs::remove_dir_all(&tmp).unwrap();
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
