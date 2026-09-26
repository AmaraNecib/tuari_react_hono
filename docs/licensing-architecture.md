# Licensing Architecture — Revised Canonical Design

**Author:** Lead Software Architect
**Date:** 2026-06-30
**Status:** Approved
**Priority:** P0 — Must be designed before first customer ships

---

## Table of Contents

1. Threat Model & Assumptions
2. License Format
3. Cryptographic Architecture
4. Edition Model
5. Feature Gating Mechanism
6. Offline Verification Protocol
7. Clock Consistency & Graceful Degradation
8. Upgrade & Downgrade Flow
9. Lost License Recovery
10. Offline Activation via Signed Response
11. License Replacement / Transfer
12. Tamper Resistance Strategy
13. Future Subscription Compatibility
14. Security Considerations
15. Implementation Architecture
16. Appendices

---

## 1. Threat Model & Assumptions

### 1.1 Attacker Profiles

| Profile | Capability | Objective |
|---------|-----------|-----------|
| **Casual user** | Low technical skill | Wants free features without paying |
| **Technical user** | Can edit JS files, understands WebView debugging | Bypass license checks in browser context |
| **Skilled cracker** | Can decompile Node.js, patch binaries, debug Tauri | Remove licensing entirely, distribute cracked builds |
| **Organized piracy** | Full reverse-engineering toolchain | Mass-produce cracked versions |
| **Insider (license server)** | Access to signing infrastructure | Exfiltrate or misuse private key |
| **Nation-state actor** | Full RE toolkit, legal authority | **Out of scope** — we accept that a sufficiently resourced attacker can defeat any client-side licensing |

### 1.2 Insider Threat Mitigations

The private signing key is the single point of failure for the entire licensing system.

| Layer | Mitigation |
|-------|-----------|
| **Storage** | Private key stored on a **hardware security key** (YubiKey / Nitrokey), not a file on disk |
| **Access** | **Dual-control** required for signing operations (two people must authenticate) |
| **Network** | Key-holding machine is **air-gapped** (no network connectivity) |
| **Encryption at rest** | Hardware key is PIN-protected; brute-force protection built into the hardware |
| **Audit** | All signing operations are logged with timestamps and operator identity |
| **Revocation** | If compromise is suspected, a new key pair can be generated immediately and the old key revoked via a signed rotation certificate |

### 1.3 Trust Boundaries

```
[License File on Disk] ──→ [Rust Shell (Tauri)] ──→ [Node.js API Sidecar] ──→ [WebView Renderer]
        ↑                         ↑                          ↑                       ↑
    Attacker can              HARDEST to                EASIER to               TRIVIAL to
    replace/modify            tamper (native)            tamper (JS)             tamper (JS)
```

**Diagram notes:**
- **Rust shell** is the root of trust. It validates the license signature and enforces security-critical feature gates (LAN server binding, encrypted DB key acceptance, max users).
- **API sidecar** enforces business-logic feature gates but is trusted only for non-security-critical gates. A patched sidecar cannot bypass Rust-enforced gates.
- **WebView** is fully untrusted. Feature flags sent to the frontend are for **UI-only gating** (show/hide elements). The real enforcement is always server-side.

### 1.4 Design Assumptions

1. The application is entirely offline — no phone-home server for validation.
2. The license file is stored on the local filesystem.
3. The user controls the machine (not a cloud environment).
4. A determined attacker can patch any code they can read.
5. We cannot prevent piracy completely — we can only raise the cost.
6. The Rust binary can be reverse-engineered but requires significantly more effort than JS.
7. Nation-state-level adversaries are out of scope.
8. **No telemetry for licensing.** We will not track installations, edition distribution, or crack prevalence through the application itself. Download metrics from the license portal are the only signal.

---

## 2. License Format

### 2.1 License File

A license is a **signed JSON file** stored at:

- **Installed mode:** `<app_data>/Tuari/license.lic`
- **Portable mode:** `./data/license.lic` (beside the portable data directory)

### 2.2 License Payload (unsigned content)

```json
{
  "licenseId": "LCE-20260630-ABC123",
  "issuedAt": "2026-06-30T00:00:00Z",
  "issuedTo": "Acme Construction SARL",
  "email": "contact@acme.dz",
  "edition": "professional",
  "features": ["multi_user", "lan_server", "encrypted_db", "advanced_reports"],
  "maxUsers": 10,
  "validFrom": "2026-07-01T00:00:00Z",
  "validUntil": "2027-07-01T00:00:00Z",
  "licenseType": "perpetual",
  "metadata": {
    "version": "1.0",
    "buildNumber": 42
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `licenseId` | string | Unique identifier, format `LCE-YYYYMMDD-RANDOM6` |
| `issuedAt` | ISO 8601 | When the license was issued |
| `issuedTo` | string | Customer name / company |
| `email` | string | Customer email |
| `edition` | enum | `standard`, `professional`, `enterprise` |
| `features` | string[] | Explicit feature flags (overrides edition defaults) |
| `maxUsers` | integer | Maximum user accounts allowed (0 = unlimited) |
| `validFrom` | ISO 8601 | License activation date |
| `validUntil` | ISO 8601 | License expiry date (may be omitted for perpetual) |
| `licenseType` | enum | `perpetual`, `subscription`, `trial`, `grace` |
| `metadata` | object | Extensible (build version, region, etc.) |

### 2.3 Signed License File (wire format)

The signed file is the JSON payload, Base64url-encoded, concatenated with a detached Ed25519 signature:

```
<base64url(payload)>.<base64url(signature)>
```

Stored on disk as a single-line text file with `.lic` extension.

### 2.4 License Validation Algorithm

```
Input:  license.lic file contents
Output: Valid (decoded payload) or Invalid reason

1. Split on "." -> [payload_b64, signature_b64]
   If not exactly 2 parts → INVALID_FORMAT

2. Decode payload_b64 -> payload_bytes (UTF-8 JSON)
   Decode signature_b64 -> raw 64-byte Ed25519 signature
   If either decode fails → INVALID_ENCODING

3. Verify signature against embedded public key (and any rotation certificates)
   crypto.sign.verify(publicKey, payload_bytes, signature)
   Try all trusted public keys; if none match → INVALID_SIGNATURE

4. Parse payload_bytes as JSON, validate against schema
   If any required field missing or invalid → INVALID_SCHEMA

5. Date validation:
   now = system_clock_with_tolerance()
   validFrom ≤ now ≤ validUntil  → EXPIRED or NOT_YET_ACTIVE
   (See Section 7 for clock tolerance)

6. Edition validity:
   edition must be one of: standard, professional, enterprise

