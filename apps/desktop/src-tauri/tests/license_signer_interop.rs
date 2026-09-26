//! Cross-language interop: mint with the Node signer, verify with the Rust verifier.
//!
//! `scripts/generate-license.mjs` is the vendor's only issuance path, so a
//! change there can silently break the wire contract the desktop app enforces.
//! This test signs with a throwaway keypair generated here (never the vendor
//! key) and runs the minted license through the same `LicenseManager` the app
//! uses. It requires Node.js in PATH, which CI and every dev checkout have.
//!
//! The rust-only unit tests in `src/license.rs` prove the verifier; this proves
//! the signer still produces what the verifier accepts.

#[cfg(test)]
mod license_signer_interop {
    use app_lib::license::{ActivationResult, LicenseManager};
    use std::path::{Path, PathBuf};
    use std::process::{Command, Output};
    use std::time::{SystemTime, UNIX_EPOCH};

    const GENERATE_KEYPAIR_JS: &str = r#"
        const crypto = require('node:crypto');
        const fs = require('node:fs');
        const path = require('node:path');
        const dir = process.argv[1];
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
        fs.writeFileSync(path.join(dir, 'key.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }));
        const rawPub = publicKey.export({ type: 'spki', format: 'der' }).slice(-32);
        console.log('PUB:' + Array.from(rawPub).join(','));
    "#;

    fn node_bin() -> &'static str {
        if cfg!(target_os = "windows") {
            "node.exe"
        } else {
            "node"
        }
    }

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("tuari-license-interop-{nanos}"))
    }

    fn repo_root() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .to_path_buf()
    }

    fn run_node(args: &[&str]) -> Output {
        Command::new(node_bin())
            .args(args)
            .output()
            .unwrap_or_else(|e| panic!("Node.js is required for this interop test: {e}"))
    }

    /// Generate an Ed25519 keypair with Node and return the raw public key.
    fn generate_test_keypair(dir: &Path) -> [u8; 32] {
        let output = run_node(&[
            "-e",
            GENERATE_KEYPAIR_JS,
            dir.to_str().unwrap(),
        ]);
        assert!(
            output.status.success(),
            "keypair generation failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );

        let stdout = String::from_utf8_lossy(&output.stdout);
        let line = stdout
            .lines()
            .find(|l| l.starts_with("PUB:"))
            .expect("keypair script must print PUB:");
        let bytes: Vec<u8> = line
            .trim_start_matches("PUB:")
            .split(',')
            .map(|s| s.parse::<u8>().unwrap())
            .collect();
        bytes.try_into().expect("public key must be 32 bytes")
    }

    fn mint(dir: &Path, extra_args: &[&str]) -> Output {
        let script = repo_root().join("scripts").join("generate-license.mjs");
        let mut args: Vec<String> = vec![
            script.to_str().unwrap().to_string(),
            "--edition".into(),
            "professional".into(),
            "--issued-to".into(),
            "Interop Co".into(),
            "--email".into(),
            "interop@example.com".into(),
            "--private-key".into(),
            dir.join("key.pem").to_str().unwrap().to_string(),
        ];
        args.extend(extra_args.iter().map(|s| s.to_string()));
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        run_node(&refs)
    }

    fn assert_activated(manager: &LicenseManager, license: &str) -> app_lib::license::LicenseInfo {
        match manager.activate(license).expect("minted license must verify") {
            ActivationResult::Activated(info) => info,
            ActivationResult::Replaced(_, _) => panic!("fresh manager must report Activated"),
        }
    }

    #[test]
    fn node_signed_license_verifies_against_rust_verifier() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        let public_key = generate_test_keypair(&dir);

        // Date-only expiry: the CLI must normalise it to RFC 3339 or the app
        // treats the license as perpetual.
        let output = mint(
            &dir,
            &[
                "--license-type",
                "trial",
                "--valid-until",
                "2027-01-01",
                "--max-users",
                "3",
            ],
        );
        assert!(
            output.status.success(),
            "mint failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );

        // Finding 4: stdout is the license and nothing else, so
        // `> customer.lic` yields a file the app accepts.
        let stdout = String::from_utf8_lossy(&output.stdout);
        let license = stdout.trim();
        assert_eq!(
            license.split('.').count(),
            2,
            "stdout must be <payload>.<signature>, got: {stdout:?}"
        );
        assert!(
            !license.chars().any(char::is_whitespace),
            "license value must not contain whitespace"
        );
        assert!(String::from_utf8_lossy(&output.stderr).contains("Generated license"));

        let manager = LicenseManager::with_keys(vec![public_key]);
        let info = assert_activated(&manager, license);
        assert_eq!(info.max_users, 3);
        assert_eq!(info.license_type, "trial");
        let expiry = info
            .valid_until
            .expect("date-only expiry must normalise to a real RFC 3339 timestamp");
        assert_eq!(expiry.to_rfc3339(), "2027-01-01T00:00:00+00:00");

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn node_signed_license_written_to_output_file_verifies() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        let public_key = generate_test_keypair(&dir);
        let out_path = dir.join("customer-license.lic");

        let output = mint(
            &dir,
            &[
                "--license-type",
                "subscription",
                "--valid-until",
                "2027-06-30T00:00:00Z",
                "--output",
                out_path.to_str().unwrap(),
            ],
        );
        assert!(
            output.status.success(),
            "mint failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(
            String::from_utf8_lossy(&output.stdout),
            "",
            "--output must not also echo the license"
        );

        let contents = std::fs::read_to_string(&out_path).unwrap();
        let manager = LicenseManager::with_keys(vec![public_key]);
        let info = assert_activated(&manager, contents.trim());
        assert_eq!(info.license_type, "subscription");
        assert!(info.valid_until.is_some());

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
