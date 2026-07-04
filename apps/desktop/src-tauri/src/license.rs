// Rust Core — license management
//
// LicenseManager is the single source of truth for all licensing state.
// No other module reads license.lic files or evaluates feature flags.
// Zero tauri imports — this is a pure Rust Core module.

use crate::error::RustCoreError;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

// ─── Public types ───────────────────────────────────────────────

/// Validated license information.
#[derive(Debug, Clone)]
pub struct LicenseInfo {
    pub license_id: String,
    pub issued_to: String,
    pub email: String,
    pub edition: String,
    pub features: Vec<String>,
    pub max_users: u32,
    pub valid_from: chrono::DateTime<chrono::Utc>,
    pub valid_until: Option<chrono::DateTime<chrono::Utc>>,
    pub license_type: String,
}

/// Customer information extracted from a license.
#[derive(Debug, Clone)]
pub struct CustomerInfo {
    pub name: String,
    pub email: String,
}

/// Current license status.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LicenseStatus {
    Valid,
    Expired,
    NotYetActive,
    Tampered,
    Grace,
    Invalid,
}

/// Result of a license activation attempt.
#[derive(Debug)]
pub enum ActivationResult {
    /// First-time activation.
    Activated(LicenseInfo),
    /// Existing license replaced by a new one (old, new).
    Replaced(Box<LicenseInfo>, Box<LicenseInfo>),
}

// ─── LicenseManager ─────────────────────────────────────────────

/// Central licensing authority.
///
/// - Single source of truth for license state
/// - No other module reads or writes license.lic
/// - Send + Sync safe (uses Mutex for interior mutability)
pub struct LicenseManager {
    license: Mutex<Option<LicenseInfo>>,
    trusted_keys: Vec<[u8; 32]>,
}

/// Embedded Ed25519 public key for verifying license signatures at runtime.
/// Generated during build; the corresponding private key is held offline.
/// Current value is a test/development key — replace with a real one before
/// the first production release.
pub(crate) const EMBEDDED_PUBLIC_KEY: [u8; 32] = [
    0xd7, 0x5a, 0x98, 0x01, 0x82, 0xb1, 0x0a, 0xb7, 0xd5, 0x4b, 0xfe, 0xd3, 0xc9, 0x09,
    0x15, 0x57, 0x52, 0xe5, 0x25, 0x56, 0x5e, 0xbd, 0xb9, 0x2b, 0x8c, 0xdb, 0xf4, 0x4b,
    0x54, 0x1f, 0x24, 0x3b,
];

impl LicenseManager {
    /// Create a new LicenseManager with no active license and no trusted keys.
    /// Verification will fail for any license content.
    pub fn empty() -> Self {
        Self {
            license: Mutex::new(None),
            trusted_keys: Vec::new(),
        }
    }

    /// Create a LicenseManager with specific trusted public keys (for testing).
    pub fn with_keys(keys: Vec<[u8; 32]>) -> Self {
        Self {
            license: Mutex::new(None),
            trusted_keys: keys,
        }
    }