7. Return decoded payload as LicenseInfo
```

---

## 3. Cryptographic Architecture

### 3.1 Algorithm Choice: Ed25519

| Algorithm | Public Key Size | Private Key Size | Signature Size | Why Chosen |
|-----------|----------------|-----------------|---------------|------------|
| Ed25519 | 32 bytes | 64 bytes (32 seed + 32 expanded) | 64 bytes | Small, fast, constant-time, widely audited, deterministic signatures (RFC 8032), excellent Rust support via `ed25519-dalek` v2 |

### 3.2 Key Hierarchy

```
Root CA Key Pair (offline, HSM-protected, never in application)
  │
  ├── Signing Key v1 (current signing key)
  │     • Public key embedded in Rust binary at build time
  │     • Private key on air-gapped HSM with dual-control
  │     • Used to sign all license files
  │
  └── Future: Signing Key v2, v3, ... (key rotation)
        • Each successor is authorized by a key rotation certificate
          signed by the Root CA
        • Rotation certificates shipped with application updates
        • Or, in an emergency, distributed via key-rotation.json
          placed manually in <app_data>/Tuari/
```

### 3.3 Key Management

| Key | Storage | Access Control |
|-----|---------|---------------|
| Root CA private key | Hardware security module (YubiKey PIV slot) | Dual-control, PIN-protected, air-gapped |
| Signing Key private key (current) | Hardware security module (YubiKey PIV slot) | Dual-control, PIN-protected, air-gapped |
| Signing Key public key | Embedded in Rust binary (`const PUBLIC_KEY: &[u8; 32]`) | Public — designed to be readable |
| Rotation certificates | On filesystem within `<app_data>/Tuari/` | Readable — self-authenticating via Root CA signature |

### 3.4 Signature Library

**Rust crate:** `ed25519-dalek` v2

```toml
ed25519-dalek = { version = "2", features = ["pkcs8"] }
base64 = "0.22"
```

- Pinned to a specific, audited version.
- Security advisory subscription in place.
- Consider migrating to Rust stdlib `ed25519` when it stabilizes.

### 3.5 Key Rotation

#### 3.5.1 Normal Rotation (with update system)

1. Licensing admin generates a new signing key pair on the air-gapped HSM.
2. Admin signs a key rotation certificate with the Root CA key:
   ```json
   {
     "type": "key_rotation",
     "newPublicKey": "<base64-ed25519-public-key>",
     "effectiveFrom": "2027-01-01T00:00:00Z",
     "previousKeyId": "sha256-of-old-public-key",
     "rotationReason": "scheduled"
   }
   ```
3. The rotation certificate is signed with the Root CA key.
4. The certificate is shipped in the next application update as `key-rotation-v2.json` in the Rust binary's resources.
5. On startup, Rust reads all rotation certificates and adds them to the trusted key list.
6. Old keys remain trusted until their expiry (old licenses remain valid).
7. New licenses are signed with the new key.

#### 3.5.2 Emergency Rotation (without update system)

If the signing key is compromised before the update system exists:

1. Admin generates a new signing key pair on the air-gapped HSM.
2. Admin signs a key rotation certificate with the Root CA key.
3. The certificate is posted on `https://trust.tuari.app/emergency-rotation.pem`.
4. Users (or IT staff) download the file and place it at `<app_data>/Tuari/key-rotation-emergency.json`.
5. Rust checks for `key-rotation-emergency.json` on startup, validates its Root CA signature, and adds the new public key.
6. Old licenses remain valid until their `validUntil` date; new licenses are signed with the new key.
7. Future application updates include the rotation permanently as a resource file.

---

## 4. Edition Model

### 4.1 Edition Definitions

| Edition | Price Tier | Target Customer | Differentiator |
|---------|-----------|-----------------|---------------|
| **Standard** | Free | Single-user, small business | Full basic feature set, local-only, single user |
| **Professional** | Paid | Growing business, multi-user | Adds LAN server mode, multi-user, advanced reports, API access |
| **Enterprise** | Premium | Large organization | Adds SQLCipher, multi-site sync, audit export, priority support |

### 4.2 Edition → Feature Matrix

| Feature | Standard | Professional | Enterprise | Gate Level |
|---------|----------|-------------|------------|------------|
| Employee management | ✓ | ✓ | ✓ | — |
| Project management | ✓ | ✓ | ✓ | — |
| Warehouse management | ✓ | ✓ | ✓ | — |
| Inventory (consumables + assets) | ✓ | ✓ | ✓ | — |
| Debt ledger & accounting | ✓ | ✓ | ✓ | — |
| Invoice management | ✓ | ✓ | ✓ | — |
| Payment tracking | ✓ | ✓ | ✓ | — |
| RBAC (role-based access) | ✓ | ✓ | ✓ | — |
| Audit log (system log) | ✓ | ✓ | ✓ | — |
| Dashboard & basic reports | ✓ | ✓ | ✓ | — |
| Backup / export | ✓ | ✓ | ✓ | — |
| **LAN server mode** | ✗ | ✓ | ✓ | API-enforced |
| **Multi-user (max accounts)** | 1 | 10 | Unlimited | API-enforced |
| **Encrypted database (SQLCipher)** | ✗ | ✗ | ✓ | **Rust-enforced** |
| **Advanced reporting** | ✗ | ✓ | ✓ | API-enforced |
| **Multi-site sync** | ✗ | ✗ | ✓ | API-enforced |
| **Audit log export** | ✗ | ✗ | ✓ | API-enforced |
| **External API access** | ✗ | ✓ | ✓ | API-enforced |
| **Priority support** | ✗ | ✗ | ✓ | Support process (not code) |

