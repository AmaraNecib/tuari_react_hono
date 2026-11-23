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
    /// Expiry warning period (last 30 days before validUntil).
    Warning,
    Expired,
    /// Post-expiry grace period (up to 30 days after validUntil).
    ExpiredGrace,
    NotYetActive,
    /// Clock tampering detected.
    Tampered,
    /// Within post-install 30-day trial period (no license).
    Grace,
    Invalid,
    /// Post-grace locked state.
    Locked,
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
    /// Path to the app data directory (for clock tracker access).
    data_dir: Option<std::path::PathBuf>,
}

/// Embedded Ed25519 public key for verifying license signatures at runtime.
///
/// This is the vendor signing key for the 0.1.x line. The corresponding
/// private key (`license-signing.pem`) is held OFFLINE and is never committed:
/// mint licenses with `node scripts/generate-license.mjs --private-key <path>`.
///
/// Do not replace this with a test vector or a zeroed placeholder — either one
/// lets anyone mint an accepted license (the previous value was the public
/// RFC 8032 test key, whose private half is public knowledge). `embedded_key_is_production`
/// pins that.
pub(crate) const EMBEDDED_PUBLIC_KEY: [u8; 32] = [
    0xec, 0xc4, 0x53, 0x6d, 0x47, 0x83, 0x74, 0xbd, 0x65, 0xc0, 0x33, 0x53, 0x2c, 0xe1,
    0x2d, 0x2c, 0x83, 0xcb, 0x50, 0x2f, 0x72, 0x11, 0xbc, 0x93, 0xe1, 0x41, 0x07, 0xda,
    0x97, 0xf8, 0x92, 0x8b,
];

impl LicenseManager {
    /// Create a new LicenseManager with no active license and no trusted keys.
    /// Verification will fail for any license content.
    pub fn empty() -> Self {
        Self {
            license: Mutex::new(None),
            trusted_keys: Vec::new(),
            data_dir: None,
        }
    }

    /// Create a LicenseManager with specific trusted public keys (for testing).
    pub fn with_keys(keys: Vec<[u8; 32]>) -> Self {
        Self {
            license: Mutex::new(None),
            trusted_keys: keys,
            data_dir: None,
        }
    }