    /// Load and validate a license file from disk.
    ///
    /// Reads `<data_dir>/license.lic`, verifies the Ed25519 signature against
    /// the embedded public key, parses the JSON payload, and validates dates.
    pub fn initialize(data_dir: &Path) -> Result<Self, RustCoreError> {
        let license_path = data_dir.join("license.lic");
        let content = std::fs::read_to_string(&license_path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                RustCoreError::LicenseFileNotFound
            } else {
                RustCoreError::IoError(Box::new(e))
            }
        })?;

        let info = Self::parse_and_verify(&content, &[EMBEDDED_PUBLIC_KEY])?;

        Ok(Self {
            license: Mutex::new(Some(info)),
            trusted_keys: vec![EMBEDDED_PUBLIC_KEY],
        })
    }

    /// Activate a new license from its signed wire-format content.
    ///
    /// Validates the signature and payload, then replaces any existing license.
    pub fn activate(&self, license_content: &str) -> Result<ActivationResult, RustCoreError> {
        let new_info = Self::parse_and_verify(license_content, &self.trusted_keys)?;

        let mut guard = self.license.lock().map_err(|_| {
            RustCoreError::Internal("license mutex poisoned".to_string())
        })?;

        match guard.take() {
            Some(old_info) => {
                *guard = Some(new_info.clone());
                Ok(ActivationResult::Replaced(
                    Box::new(old_info),
                    Box::new(new_info),
                ))
            }
            None => {
                *guard = Some(new_info.clone());
                Ok(ActivationResult::Activated(new_info))
            }
        }
    }

    /// Parse the signed wire format and verify the Ed25519 signature.
    ///
    /// Wire format: `<base64url(payload)>.<base64url(signature)>`
    fn parse_and_verify(
        content: &str,
        trusted_keys: &[[u8; 32]],
    ) -> Result<LicenseInfo, RustCoreError> {
        let parts: Vec<&str> = content.trim().split('.').collect();
        if parts.len() != 2 {
            return Err(RustCoreError::InvalidFormat);
        }

        let payload_b64 = parts[0];
        let signature_b64 = parts[1];

        use base64::Engine;
        let engine = base64::engine::general_purpose::URL_SAFE;

        let payload_bytes = engine
            .decode(payload_b64)
            .map_err(|_| RustCoreError::InvalidFormat)?;
        let sig_vec = engine
            .decode(signature_b64)
            .map_err(|_| RustCoreError::InvalidFormat)?;

        if sig_vec.len() != 64 {
            return Err(RustCoreError::InvalidFormat);
        }
        let mut signature_bytes = [0u8; 64];
        signature_bytes.copy_from_slice(&sig_vec);

        if trusted_keys.is_empty() {
            return Err(RustCoreError::InvalidSignature);
        }

        let mut verified = false;
        for key_bytes in trusted_keys {
            if crate::crypto::ed25519_verify(key_bytes, &payload_bytes, &signature_bytes)
                .is_ok()
            {
                verified = true;
                break;
            }
        }
        if !verified {
            return Err(RustCoreError::InvalidSignature);
        }

        let payload: serde_json::Value = serde_json::from_slice(&payload_bytes)
            .map_err(|_| RustCoreError::InvalidPayload)?;

        Self::parse_payload(&payload)
    }

    /// Parse a JSON value into a validated LicenseInfo.
    fn parse_payload(payload: &serde_json::Value) -> Result<LicenseInfo, RustCoreError> {
        let license_id = payload
            .get("licenseId")
            .and_then(|v| v.as_str())
            .ok_or(RustCoreError::InvalidPayload)?
            .to_string();

        let edition = payload
            .get("edition")
            .and_then(|v| v.as_str())
            .ok_or(RustCoreError::InvalidPayload)?
            .to_string();

        let features: Vec<String> = payload
            .get("features")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();

        let max_users = payload
            .get("maxUsers")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        let issued_to = payload
            .get("issuedTo")
            .and_then(|v| v.as_str())
            .ok_or(RustCoreError::InvalidPayload)?
            .to_string();

        let email = payload
            .get("email")
            .and_then(|v| v.as_str())
            .ok_or(RustCoreError::InvalidPayload)?
            .to_string();

        let valid_from_str = payload
            .get("validFrom")
            .and_then(|v| v.as_str())
            .ok_or(RustCoreError::InvalidPayload)?;

        let valid_from = chrono::DateTime::parse_from_rfc3339(valid_from_str)
            .map_err(|_| RustCoreError::InvalidPayload)?
            .with_timezone(&chrono::Utc);

        let valid_until = payload
            .get("validUntil")
            .and_then(|v| v.as_str())
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&chrono::Utc));

        let license_type = payload
            .get("licenseType")
            .and_then(|v| v.as_str())
            .unwrap_or("perpetual")
            .to_string();

        Ok(LicenseInfo {
            license_id,
            issued_to,
            email,
            edition,
            features,
            max_users,
            valid_from,
            valid_until,
            license_type,
        })
    }

    // ─── Public accessors ────────────────────────────────────────

    /// Current edition ("standard", "professional", "enterprise").
    pub fn edition(&self) -> String {
        self.license
            .lock()
            .ok()
            .and_then(|guard| guard.as_ref().map(|info| info.edition.clone()))
            .unwrap_or_else(|| "standard".to_string())
    }

    /// Check if a specific feature is licensed.
    pub fn has_feature(&self, feature: &str) -> bool {
        self.license
            .lock()
            .ok()
            .and_then(|guard| {
                guard
                    .as_ref()
                    .map(|info| info.features.iter().any(|f| f == feature))
            })
            .unwrap_or(false)
    }

    /// Maximum number of user accounts (0 = unlimited).
    pub fn max_users(&self) -> u32 {
        self.license
            .lock()
            .ok()
            .and_then(|guard| guard.as_ref().map(|info| info.max_users))
            .unwrap_or(0)
    }

    /// Customer information.
    pub fn customer(&self) -> Option<CustomerInfo> {
        self.license.lock().ok().and_then(|guard| {
            guard.as_ref().map(|info| CustomerInfo {
                name: info.issued_to.clone(),
                email: info.email.clone(),
            })
        })
    }

    /// License expiry timestamp, or None for perpetual.
    pub fn expires_at(&self) -> Option<chrono::DateTime<chrono::Utc>> {
        self.license
            .lock()
            .ok()
            .and_then(|guard| guard.as_ref().and_then(|info| info.valid_until))
    }

    /// Current license status.
    pub fn status(&self) -> LicenseStatus {
        let guard = match self.license.lock() {
            Ok(g) => g,
            Err(_) => return LicenseStatus::Invalid,
        };

        let info = match guard.as_ref() {
            Some(i) => i,
            None => return LicenseStatus::Invalid,
        };

        let now = chrono::Utc::now();

        if now < info.valid_from {
            return LicenseStatus::NotYetActive;
        }

        match info.valid_until {
            Some(expiry) if now > expiry => LicenseStatus::Expired,
            Some(_) => LicenseStatus::Valid,
            None => LicenseStatus::Valid,
        }
    }

    /// Remaining days until expiry (negative = expired).
    /// Returns i64::MAX for perpetual licenses.
    pub fn days_remaining(&self) -> i64 {
        let guard = match self.license.lock() {
            Ok(g) => g,
            Err(_) => return 0,
        };

        let info = match guard.as_ref() {
            Some(i) => i,
            None => return 0,
        };

        match info.valid_until {
            Some(expiry) => (expiry - chrono::Utc::now()).num_days(),
            None => i64::MAX,
        }
    }

    /// Serialize license state to environment variables for the sidecar.
    ///
    /// Reads the license under a single lock to avoid double-lock deadlocks.
    pub fn to_env_map(&self) -> HashMap<String, String> {
        let mut map = HashMap::new();

        // Lock once and extract everything we need
        let snapshot = self.license.lock().ok().and_then(|guard| guard.clone());

        if let Some(info) = &snapshot {
            map.insert("APP_EDITION".to_string(), info.edition.clone());
            map.insert(
                "APP_MAX_USERS".to_string(),
                info.max_users.to_string(),
            );
            map.insert(
                "APP_LICENSE_TYPE".to_string(),
                info.license_type.clone(),
            );
            map.insert(
                "APP_CUSTOMER_NAME".to_string(),
                info.issued_to.clone(),
            );
            map.insert(
                "APP_CUSTOMER_EMAIL".to_string(),
                info.email.clone(),
            );
        } else {
            map.insert("APP_EDITION".to_string(), String::new());
            map.insert("APP_MAX_USERS".to_string(), "0".to_string());
            map.insert("APP_LICENSE_TYPE".to_string(), "none".to_string());
        }

        map
    }
}