### 4.3 Feature Enum

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum LicensedFeature {
    /// LAN server binding (API-enforced)
    LanServer,
    /// Multi-user account creation (API-enforced: maxUsers)
    MultiUser,
    /// SQLCipher database encryption (Rust-enforced)
    EncryptedDb,
    /// Advanced reporting engine
    AdvancedReports,
    /// Multi-site data synchronization
    MultiSiteSync,
    /// Export audit log to external formats
    AuditExport,
    /// External REST API access
    ExternalApi,
    /// Priority technical support
    PrioritySupport,
}
```

### 4.4 Default Features Per Edition

```rust
fn default_features(edition: Edition) -> HashSet<LicensedFeature> {
    match edition {
        Edition::Standard => HashSet::new(),
        Edition::Professional => [
            LicensedFeature::LanServer,
            LicensedFeature::MultiUser,
            LicensedFeature::AdvancedReports,
            LicensedFeature::ExternalApi,
        ].into(),
        Edition::Enterprise => [
            LicensedFeature::LanServer,
            LicensedFeature::MultiUser,
            LicensedFeature::EncryptedDb,
            LicensedFeature::AdvancedReports,
            LicensedFeature::MultiSiteSync,
            LicensedFeature::AuditExport,
            LicensedFeature::ExternalApi,
            LicensedFeature::PrioritySupport,
        ].into(),
    }
}
```

Feature flags in the license file's `features` array can override edition defaults (additive only). This allows custom bundles.

---

## 5. Feature Gating Mechanism

### 5.1 Two-Layer Enforcement

| Gate Level | Where Enforced | What It Protects | Bypass Difficulty |
|-----------|---------------|-----------------|-------------------|
| **Rust-enforced** | Tauri shell (native) | Encrypted database (APP_DB_KEY stripping) | **Very Hard** — requires patching Rust binary |
| **API-enforced** | Hono API sidecar | LAN server binding, max users, advanced reports, multi-site sync, audit export, external API | **Medium** — requires patching Node.js sidecar |

### 5.2 Rust-Enforced Gates

These gates are enforced by the Rust shell **before the API sidecar even starts**. Patching the sidecar cannot bypass them.

#### 5.2.1 Encrypted Database

The only truly Rust-enforced gate. The Rust shell controls whether `APP_DB_KEY` is passed to the sidecar's environment.

```rust
// In spawn_api_process():
if env::var("APP_DB_KEY").is_ok() && !license_manager.has_feature(EncryptedDb) {
    eprintln!("Encrypted database requires Enterprise edition.");
    // Prevent APP_DB_KEY from reaching the sidecar
}
```

**Critical implementation detail:** The Rust shell must call `.env_clear()` before setting allowed vars. The current implementation uses `.env(key, value)` without `.env_clear()`, which means the sidecar inherits all environment variables from the Tauri process (including any `APP_DB_KEY` set by the user at the system level).

```rust
// Correct pattern:
command
    .env_clear()  // ← REQUIRED: prevents system env leaks
    .env("API_HOST", api_host)
    .env("API_PORT", api_port)
    // ... all other allowed vars
    .env("TUARI_LICENSE_EDITION", license_manager.edition().as_str())
    .env("TUARI_LICENSE_FEATURES", license_manager.features_csv())
    .env("TUARI_LICENSE_MAX_USERS", license_manager.max_users().to_string())
    .env("TUARI_LICENSE_CUSTOMER", &license_manager.customer_json())
    .env("TUARI_LICENSE_EXPIRES_AT", &license_manager.expires_at().unwrap_or_default());

if license_manager.has_feature(EncryptedDb) {
    command.env("APP_DB_KEY", &db_key);
}
```

**Verdict:** Effective only if `.env_clear()` is used. The raw signed license payload is never exposed to the sidecar — only the parsed fields that Rust explicitly chooses to share.

#### 5.2.3 Max Users

The `maxUsers` field is enforced in the API sidecar's `AuthBootstrapService`:

```typescript
// In bootstrap.service.ts or session management
const userCount = await countUsers();
if (userCount >= license.maxUsers) {
    throw new AppError('UPGRADE_REQUIRED', {
        message: `لقد بلغت الحد الأقصى لعدد المستخدمين (${license.maxUsers}).`,
    });
}
```

**Risk:** A patched sidecar can skip this check. Since the license payload is passed to the sidecar, a patched sidecar could also modify the `maxUsers` value in memory.

**Mitigation:** Move this check to Rust. The Rust shell should track the active user count. However, this requires the Rust shell to monitor the database, which breaks the clean separation.

**Practical decision:** Max users is **API-enforced**. The business risk is limited: a user who patches their sidecar to allow more accounts is already technically sophisticated. The license still prevents them from getting support or updates.

### 5.3 API-Enforced Gates

These gates are enforced in the Node.js API sidecar through middleware. The sidecar reads license info from the **structured environment variables** that Rust sets (never the raw signed payload):

```typescript
// apps/api/src/infrastructure/license.ts
// Reads from env vars set by Rust, NEVER from a raw license file or payload

export function getLicenseInfo(): LicenseInfo {
  return {
    edition: process.env.TUARI_LICENSE_EDITION ?? 'standard',
    features: (process.env.TUARI_LICENSE_FEATURES ?? '').split(',').filter(Boolean),
    maxUsers: parseInt(process.env.TUARI_LICENSE_MAX_USERS ?? '0', 10),
    customer: process.env.TUARI_LICENSE_CUSTOMER 
      ? JSON.parse(process.env.TUARI_LICENSE_CUSTOMER) 
      : null,
    expiresAt: process.env.TUARI_LICENSE_EXPIRES_AT || null,
  };
}

export function requireFeature(feature: LicensedFeature) {
  return async (c: Context, next: () => Promise<void>) => {
    const license = getLicenseInfo();
    if (!license.features.includes(feature)) {
      throw new AppError('UPGRADE_REQUIRED', {
        message: `هذه الميزة تتطلب ترقية الإصدار.`,
        requiredEdition: featureToMinEdition(feature),
      });
    }
    await next();
  };
}
```

Gated endpoints:

| Feature | Endpoint / Condition |
|---------|---------------------|
| AdvancedReports | `/rpc/report*` handlers |
| MultiSiteSync | Future sync endpoints |
| AuditExport | System log export handler |
| ExternalApi | API key auth middleware (future) |

### 5.4 Frontend Feature Visibility (UI-Only)

The `session` RPC response includes `availableFeatures` for UI purposes only:

```typescript
type SessionUser = {
  id: string;
  name: string | null;
  phone: string;
  permissions: Permission[];
  availableFeatures: string[]; // From license, READ-ONLY info
};
```

Frontend components use this to show/hide UI elements:

```tsx
function ServerSettingsButton() {
  const session = useSessionQuery();
  if (!session?.availableFeatures?.includes('lan_server')) return null;
  return <Button onClick={openServerSettings}>إعدادات الخادم</Button>;
}
```

**Critical rule:** The frontend must **never** trust `availableFeatures` for enforcement. If a user modifies the frontend JS to show all buttons, the API will reject unauthorized operations.

---

## 6. Offline Verification Protocol

### 6.1 Startup Verification Flow (Complete)

```
Tauri startup
  │
  ├── 1. Check clock consistency (Section 7)
  │     │
  │     ├── Clock OK: continue
  │     └── Clock suspicious: warn user, use estimated time
  │
  ├── 2. Look for license.lic at:
  │     • <app_data>/Tuari/license.lic (installed)
  │     • ./data/license.lic (portable)
  │     │
  │     ├── Found: validate signature (Section 2.4)
  │     │     │
  │     │     ├── Valid & within dates → load license info
  │     │     └── Invalid / expired → proceed to grace period check
  │     │
  │     └── Not found: proceed to grace period check
  │
  ├── 3. Grace period check (Section 6.2)
  │     │
  │     ├── Within grace (install < 30 days) → start with Standard features, show badge
  │     ├── Grace expired → show activation screen, block business operations
  │     └── Trial active → start with Standard features
  │
  ├── 4. Cache validated license in Rust memory (Mutex<Option<LicenseInfo>>)
  │
  ├── 5. Prepare env vars for API sidecar (via LicenseManager.serialize_env())
  │     • TUARI_LICENSE_EDITION: "professional"
  │     • TUARI_LICENSE_FEATURES: "lan_server,multi_user,advanced_reports,external_api"
  │     • TUARI_LICENSE_MAX_USERS: "10"
  │     • TUARI_LICENSE_CUSTOMER: JSON with customer name + email
  │     • TUARI_LICENSE_EXPIRES_AT: ISO date or empty
  │     • (APP_DB_KEY only if license_manager.has_feature(EncryptedDb))
  │     Note: Raw signed payload is NEVER passed to the sidecar.
  │
  └── 6. Spawn API sidecar (or show activation screen if locked)