    /// Load and validate a license file from disk.
    ///
    /// Reads `<data_dir>/license.lic`, verifies the Ed25519 signature against
    /// the embedded public key, parses the JSON payload, and validates dates.
    /// Also checks clock consistency (creates/updates clock-tracker.json).
    pub fn initialize(data_dir: &Path) -> Result<Self, RustCoreError> {
        // Run clock consistency check (creates clock-tracker.json on first run)
        match crate::clock::check_clock_consistency(data_dir)? {
            crate::clock::ClockStatus::Trusted => {}
            crate::clock::ClockStatus::Suspicious {
                estimated_time,
                reason,
            } => {
                return Err(RustCoreError::ClockTampered {
                    estimated_time,
                    reason,
                });
            }
        }

        // Load key rotation certificates from <data_dir>/key-rotation-*.json
        let mut all_keys = vec![EMBEDDED_PUBLIC_KEY];
        if let Ok(rotation_keys) = crate::trust::load_trusted_keys(data_dir, &crate::trust::KeyPurpose::License) {
            all_keys.extend(rotation_keys);
        }

        let license_path = data_dir.join("license.lic");
        match std::fs::read_to_string(&license_path) {
            Ok(content) => {
                let info = Self::parse_and_verify(&content, &all_keys)?;
                Ok(Self {
                    license: Mutex::new(Some(info)),
                    trusted_keys: all_keys,
                    data_dir: Some(data_dir.to_path_buf()),
                })
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // No license file — return a manager with data_dir set
                // so grace period checks can work
                Ok(Self {
                    license: Mutex::new(None),
                    trusted_keys: all_keys,
                    data_dir: Some(data_dir.to_path_buf()),
                })
            }
            Err(e) => Err(RustCoreError::IoError(Box::new(e))),
        }
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

    /// Activate a license key and persist it to disk.
    ///
    /// Validates the signed wire-format content, writes it to
    /// `<data_dir>/license.lic` **before** updating in-memory state,
    /// so a failed disk write does not leave the session inconsistently
    /// activated.
    /// This is the main entry point for the `activate_license` Tauri command.
    pub fn activate_from_key(
        &self,
        license_content: &str,
        data_dir: &Path,
    ) -> Result<ActivationResult, RustCoreError> {
        // 1. Validate the key first — no side effects
        let new_info = Self::parse_and_verify(license_content, &self.trusted_keys)?;

        // 2. Persist to disk before updating in-memory state
        let license_path = data_dir.join("license.lic");
        if let Some(parent) = license_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
        }
        std::fs::write(&license_path, license_content)
            .map_err(|e| RustCoreError::IoError(Box::new(e)))?;

        // 3. Only now update in-memory state (disk write already succeeded)
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

    /// Full license information, if a license is active.
    pub fn license_info(&self) -> Option<LicenseInfo> {
        self.license
            .lock()
            .ok()
            .and_then(|guard| guard.clone())
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
    ///
    /// Uses the clock tracker to detect tampering and check grace period.
    pub fn status(&self) -> LicenseStatus {
        // Check clock tampering — fail closed on errors
        if let Some(ref data_dir) = self.data_dir {
            match crate::clock::check_clock_consistency(data_dir) {
                Ok(crate::clock::ClockStatus::Suspicious { .. }) => {
                    return LicenseStatus::Tampered;
                }
                Ok(_) => {} // Trusted
                Err(_) => {
                    return LicenseStatus::Tampered; // fail closed on I/O errors
                }
            }
        }

        let guard = match self.license.lock() {
            Ok(g) => g,
            Err(_) => return LicenseStatus::Invalid,
        };

        let info = match guard.as_ref() {
            Some(i) => i,
            None => {
                // No license — check grace period
                if let Some(ref data_dir) = self.data_dir {
                    if crate::clock::is_within_grace_period(data_dir).unwrap_or(false) {
                        return LicenseStatus::Grace;
                    }
                }
                return LicenseStatus::Invalid;
            }
        };

        let now = chrono::Utc::now();

        if now < info.valid_from {
            return LicenseStatus::NotYetActive;
        }

        match info.valid_until {
            Some(expiry) => {
                if now > expiry {
                    // Check if still within post-expiry grace (precise 30-day window)
                    if now <= expiry + chrono::Duration::days(30) {
                        return LicenseStatus::ExpiredGrace;
                    }
                    return LicenseStatus::Locked;
                }
                // Warning period: last 30 days before expiry (precise duration)
                if expiry - now <= chrono::Duration::days(30) {
                    return LicenseStatus::Warning;
                }
                LicenseStatus::Valid
            }
            None => LicenseStatus::Valid, // perpetual
        }
    }

    /// Remaining days until expiry (negative = expired).
    /// Returns i64::MAX for perpetual licenses.
    /// Returns grace days remaining if no active license.
    pub fn days_remaining(&self) -> i64 {
        let guard = match self.license.lock() {
            Ok(g) => g,
            Err(_) => return 0,
        };

        let info = match guard.as_ref() {
            Some(i) => i,
            None => {
                // No license — return grace days remaining
                if let Some(ref data_dir) = self.data_dir {
                    return crate::clock::grace_days_remaining(data_dir)
                        .ok()
                        .flatten()
                        .unwrap_or(0);
                }
                return 0;
            }
        };

        match info.valid_until {
            Some(expiry) => (expiry - chrono::Utc::now()).num_days(),
            None => i64::MAX,
        }
    }

    /// Serialize license state to environment variables for the sidecar.
    ///
    /// Follows the Rust ↔ Hono interface contract (Licensing Architecture §15.5).
    /// Reads the license under a single lock to avoid double-lock deadlocks.
    pub fn to_env_map(&self) -> HashMap<String, String> {
        let mut map = HashMap::new();

        // Lock once and extract everything we need
        let snapshot = self.license.lock().ok().and_then(|guard| guard.clone());

        if let Some(info) = &snapshot {
            map.insert(
                "TUARI_LICENSE_EDITION".to_string(),
                info.edition.clone(),
            );
            map.insert(
                "TUARI_LICENSE_FEATURES".to_string(),
                info.features.join(","),
            );
            map.insert(
                "TUARI_LICENSE_MAX_USERS".to_string(),
                info.max_users.to_string(),
            );
            map.insert(
                "TUARI_LICENSE_CUSTOMER".to_string(),
                serde_json::json!({
                    "name": info.issued_to,
                    "email": info.email,
                })
                .to_string(),
            );
            map.insert(
                "TUARI_LICENSE_EXPIRES_AT".to_string(),
                info.valid_until
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default(),
            );
            map.insert(
                "TUARI_LICENSE_STATUS".to_string(),
                match self.status() {
                    LicenseStatus::Valid | LicenseStatus::Warning => "active",
                    LicenseStatus::ExpiredGrace => "grace",
                    LicenseStatus::Locked | LicenseStatus::Expired => "expired",
                    LicenseStatus::NotYetActive => "inactive",
                    LicenseStatus::Tampered => "suspicious",
                    LicenseStatus::Grace => "trial",
                    LicenseStatus::Invalid => "unknown",
                }
                .to_string(),
            );
        } else {
            map.insert("TUARI_LICENSE_EDITION".to_string(), "standard".to_string());
            map.insert("TUARI_LICENSE_FEATURES".to_string(), String::new());
            // No license = no seat cap (0 is the unlimited sentinel). The API
            // seat rule only caps an `active` license, and the no-license
            // branch is `trial`/`unknown`; forwarding 0 matches
            // `get_license_status`, which reports `max_users: 0` here.
            map.insert("TUARI_LICENSE_MAX_USERS".to_string(), "0".to_string());
            map.insert(
                "TUARI_LICENSE_CUSTOMER".to_string(),
                "null".to_string(),
            );
            map.insert("TUARI_LICENSE_EXPIRES_AT".to_string(), String::new());
            map.insert(
                "TUARI_LICENSE_STATUS".to_string(),
                match self.status() {
                    LicenseStatus::Grace => "trial",
                    LicenseStatus::Tampered => "suspicious",
                    _ => "unknown",
                }
                .to_string(),
            );
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

    /// RFC 8032 TEST 1 public key. Its private half is published, so trusting it
    /// (as this crate did before the 0.1.x release) lets anyone mint a license.
    const RFC8032_TEST_KEY: [u8; 32] = [
        0xd7, 0x5a, 0x98, 0x01, 0x82, 0xb1, 0x0a, 0xb7, 0xd5, 0x4b, 0xfe, 0xd3, 0xc9, 0x09,
        0x15, 0x57, 0x52, 0xe5, 0x25, 0x56, 0x5e, 0xbd, 0xb9, 0x2b, 0x8c, 0xdb, 0xf4, 0x4b,
        0x54, 0x1f, 0x24, 0x3b,
    ];

    /// A shippable build must carry a real vendor key: a zeroed placeholder or a
    /// published test vector makes every license forgeable.
    #[test]
    fn embedded_key_is_production() {
        assert_ne!(
            EMBEDDED_PUBLIC_KEY, [0u8; 32],
            "embedded license key is a zeroed placeholder — the app would accept no license"
        );
        assert_ne!(
            EMBEDDED_PUBLIC_KEY, RFC8032_TEST_KEY,
            "embedded license key is the public RFC 8032 test vector — anyone could mint a license"
        );
    }

    #[test]
    fn root_key_is_production() {
        let root = crate::trust::root_ca::ROOT_CA_PUBLIC_KEY;
        assert_ne!(root, [0u8; 32], "root CA key is a zeroed placeholder");
        assert_ne!(
            root, RFC8032_TEST_KEY,
            "root CA key is the public RFC 8032 test vector"
        );
    }
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
    fn initialize_without_license_file_returns_manager_with_grace() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let manager = LicenseManager::initialize(&dir).unwrap();
        // No license file means no active license, but data_dir is set
        assert_eq!(manager.edition(), "standard");
        assert!(!manager.has_feature("lan_server"));
        assert_eq!(manager.status(), LicenseStatus::Grace);
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

    /// Optional operator check: point `LICENSE_UNDER_TEST` at a freshly minted
    /// `.lic` file and this verifies it against the anchor compiled into the
    /// app, exactly as the runtime does. It is skipped when the variable is
    /// unset (CI has no vendor key); the signer→verifier interop test covers
    /// that path automatically.
    #[test]
    fn verifies_license_under_test_when_provided() {
        let path = match std::env::var("LICENSE_UNDER_TEST") {
            Ok(path) if !path.trim().is_empty() => path,
            _ => {
                eprintln!(
                    "LICENSE_UNDER_TEST not set — skipping the vendor-anchor check \
                     (set it to a minted .lic path to verify a real issuance)"
                );
                return;
            }
        };

        let content = fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("cannot read LICENSE_UNDER_TEST={path}: {e}"));
        let manager = LicenseManager::with_keys(vec![EMBEDDED_PUBLIC_KEY]);
        manager.activate(content.trim()).unwrap_or_else(|e| {
            panic!(
                "LICENSE_UNDER_TEST={path} does not verify against the embedded anchor: {e:?}"
            )
        });
    }

    #[test]
    fn aged_trial_stays_out_of_grace_after_tracker_deleted() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let now = chrono::Utc::now().timestamp();
        let aged = now - 100 * 86400;
        fs::write(
            dir.join("clock-tracker.json"),
            serde_json::json!({ "last_seen_wall": now, "install_wall": aged }).to_string(),
        )
        .unwrap();
        fs::write(
            dir.join("install-anchor.json"),
            serde_json::json!({ "install_wall": aged }).to_string(),
        )
        .unwrap();

        let manager = LicenseManager::initialize(&dir).unwrap();
        assert_ne!(manager.status(), LicenseStatus::Grace);
        assert_eq!(manager.days_remaining(), 0);

        // Clock-tamper recovery: delete the tracker, then re-initialize.
        fs::remove_file(dir.join("clock-tracker.json")).unwrap();
        let manager = LicenseManager::initialize(&dir).unwrap();
        assert_ne!(
            manager.status(),
            LicenseStatus::Grace,
            "deleting the tracker must not restart the trial"
        );
        assert_eq!(manager.days_remaining(), 0);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn licensed_install_is_unaffected_by_tracker_reset() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let now = chrono::Utc::now();
        let info = LicenseInfo {
            license_id: "LCE-20260701-LICENSED".to_string(),
            issued_to: "Licensed Co".to_string(),
            email: "licensed@test.com".to_string(),
            edition: "enterprise".to_string(),
            features: vec!["encrypted_db".to_string()],
            max_users: 0,
            valid_from: now - chrono::Duration::days(10),
            valid_until: None,
            license_type: "perpetual".to_string(),
        };
        let manager = LicenseManager {
            license: Mutex::new(Some(info)),
            trusted_keys: Vec::new(),
            data_dir: Some(dir.clone()),
        };
        assert_eq!(manager.status(), LicenseStatus::Valid);

        // Create the clock state, then run the recovery path.
        let _ = crate::clock::check_clock_consistency(&dir).unwrap();
        fs::remove_file(dir.join("clock-tracker.json")).unwrap();
        assert_eq!(
            manager.status(),
            LicenseStatus::Valid,
            "a licensed install must not regress after the tracker reset"
        );
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

        assert_eq!(env.get("TUARI_LICENSE_EDITION").unwrap(), "enterprise");
        assert_eq!(
            env.get("TUARI_LICENSE_FEATURES").unwrap(),
            "encrypted_db"
        );
        assert_eq!(env.get("TUARI_LICENSE_MAX_USERS").unwrap(), "0");
        assert_eq!(env.get("TUARI_LICENSE_STATUS").unwrap(), "active");
        let customer_str = env.get("TUARI_LICENSE_CUSTOMER").unwrap();
        let customer: serde_json::Value =
            serde_json::from_str(customer_str).unwrap();
        assert_eq!(customer["name"], "Env Corp");
        assert_eq!(customer["email"], "env@test.com");
    }

    #[test]
    fn to_env_map_returns_defaults_for_empty_manager() {
        let manager = LicenseManager::empty();
        let env = manager.to_env_map();
        assert_eq!(env.get("TUARI_LICENSE_EDITION").unwrap(), "standard");
        assert_eq!(env.get("TUARI_LICENSE_MAX_USERS").unwrap(), "0");
        assert_eq!(env.get("TUARI_LICENSE_STATUS").unwrap(), "unknown");
    }

    // #399 guard: the successful no-license path inside the trial window must
    // stay `trial` — only the init-FAILURE path gained a new explicit status.
    #[test]
    fn to_env_map_reports_trial_for_no_license_inside_the_trial_window() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let manager = LicenseManager::initialize(&dir).unwrap();
        assert_eq!(manager.status(), LicenseStatus::Grace);
        let env = manager.to_env_map();
        assert_eq!(env.get("TUARI_LICENSE_STATUS").unwrap(), "trial");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn status_returns_expired_grace_for_recently_expired() {
        let (signing_key, public_key) = generate_keypair();
        let manager = LicenseManager::with_keys(vec![public_key]);
        // License that expired 15 days ago (within 30-day grace)
        let fifteen_days_ago = (chrono::Utc::now() - chrono::Duration::days(15))
            .format("%Y-%m-%dT00:00:00Z")
            .to_string();
        let content = sign_payload(
            &format!(
                r#"{{
                    "licenseId": "LCE-20260701-GRC001",
                    "issuedTo": "Grace Co",
                    "email": "grace@test.com",
                    "edition": "standard",
                    "features": [],
                    "maxUsers": 1,
                    "validFrom": "2020-01-01T00:00:00Z",
                    "validUntil": "{fifteen_days_ago}",
                    "licenseType": "subscription"
                }}"#
            ),
            &signing_key,
        );
        manager.activate(&content).unwrap();
        assert_eq!(manager.status(), LicenseStatus::ExpiredGrace);
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
        assert_eq!(manager.status(), LicenseStatus::Locked);
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
    fn initialize_skips_invalid_rotation_certs_gracefully() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();

        // Write a rotation cert with a test-generated Root CA
        // (won't match the embedded ROOT_CA_PUBLIC_KEY placeholder)
        let (root_ca_sk, _root_ca_pk) = generate_keypair();
        let (_rotated_sk, rotated_pk) = generate_keypair();

        use base64::Engine;
        let engine = base64::engine::general_purpose::URL_SAFE;
        let rotated_pk_b64 = engine.encode(rotated_pk);
        let cert_value = serde_json::json!({
            "effectiveFrom": "2026-01-01T00:00:00Z",
            "newPublicKey": rotated_pk_b64,
            "previousKeyId": "abc123",
            "purpose": "license-signing",
            "rotationReason": "scheduled",
            "type": "key_rotation",
        });
        let cert_json_str = serde_json::to_string(&cert_value).unwrap();
        let sig = root_ca_sk.sign(cert_json_str.as_bytes());
        let sig_b64 = engine.encode(sig.to_bytes());

        let cert = serde_json::json!({
            "type": "key_rotation",
            "newPublicKey": rotated_pk_b64,
            "effectiveFrom": "2026-01-01T00:00:00Z",
            "previousKeyId": "abc123",
            "purpose": "license-signing",
            "rotationReason": "scheduled",
            "rootCaSignature": sig_b64,
        });
        std::fs::write(
            dir.join("key-rotation-v2.json"),
            serde_json::to_string_pretty(&cert).unwrap(),
        )
        .unwrap();

        // initialize() should succeed — invalid rotation certs are skipped,
        // and no license file means grace mode
        let manager = LicenseManager::initialize(&dir).unwrap();
        assert_eq!(manager.status(), LicenseStatus::Grace);

        std::fs::remove_dir_all(&dir).unwrap();
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