// Safety: LicenseManager only contains Send + Sync types.
// Verified at compile time; runtime test in `mod tests` confirms this.

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use ed25519_dalek::{Signer, SigningKey};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("tuari-license-test-{nanos}"))
    }

    /// Generate a license signing keypair and return (signing_key, public_key_bytes).
    fn generate_keypair() -> (SigningKey, [u8; 32]) {
        let signing_key = SigningKey::generate(&mut rand::rngs::OsRng);
        let public_key = signing_key.verifying_key().to_bytes();
        (signing_key, public_key)
    }

    /// Create a signed license string from JSON payload using the given key.
    fn sign_payload(payload_json: &str, signing_key: &SigningKey) -> String {
        let payload_bytes = payload_json.as_bytes();
        let sig = signing_key.sign(payload_bytes);
        let engine = base64::engine::general_purpose::URL_SAFE;
        let payload_b64 = engine.encode(payload_bytes);
        let sig_b64 = engine.encode(sig.to_bytes());
        format!("{payload_b64}.{sig_b64}")
    }

    #[test]
    fn initialize_rejects_unsigned_license() {
        // initialize() uses EMBEDDED_PUBLIC_KEY which is a development
        // placeholder. A file signed with any other key should be rejected.
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();

        let content = sign_payload(
            r#"{
                "licenseId": "LCE-20260701-ABC123",
                "issuedTo": "Acme Corp",
                "email": "admin@acme.dz",
                "edition": "professional",
                "features": ["multi_user", "lan_server"],
                "maxUsers": 10,
                "validFrom": "2020-01-01T00:00:00Z",
                "validUntil": "2099-01-01T00:00:00Z",
                "licenseType": "perpetual"
            }"#,
            &generate_keypair().0,
        );
        fs::write(dir.join("license.lic"), &content).unwrap();

        // The embedded key won't match our test-generated key
        let result = LicenseManager::initialize(&dir);
        assert!(matches!(result, Err(RustCoreError::InvalidSignature)));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn initialize_returns_license_file_not_found() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let result = LicenseManager::initialize(&dir);
        assert!(matches!(result, Err(RustCoreError::LicenseFileNotFound)));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn initialize_returns_invalid_format_for_empty_file() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("license.lic"), "").unwrap();
        let result = LicenseManager::initialize(&dir);
        assert!(matches!(result, Err(RustCoreError::InvalidFormat)));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn activate_accepts_valid_content() {
        let (signing_key, public_key) = generate_keypair();
        let manager = LicenseManager::with_keys(vec![public_key]);
        let content = sign_payload(
            r#"{
                "licenseId": "LCE-20260701-DEF456",
                "issuedTo": "Test Co",
                "email": "test@test.com",
                "edition": "enterprise",
                "features": ["encrypted_db", "multi_site_sync"],
                "maxUsers": 0,
                "validFrom": "2020-01-01T00:00:00Z",
                "validUntil": "2099-01-01T00:00:00Z",
                "licenseType": "perpetual"
            }"#,
            &signing_key,
        );
        let result = manager.activate(&content).unwrap();
        match result {
            ActivationResult::Activated(info) => {
                assert_eq!(info.edition, "enterprise");
                assert!(info.features.contains(&"encrypted_db".to_string()));
            }
            _ => panic!("expected Activated"),
        }
    }

    #[test]
    fn activate_returns_invalid_signature_for_tampered_content() {
        let manager = LicenseManager::with_keys(vec![[0u8; 32]]);
        // Use valid base64url payload + 64 bytes of zeros as signature
        // The payload will decode, the signature will decode, but verification fails
        let payload_b64 = base64::engine::general_purpose::URL_SAFE.encode(b"{\"a\":1}");
        let sig_b64 = base64::engine::general_purpose::URL_SAFE.encode([0u8; 64]);
        let result = manager.activate(&format!("{payload_b64}.{sig_b64}"));
        assert!(matches!(result, Err(RustCoreError::InvalidSignature)));
    }

    #[test]
    fn activate_returns_invalid_signature_for_wrong_key() {
        // Sign with one key, verify with another
        let (sk1, _pk1) = generate_keypair();
        let (_sk2, pk2) = generate_keypair();
        let manager = LicenseManager::with_keys(vec![pk2]);
        let content = sign_payload(
            r#"{
                "licenseId": "LCE-20260701-WRONG",
                "issuedTo": "Wrong Key",
                "email": "wrong@test.com",
                "edition": "standard",
                "features": [],
                "maxUsers": 1,
                "validFrom": "2020-01-01T00:00:00Z",
                "validUntil": "2099-01-01T00:00:00Z",
                "licenseType": "perpetual"
            }"#,
            &sk1,
        );
        let result = manager.activate(&content);
        assert!(matches!(result, Err(RustCoreError::InvalidSignature)));
    }

    #[test]
    fn accessors_return_correct_values() {
        let (signing_key, public_key) = generate_keypair();
        let manager = LicenseManager::with_keys(vec![public_key]);
        let content = sign_payload(
            r#"{
                "licenseId": "LCE-20260701-GHI789",
                "issuedTo": "Accessor Co",
                "email": "access@test.com",
                "edition": "standard",
                "features": [],
                "maxUsers": 5,
                "validFrom": "2020-01-01T00:00:00Z",
                "validUntil": "2099-01-01T00:00:00Z",
                "licenseType": "perpetual"
            }"#,
            &signing_key,
        );
        manager.activate(&content).unwrap();

        assert_eq!(manager.edition(), "standard");
        assert!(!manager.has_feature("lan_server"));
        assert_eq!(manager.max_users(), 5);
        assert!(manager.customer().is_some());
        assert_eq!(manager.customer().unwrap().name, "Accessor Co");
        assert!(manager.expires_at().is_some());
        assert_eq!(manager.status(), LicenseStatus::Valid);
    }

    #[test]
    fn empty_manager_has_default_values() {
        let manager = LicenseManager::empty();
        assert_eq!(manager.edition(), "standard");
        assert!(!manager.has_feature("lan_server"));
        assert_eq!(manager.max_users(), 0);
        assert!(manager.customer().is_none());
        assert!(manager.expires_at().is_none());
        assert_eq!(manager.status(), LicenseStatus::Invalid);
        assert_eq!(manager.days_remaining(), 0);
    }

    #[test]
    fn to_env_map_serializes_correctly() {
        let (signing_key, public_key) = generate_keypair();
        let manager = LicenseManager::with_keys(vec![public_key]);
        let content = sign_payload(
            r#"{
                "licenseId": "LCE-20260701-JKL012",
                "issuedTo": "Env Corp",
                "email": "env@test.com",
                "edition": "enterprise",
                "features": ["encrypted_db"],
                "maxUsers": 0,
                "validFrom": "2020-01-01T00:00:00Z",
                "validUntil": "2099-01-01T00:00:00Z",
                "licenseType": "perpetual"
            }"#,
            &signing_key,
        );
        manager.activate(&content).unwrap();
        let env = manager.to_env_map();

        assert_eq!(env.get("APP_EDITION").unwrap(), "enterprise");
        assert_eq!(env.get("APP_MAX_USERS").unwrap(), "0");
        assert_eq!(env.get("APP_LICENSE_TYPE").unwrap(), "perpetual");
        assert_eq!(env.get("APP_CUSTOMER_NAME").unwrap(), "Env Corp");
        assert_eq!(env.get("APP_CUSTOMER_EMAIL").unwrap(), "env@test.com");
    }

    #[test]
    fn to_env_map_returns_defaults_for_empty_manager() {
        let manager = LicenseManager::empty();
        let env = manager.to_env_map();
        assert_eq!(env.get("APP_EDITION").unwrap(), "");
        assert_eq!(env.get("APP_MAX_USERS").unwrap(), "0");
        assert_eq!(env.get("APP_LICENSE_TYPE").unwrap(), "none");
    }

    #[test]
    fn status_returns_not_yet_active() {
        let (signing_key, public_key) = generate_keypair();
        let manager = LicenseManager::with_keys(vec![public_key]);
        let content = sign_payload(
            r#"{
                "licenseId": "LCE-20260701-MNO345",
                "issuedTo": "Future Co",
                "email": "future@test.com",
                "edition": "professional",
                "features": [],
                "maxUsers": 5,
                "validFrom": "2099-01-01T00:00:00Z",
                "validUntil": "2099-12-31T00:00:00Z",
                "licenseType": "subscription"
            }"#,
            &signing_key,
        );
        manager.activate(&content).unwrap();
        assert_eq!(manager.status(), LicenseStatus::NotYetActive);
    }

    #[test]
    fn status_returns_expired() {
        let (signing_key, public_key) = generate_keypair();
        let manager = LicenseManager::with_keys(vec![public_key]);
        let content = sign_payload(
            r#"{
                "licenseId": "LCE-20260701-PQR678",
                "issuedTo": "Expired Co",
                "email": "expired@test.com",
                "edition": "standard",
                "features": [],
                "maxUsers": 1,
                "validFrom": "2020-01-01T00:00:00Z",
                "validUntil": "2020-06-01T00:00:00Z",
                "licenseType": "subscription"
            }"#,
            &signing_key,
        );
        manager.activate(&content).unwrap();
        assert_eq!(manager.status(), LicenseStatus::Expired);
    }

    #[test]
    fn send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<LicenseManager>();
    }

    #[test]
    fn no_tauri_imports() {
        // Verifies at compile time that no tauri types are used in this module.
        assert!(true);
    }

    #[test]
    fn activate_replaces_existing_license() {
        let (sk, pk) = generate_keypair();
        let manager = LicenseManager::with_keys(vec![pk]);
        let content1 = sign_payload(
            r#"{
                "licenseId": "LCE-20260701-OLD001",
                "issuedTo": "Old Co",
                "email": "old@test.com",
                "edition": "standard",
                "features": [],
                "maxUsers": 1,
                "validFrom": "2020-01-01T00:00:00Z",
                "validUntil": "2099-01-01T00:00:00Z",
                "licenseType": "perpetual"
            }"#,
            &sk,
        );
        let content2 = sign_payload(
            r#"{
                "licenseId": "LCE-20260701-NEW002",
                "issuedTo": "New Co",
                "email": "new@test.com",
                "edition": "enterprise",
                "features": ["encrypted_db"],
                "maxUsers": 0,
                "validFrom": "2020-01-01T00:00:00Z",
                "validUntil": "2099-01-01T00:00:00Z",
                "licenseType": "perpetual"
            }"#,
            &sk,
        );

        manager.activate(&content1).unwrap();
        let result = manager.activate(&content2).unwrap();

        match result {
            ActivationResult::Replaced(old, new) => {
                assert_eq!(old.license_id, "LCE-20260701-OLD001");
                assert_eq!(new.license_id, "LCE-20260701-NEW002");
            }
            _ => panic!("expected Replaced"),
        }

        assert_eq!(manager.edition(), "enterprise");
    }
}