```

### 6.2 First-Run & Grace Period UX

#### 6.2.1 First-Run Flow (no license, no install-timestamp)

```
User opens Tuari for the first time
  │
  ├── Welcome screen with options:
  │   ┌─────────────────────────────────────┐
  │   │   مرحباً بك في توارتي                │
  │   │                                      │
  │   │   [ابدأ النسخة التجريبية (30 يوماً)]  │
  │   │   [تفعيل الترخيص]                     │
  │   │   [تخطي]                               │
  │   └─────────────────────────────────────┘
  │
  ├── "Start trial" → create install-timestamp → grant Standard edition for 30 days
  ├── "Activate" → show file picker for license.lic
  └── "Skip" → show welcome screen on next startup too
```

#### 6.2.2 Grace Period (post-install, no license)

```
  ├── install-timestamp < 30 days from now
  │     → App functions normally with Standard edition features
  │     → Small banner in bottom-right: "النسخة التجريبية — يتبقى N يوم"
  │     → Settings → Licensing shows countdown and upgrade options
  │
  └── install-timestamp ≥ 30 days from now
        → Full-screen lock: "انتهت الفترة التجريبية"
        → Buttons: "تفعيل الترخيص" | "شراء النسخة"
        → Existing data remains on disk, accessible after activation
```

#### 6.2.3 Three-Phase Expiry (for licenses with validUntil)

| Phase | Condition | UX | Data Access |
|-------|-----------|-----|-------------|
| **Active** | now < validUntil | Normal operation | Full read/write |
| **Warning** | validUntil - 30d ≤ now < validUntil | Warning banner on every page: "ينتهي الترخيص في N يوم" | Full read/write |
| **Expired Grace** | validUntil ≤ now < validUntil + 30d | Persistent notification, upgrade prompt | **Read-only** — can view existing data, cannot create/edit/delete |
| **Locked** | validUntil + 30d ≤ now | Full-screen lock with activation / renewal screen | Data intact but inaccessible |

### 6.3 Re-verification Frequency

License is re-verified:
- On every app startup (Rust validates signature).
- When the user manually activates a new license.
- **No periodic re-check during runtime** (offline assumption).

---

## 7. Clock Consistency & Graceful Degradation

### 7.1 Monotonic Clock Tracker

```rust
fn check_clock_consistency() -> Result<ClockStatus, LicenseError> {
    let state_dir = resolve_state_dir()?;
    let tracker_path = state_dir.join("clock-tracker.json");
    
    // Current wall clock and monotonic time
    let now_wall = Utc::now().timestamp();
    let now_mono = std::time::Instant::now();
    
    // Read tracker
    let tracker: ClockTracker = if tracker_path.exists() {
        serde_json::from_str(&fs::read_to_string(&tracker_path)?)?
    } else {
        ClockTracker {
            last_seen_wall: now_wall,
            last_monotonic: now_mono,
            install_wall: now_wall,
        }
    };
    
    // Detect clock going backward (beyond tolerance)
    let wall_drift = now_wall - tracker.last_seen_wall;
    let mono_drift = now_mono.duration_since(tracker.last_monotonic).as_secs() as i64;
    
    if tracker.last_seen_wall > now_wall && wall_drift.abs() > 86400 {
        // Clock was set back by more than 24 hours
        return Ok(ClockStatus::Suspicious {
            estimated_time: tracker.last_seen_wall + mono_drift,
            reason: "System clock was set backward",
        });
    }
    
    if (wall_drift - mono_drift).abs() > 86400 {
        // Wall clock and monotonic clock disagree by > 24 hours
        return Ok(ClockStatus::Suspicious {
            estimated_time: tracker.last_seen_wall + mono_drift,
            reason: "System clock may have been altered",
        });
    }
    
    // Update tracker
    fs::write(&tracker_path, serde_json::to_string(&ClockTracker {
        last_seen_wall: now_wall,
        last_monotonic: now_mono,
        install_wall: tracker.install_wall,
    })?)?;
    
    Ok(ClockStatus::Trusted(now_wall))
}
```

### 7.2 Clock Status → License Decision

| Clock Status | License Decision |
|-------------|-----------------|
| `Trusted(time)` | Use `time` for all date comparisons |
| `Suspicious { estimated_time }` | Use `estimated_time` for date comparisons. Log warning. **Do not lock the app** — show a non-blocking notification: "تعذر التحقق من تاريخ النظام. يرجى التأكد من صحة التاريخ والوقت." |

### 7.3 User Experience for Clock Issues

The app never locks solely due to clock suspicion. The worst case is:
- The estimated time is used, which is the last-seen wall time plus elapsed monotonic time.
- If this estimated time exceeds the license expiry, the app enters the normal expiry flow.
- A user who sets their clock back to extend a trial will see the trial end when the monotonic tracker catches up.

---

## 8. Upgrade & Downgrade Flow

### 8.1 Activation via File

```
1. User downloads license.lic from their account portal
2. User opens Tuari → Settings → Licensing → Activate License
3. File picker opens; user selects license.lic
4. Frontend reads file content, sends to Tauri command:
     activate_license(content: string)
5. Rust validates signature + payload
6. Rust writes license.lic to <app_data>/Tuari/license.lic
7. Rust returns: { success: true, license: LicenseInfo }
8. Frontend shows success message with edition name
9. For edition upgrades: "تم الترقية إلى الإصدار الاحترافي بنجاح"
10. Some features (LAN server mode) may require app restart
```

### 8.2 Upgrade Validation Rules

| From | To | Allowed? |
|------|-----|----------|
| Standard | Professional | ✓ |
| Standard | Enterprise | ✓ (skip Pro) |
| Professional | Enterprise | ✓ |
| Professional | Standard | ✗ (downgrade prohibited) |
| Enterprise | Professional | ✗ (downgrade prohibited) |
| Same edition, new dates | Same | ✓ (renewal) |

### 8.3 Downgrade Handling (If License Is Replaced with Lower Edition)

On next startup:
1. Rust validates the new license.
2. The API sidecar receives the new, restricted feature set.
3. If existing user count exceeds new `maxUsers`:
   - Existing users remain active.
   - New account creation is blocked until count drops below limit.
   - UI shows warning: "لقد تجاوزت الحد الأقصى لعدد المستخدمين المسموح به في نسختك الحالية."
4. If encrypted database was in use and new license doesn't include it:
   - App starts but cannot read the encrypted DB.
   - Shows error: "قاعدة البيانات مشفرة وتتطلب نسخة انتربرايز."
   - User must purchase Enterprise or migrate data to an unencrypted database.
5. Locked features become unavailable at API level.
6. Data created while using higher edition remains intact (read-only for gated features).

---

## 9. Lost License Recovery

### 9.1 Scenario

User has a valid license file but loses it (disk failure, accidental deletion, moves to a new machine).

### 9.2 Recovery Process

```
1. User visits https://license.tuari.app/recover
2. Enters their email address
3. Receives a recovery link (one-time use, expires in 1 hour)
4. Clicks link → downloads a recovery license file: license-recovery.lic
5. User opens Tuari → Settings → Licensing → Recover License
6. File picker → selects license-recovery.lic
7. Rust validates the file (same signature as regular license)
8. Recovery file contains identical payload to the original license
9. Rust writes it to <app_data>/Tuari/license.lic
10. Success
```

### 9.3 Rate Limiting

- Maximum 3 recovery requests per email per 24 hours.
- Tracked server-side on the license portal.
- The recovery download link expires 1 hour after issuance.

---

## 10. Offline Activation via Signed Response

### 10.1 Problem

Some users' Tuari machine has no internet access. They cannot download a `license.lic` file directly.

### 10.2 Activation Flow

```
OFFLINE MACHINE (Tuari)                    INTERNET-ACCESSIBLE DEVICE
│                                                 │
├── Tuari shows "Activation Request Code"         │
│   ┌──────────────────────┐                      │
│   │ رمز طلب التفعيل:      │                      │
│   │ ARQ-a1b2c3d4e5f6     │                      │
│   └──────────────────────┘                      │
│                                                 │
│   User writes down the code                     │
│   ─────────────────────────────────────────────→│
│                                                 ├── Visit license.tuari.app/activate
│                                                 ├── Enter code + login
│                                                 ├── License server validates code
│                                                 ├── Generates activation-response.lic
│                                                 │   (signed on server)
│                                                 ├── User downloads to USB
│   ←─────────────────────────────────────────────│
│                                                 │
├── User inserts USB, opens license activation    │
├── Picks activation-response.lic                 │
├── Rust validates signature                      │
├── Extracts embedded license payload             │
├── Writes license.lic to disk                    │
└── App restarts with full access                 │
```

### 10.3 Activation Request Code Format

The code is a Base64url-encoded JSON structure signed by an ephemeral key:

```json
{
  "type": "activation_request",
  "machineId": "sha256-of-machine-fingerprint",
  "createdAt": "2026-07-01T12:00:00Z",
  "nonce": "random-16-bytes-base64"
}
```

The code is displayed as: `ARQ-<base64url(payload_signature[:8])>` — a human-writable short token.

### 10.4 Security Properties

- The request code is **not** secret knowledge — it's a public one-time token.
- The license server validates that the code hasn't been used before (deduplication on the server side, since the server is online).
- The activation response is signed with the same Ed25519 signing key as regular licenses.
- The response payload includes the original license payload, so validation is identical to standard license activation.

---

## 11. License Replacement / Transfer

### 11.1 License Replacement

When a customer gets a new license (upgrade, renewal, correction):
- Simply overwrite `license.lic` on disk via the activation flow.
- Rust validates the new file on startup.
- Old features are replaced by new features.

### 11.2 License Transfer to New Machine

**All licenses are machine-independent** (bound to the customer, not hardware):
- Copy `license.lic` to the new machine's `<app_data>/Tuari/` directory.
- No deactivation of the old machine required.
- License agreement prohibits using the same license on multiple machines simultaneously.

### 11.3 Anti-Abuse for Transfers

Since there's no phone-home, we cannot prevent the same license file from being used on multiple machines simultaneously. Mitigations:

| Mitigation | Effectiveness |
|-----------|--------------|
| **Honor system** — license agreement prohibits sharing | Low (legal only) |
| **License watermarks** — customer name displayed in UI | Medium (deters casual sharing) |
| **Future server mode** — concurrent seat enforcement | High (for Professional/Enterprise LAN deployments) |
| **Revocation** — if abuse is detected via support tickets | Low (reactive) |

This is an accepted trade-off of the offline-first design.

---

## 12. Tamper Resistance Strategy

### 12.1 Defense Layers

| Layer | Protection | Who Bypasses |
|-------|-----------|-------------|
| 1. **License file integrity** | Ed25519 signature on `license.lic` | Cannot forge without private key |
| 2. **Rust binary hardening** | Public key embedded in Rust, stripped symbols, LTO | Requires Rust reverse-engineering |
| 3. **Environment validation** | Rust constructs a clean env for the sidecar; only explicitly allowed vars are passed | Prevents env var injection |
| 4. **Clock tampering resistance** | Monotonic clock tracker with tolerance window | Raises cost of simple clock manipulation |
| 5. **Structured env var contract** | Sidecar reads known env var names with typed values; no raw payload exposure | Prevents license format coupling |
| 6. **API sidecar: dual enforcement** | All gated operations check license features server-side | Patching sidecar required for bypass |
| 7. **Legal** | License agreement, copyright law | Deters organized commercial piracy |

### 12.2 Accepted Attack: Patching the API Sidecar

A skilled cracker can:
1. Locate the bundled `dist/index.cjs` inside the Tauri resources.
2. Edit it to remove or bypass feature checks.
3. Restart the application.

**Why we accept this:**
- The sidecar is just Node.js CommonJS — symbol names are preserved, control flow is readable.
- This is **impossible to prevent** without encrypting the sidecar, which adds enormous complexity (key management for the decryption key creates a circular problem).
- Mitigations are in place for the highest-value gate (Rust-enforced for encrypted DB).
- Business-logic gates (reports, sync, API access) are worth less to a cracker than the database encryption or LAN server mode.

### 12.3 Accepted Attack: Replacing the Licensed Binary

A skilled cracker could:
1. Obtain a legitimate Standard installation.
2. Reverse-engineer the Rust binary to find the public key.
3. Generate their own key pair and sign a forged Professional license.
4. Distribute the forged license + patched binary.

**Why we accept this:**
- This requires significant effort (Rust RE, binary patching).
- The resulting package can be taken down via DMCA.
- Law firms exist that specialize in exactly this.

### 12.4 What We Do NOT Do

| Measure | Why Not |
|---------|---------|
| DRM / rootkit | Unethical, illegal in some jurisdictions, damages reputation |
| Hardware binding | Prevents legitimate transfers, breaks on hardware upgrades, support nightmare |
| JavaScript obfuscation | Adds maintenance cost, not effective against determined crackers, breaks error messages |
| Binary encryption (packers) | False sense of security; packers can be unpacked |
| Phone-home for every startup | Breaks offline-first design principle |

---

## 13. Future Subscription Compatibility

### 13.1 Design for Subscription

The current design supports subscriptions via the `licenseType` field:

| `licenseType` | Behavior |
|--------------|----------|
| `perpetual` | No `validUntil` check, or distant future |
| `subscription` | Must be renewed before `validUntil` |
| `trial` | 30-day trial (also tracked via install-timestamp) |
| `grace` | Post-expiry reduced functionality |

### 13.2 Subscription Flow (Future)

```
1. Customer subscribes on website
2. License server generates license.lic with validUntil = 1 year from now
3. Customer downloads and installs
4. Every startup: license is valid until validUntil
5. Warning phase (30 days before): banner shows "تنتهي اشتراكك في N يوم"
6. Expired grace (30 days after): read-only mode
7. Locked (30+ days after): full-screen renewal prompt
8. Customer renews → downloads new license.lic → overwrites → app unlocks
```

### 13.3 No Online Validation Required

The subscription model works **without any runtime phone-home**. The license file itself contains the validity period. We accept the risk of a user continuing to use an expired subscription without renewing. This is a deliberate trade-off for offline-first design.

---

## 14. Security Considerations

### 14.1 Private Key Protection Summary

| Layer | Mitigation |
|-------|-----------|
| Storage | Hardware security module (YubiKey PIV) |
| Access | Dual-control, PIN-protected |
| Network | Air-gapped machine |
| Audit | All signing operations logged |
| Rotation | Emergency rotation procedure documented |

### 14.2 Sidecar Environment Injection

Rust passes license information to the Node.js sidecar via **structured environment variables** — never the raw signed payload. An attacker with local process access could:
1. Read `TUARI_LICENSE_EDITION` etc. from the sidecar's `/proc/<pid>/environ`.
2. Modify the values and restart the sidecar independently.

**Mitigations:**
- The env vars contain only the **minimum necessary information** (edition, feature list, max users, customer name). The raw signed payload is never exposed.
- Even if an attacker modifies the env vars, the **Rust-enforced gate** (encrypted database) cannot be bypassed — Rust controls whether `APP_DB_KEY` is present.
- If the sidecar is restarted independently (without the Rust shell), it lacks all `TUARI_LICENSE_*` env vars and the API starts in a degraded mode, rejecting all gated operations.
- The structured env vars define the **stable Rust ↔ Hono interface** (Section 15.5). The license format can evolve without changing this contract.

### 14.3 Clock Tampering

| Attack | Detectable? | Mitigation |
|--------|-------------|-----------|
| Set clock back before trial expires | Yes (monotonic tracker) | Uses estimated time instead of wall clock |
| Set clock forward to bypass validFrom | Yes (validFrom check) | N/A — validFrom prevents early access |
| Pause the system clock entirely | Partially (monotonic clock stops) | We don't detect paused clocks. Accept. |
| Delete clock-tracker.json | Partially (file can be recreated) | Tracker is recreated with current wall time, losing history |

### 14.4 Grace Period Reset Abuse

A user could delete the `install-timestamp` file to reset the 30-day grace period.

**Mitigation:** Store the timestamp in `<app_data>/runtime/state/`, which persists across reinstalls. We accept that a determined user can delete the state directory. This is a deliberate trade-off — the grace period is for evaluation, not security.

### 14.5 Operation-Count-Based Trial Hardening (Future Enhancement)

For v2 or v3, add a secondary limit:
- Trial mode limited to N operations (e.g., 50 employee records, 20 invoices).
- Operation counts tracked in the database.
- Even if the time trial is reset, the operation limit persists.
- Cleanly complements the time-based limit.

---

## 15. Implementation Architecture

### 15.1 LicenseManager — Central Licensing Service (Rust)

All licensing logic lives in a single `LicenseManager` struct. No other component reads license files, verifies signatures, or evaluates feature state. This is the single source of truth.

```rust
// apps/desktop/src-tauri/src/license.rs

pub struct LicenseManager {
    /// Validated license info (None = no valid license, grace mode)
    license: Mutex<Option<LicenseInfo>>,
    /// Clock tracker for tamper detection
    clock: ClockTracker,
    /// Trusted Ed25519 public keys (primary + any rotation certificates)
    trusted_keys: Vec<VerifyingKey>,
}

impl LicenseManager {
    /// Load or validate license on startup. Returns status.
    pub fn initialize(data_dir: &Path) -> Result<Self, LicenseError>;

    /// Activate a new license file. Validates signature, replaces existing.
    pub fn activate(&self, license_content: &str) -> Result<ActivationResult, LicenseError>;

    // --- Stable Rust ↔ Hono Interface (Section 15.5) ---

    /// Current edition ("standard", "professional", "enterprise")
    pub fn edition(&self) -> &str;

    /// Check if a specific feature is licensed
    pub fn has_feature(&self, feature: LicensedFeature) -> bool;

    /// Maximum number of user accounts (0 = unlimited)
    pub fn max_users(&self) -> u32;

    /// Customer information (name + email)
    pub fn customer(&self) -> Option<CustomerInfo>;

    /// License expiry timestamp, or None for perpetual
    pub fn expires_at(&self) -> Option<DateTime<Utc>>;

    /// Current license status
    pub fn status(&self) -> LicenseStatus;

    /// Remaining days until expiry (negative = expired)
    pub fn days_remaining(&self) -> i64;

    // --- Internal ---

    fn verify_signature(&self, payload: &[u8], signature: &[u8]) -> bool;
    fn check_grace_period(&self) -> GraceResult;
    fn load_rotation_certificates(&self, data_dir: &Path);

    /// Serialize license state to environment variables for the sidecar
    pub fn to_env_map(&self) -> HashMap<String, String>;
}
```

**Design rules:**
- `LicenseManager` is the **only** Rust struct that touches `license.lic` or `key-rotation-*.json` files.
- The Tauri commands (`activate_license`, `get_license_status`) delegate to `LicenseManager`.
- The startup flow creates `LicenseManager`, calls `initialize()`, then calls `to_env_map()` to prepare sidecar env vars.
- No other Rust module imports Ed25519 types or license schemas.

### 15.2 Component Allocation

| Component | Location | Language | File(s) |
|-----------|----------|----------|---------|
| License file I/O | `apps/desktop/src-tauri/src/` | Rust | `license.rs` (new) |
| Ed25519 signature verification | `apps/desktop/src-tauri/src/` | Rust | `license.rs` |
| Public key embedding | `apps/desktop/src-tauri/src/` | Rust | `license.rs` (build-time const) |
| Key rotation certificate loading | `apps/desktop/src-tauri/src/` | Rust | `license.rs` |
| Clock consistency tracking | `apps/desktop/src-tauri/src/` | Rust | `clock.rs` (new) |
| License activation Tauri command | `apps/desktop/src-tauri/src/` | Rust | `lib.rs` (extend) |
| Grace period logic | `apps/desktop/src-tauri/src/` | Rust | `license.rs` |
| Feature gating helpers (API) | `apps/api/src/infrastructure/` | TypeScript | `license.ts` (new) |
| Feature gating middleware | `apps/api/src/rpc/` | TypeScript | `rpc-middleware.ts` (extend) |
| Session feature list | `apps/api/src/modules/session/` | TypeScript | `session.service.ts` (extend) |
| License activation UI | `apps/web/src/features/license/` | TypeScript/React | New feature directory |
| License display/settings | `apps/web/src/features/app-shell/` | TypeScript/React | `settings-section.tsx` (extend) |
| Shared license types | `packages/contracts/src/` | TypeScript | `license.ts` (new) |
| License generation CLI tool | `scripts/` | TypeScript | `generate-license.mjs` (new) |

### 15.3 New Dependencies

**Rust (Cargo.toml):**
```toml
ed25519-dalek = { version = "2", features = ["pkcs8"] }
base64 = "0.22"
chrono = { version = "0.4", features = ["serde"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**TypeScript (packages/contracts):**
```json
{
  "dependencies": {
    "zod": "^4.0.5"  // already present
  }
}
```
No new JS dependencies. Zod schemas extend what already exists.

### 15.4 New File Manifest

| File | Purpose |
|------|---------|
| `apps/desktop/src-tauri/src/license.rs` | License validation, key embedding, grace period, key rotation |
| `apps/desktop/src-tauri/src/clock.rs` | Monotonic clock tracker, clock consistency checks |
| `apps/api/src/infrastructure/license.ts` | Feature gate helpers, license payload parser, env var reader |
| `packages/contracts/src/license.ts` | Zod schemas: `licensePayloadSchema`, `editionSchema`, `featureEnum`, etc. |
| `apps/web/src/features/license/activation-page.tsx` | License activation UI (file picker + activate command) |
| `apps/web/src/features/license/license-settings.tsx` | License info display, upgrade CTA, expiry countdown |
| `scripts/generate-license.mjs` | CLI tool for license generation (for internal use) |

### 15.5 Stable Rust ↔ Hono Interface (the Public Contract)

Rust exposes license information to the Node.js sidecar through **structured environment variables**. These variables define the stable contract. The license file format can evolve independently — only this interface needs to remain backward-compatible.

| Environment Variable | Type | Example | Source in Rust |
|---------------------|------|---------|----------------|
| `TUARI_LICENSE_EDITION` | string | `"professional"` | `license_manager.edition()` |
| `TUARI_LICENSE_FEATURES` | comma-separated | `"lan_server,multi_user"` | `license_manager.features_csv()` |
| `TUARI_LICENSE_MAX_USERS` | integer string | `"10"` | `license_manager.max_users().to_string()` |
| `TUARI_LICENSE_CUSTOMER` | JSON string | `{"name":"Acme","email":"a@b.com"}` | `license_manager.customer_json()` |
| `TUARI_LICENSE_EXPIRES_AT` | ISO 8601 or empty | `"2027-07-01T00:00:00Z"` or `""` | `license_manager.expires_at()` |
| `TUARI_LICENSE_STATUS` | string | `"active"`, `"trial"`, `"expired"`, `"grace"` | `license_manager.status().as_str()` |

**Rules for this interface:**
1. **Read-only from TypeScript.** The sidecar reads these env vars on startup and caches them. It never writes back.
2. **No raw license data.** The signed payload and cryptographic signature are never exposed outside Rust.
3. **Subject to semantic versioning.** Changes to this interface require a major version bump.
4. **Backward compatibility.** New env vars may be added; existing ones must not be removed or have their semantics changed without a deprecation period.
5. **Validation on the Hono side.** The sidecar validates that env vars match their expected types/schemas on startup.

```typescript
// TypeScript side — reads the interface, never touches license.lic or Ed25519
interface LicenseInfo {
  edition: 'standard' | 'professional' | 'enterprise';
  features: string[];
  maxUsers: number;
  customer: { name: string; email: string } | null;
  expiresAt: string | null;  // ISO 8601 or null for perpetual
  status: 'active' | 'trial' | 'grace' | 'expired' | 'inactive' | 'suspicious' | 'unknown';
}

function getLicenseInfo(): LicenseInfo {
  return {
    edition: (process.env.TUARI_LICENSE_EDITION ?? 'standard') as LicenseInfo['edition'],
    features: (process.env.TUARI_LICENSE_FEATURES ?? '').split(',').filter(Boolean),
    maxUsers: parseInt(process.env.TUARI_LICENSE_MAX_USERS ?? '0', 10),
    customer: process.env.TUARI_LICENSE_CUSTOMER
      ? JSON.parse(process.env.TUARI_LICENSE_CUSTOMER)
      : null,
    expiresAt: process.env.TUARI_LICENSE_EXPIRES_AT || null,
    // Fail CLOSED: the shell omits the whole license env block when license
    // initialization fails, so a missing/blank status must NOT be a writable
    // trial. Unrecognised values are coerced to 'unknown' too.
    status: parseLicenseStatus(process.env.TUARI_LICENSE_STATUS),
  };
}
```

### 15.6 Build-Time Key Embedding

**Approach:** Build-time constant (Approach A from earlier discussion).

```rust
// apps/desktop/src-tauri/src/license.rs
/// Ed25519 public key for license verification.
/// This is a PUBLIC key — designed to be visible.
/// The corresponding private key is air-gapped.
/// For release builds, this is replaced by CI with the production key.
#[cfg(debug_assertions)]
const PUBLIC_KEY: &[u8; 32] = &[
    // Development/test key (32 bytes)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

#[cfg(not(debug_assertions))]
const PUBLIC_KEY: &[u8; 32] = include_bytes!("../keys/production-public-key.bin");
```

The production public key file (`keys/production-public-key.bin`) is generated during CI and is **not** committed to the source repository. The dev key is printed during CI or manually generated once.

### 15.7 License Generation CLI

```bash
# Generate a license file (internal tool, requires private key)
./scripts/generate-license.mjs \
  --private-key ./keys/private.pem \
  --edition professional \
  --issued-to "Acme Construction SARL" \
  --email "contact@acme.dz" \
  --valid-until "2027-07-01" \
  --max-users 10 \
  --output ./license.lic
```

This tool is internal-only, not shipped to customers. It produces the signed `.lic` file.

---

## 16. Appendices

### A. Open Questions (Deferred)

| Question | Decision | Reason |
|----------|----------|--------|
| Should trial be time-limited or operation-limited? | **Time-limited for v1** | Simpler to implement. Operation-limited is a v2 enhancement. |
| Hardware binding? | **No** | Support nightmare, blocks legitimate transfers. |
| USB dongle for Enterprise? | **No** | Overengineering. Unlikely to add meaningful protection. |
| Self-checksum for Rust binary? | **No** | Complicates updates, adds little value against determined crackers. |

### B. Future Enhancements Roadmap

| Feature | Version | Description |
|---------|---------|-------------|
| Operation-count trial limits | v2 | In addition to time limit |
| Usage analytics (opt-in) | v2 | Anonymous feature usage stats |
| Floating licenses (concurrent seat) | v2 | LAN server tracks active sessions |
| Subscription auto-renewal check | v3 | Optional periodic check against license server |
| Offline activation hardening | v3 | Rate-limit activation code generation |

### C. Glossary

| Term | Definition |
|------|------------|
| License file | Signed `.lic` file on disk containing edition, features, expiry |
| Activation | Process of validating and installing a license file |
| Grace period | 30-day window after install without a license |
| Rust-enforced | Feature gate that cannot be bypassed by modifying the Node.js sidecar |
| API-enforced | Feature gate in the Hono API sidecar |
| UI-only gating | Frontend hides/shows elements based on license; no security value |
| Rotation certificate | Signed document authorizing a new Ed25519 public key |
| Clock tracker | File recording last-seen wall clock time and monotonic counter |

---

## 17. Architecture Decision Record — Licensing in Rust

### ADR-LIC-001 — Licensing Authority Lives in the Rust Shell

**Status:** Accepted
**Date:** 2026-06-30

#### Context

The Tuari application needs an offline licensing system that enforces edition-based feature gating. The architecture has three execution contexts: the Rust Tauri shell (native), the Node.js Hono API sidecar (semi-trusted), and the WebView renderer (untrusted). The question is: in which layer should the licensing authority (signature verification, feature evaluation, expiry enforcement) reside?

#### Options Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: TypeScript (Hono sidecar)** | License validation and feature gating entirely in Node.js | Easier to implement, same language as business logic | Trivially bypassable (JS is readable), license format exposed to patching, public key embedded in JS is trivially replaceable |
| **B: Rust shell only** | All licensing in Rust; sidecar receives only parsed feature flags | Strong IP protection, binary patching required for bypass, license format hidden from JS | Requires a Rust ↔ Node.js interface (env vars), some gate complexity in Rust |
| **C: Hybrid (Rust + Hono)** | Signature verification and critical gates in Rust; business-logic gates in Hono | Best defense-in-depth, pragmatically separates concerns | Two enforcement layers increase complexity, some gates duplicated |

#### Decision

**Option B (Rust shell only for authority), with C's approach for non-critical gates (selected as the pragmatic implementation).**

Specifically:
- All **cryptographic operations** (Ed25519 verification, key rotation) live exclusively in Rust.
- All **license file I/O** (`license.lic` reading/writing) lives exclusively in Rust.
- The **`LicenseManager`** struct in Rust is the single source of truth for license state.
- The API sidecar receives only **structured feature flags** via environment variables (the Rust ↔ Hono interface, Section 15.5). It never sees the raw signed payload or public key.
- Business-logic feature gates (reports, API access, etc.) are enforced in the Hono sidecar, because they involve database queries and business context that is impractical to duplicate in Rust.
- **Critical gates** (encrypted database key) are enforced in Rust by controlling the sidecar's environment.

#### Consequences

**Positive:**
- The raw signed license is never visible to JavaScript code, making it significantly harder to forge or modify.
- The license file format can evolve without affecting the API layer (only the Rust ↔ Hono interface is contract).
- Public key replacement requires patching a compiled Rust binary, not editing JavaScript.
- Clock tampering detection benefits from Rust's access to monotonic clock (`std::time::Instant`).

**Negative:**
- Adding Rust dependencies (`ed25519-dalek`, `base64`) increases compile time and binary size (~200 KB).
- The Rust ↔ Hono interface via environment variables is less flexible than an in-process API call would be.
- Some feature gates are duplicated across Rust and TypeScript (required for defense-in-depth).
- Developers need to understand both Rust (for licensing) and TypeScript (for application logic) when working on gated features.

#### Key Insight

> A licensing system in a desktop application is only as strong as the most accessible layer an attacker can modify. By placing the root of trust in the compiled Rust binary and limiting the Node.js sidecar to a read-only, parsed subset of the license, we force an attacker to either (a) reverse-engineer the Rust binary or (b) patch the sidecar — and even then, they cannot enable the encrypted database feature without patching both layers.

The decision is not about preventing piracy entirely (impossible in a client-side application) but about **raising the cost** of bypass to a level that exceeds the value of the software for most attackers.

#### References

- `apps/desktop/src-tauri/src/license.rs` — `LicenseManager` implementation
- `apps/api/src/infrastructure/license.ts` — Hono-side feature gate middleware
- Section 5 (Feature Gating Mechanism) — two-layer enforcement design
- Section 15.5 (Stable Rust ↔ Hono Interface) — the public contract

### Related Documents

| Document | Location |
|----------|----------|
| Licensing PRD | `docs/prd/licensing-prd.md` |
| Rust Core Architecture | `docs/rust-core-architecture.md` |
| Update & Release Architecture | `docs/update-architecture.md` |
| Architecture Decisions | `docs/architecture-decisions.md` |
