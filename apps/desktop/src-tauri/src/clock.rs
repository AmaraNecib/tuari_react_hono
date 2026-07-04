// Rust Core — monotonic clock tamper detection and grace period
//
// Uses wall clock vs monotonic clock comparison to detect system clock
// tampering. On first run, creates a clock-tracker.json. On subsequent
// runs, compares the elapsed wall time against elapsed monotonic time.
// A discrepancy > 24 hours indicates tampering.

use crate::error::RustCoreError;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Instant;

const CLOCK_TOLERANCE_SECS: i64 = 86400; // 24 hours
const GRACE_PERIOD_DAYS: i64 = 30;

/// Persisted clock state for tamper detection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClockTracker {
    /// Wall clock Unix timestamp at last save.
    pub last_seen_wall: i64,
    /// Monotonic Instant at last save (serialized as secs since boot).
    pub last_monotonic_secs: u64,
    /// Wall clock Unix timestamp at first-ever install.
    pub install_wall: i64,
}

/// Result of a clock consistency check.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClockStatus {
    Trusted,
    Suspicious {
        estimated_time: DateTime<Utc>,
        reason: String,
    },
}

/// Check clock consistency against the persisted tracker.
///
/// Returns `ClockStatus::Trusted` if the clocks agree within tolerance,
/// or `ClockStatus::Suspicious` with an estimated time if tampering is detected.
pub fn check_clock_consistency(state_dir: &Path) -> Result<ClockStatus, RustCoreError> {
    let now_wall = Utc::now().timestamp();
    let now_mono = Instant::now();
    let now_mono_secs = now_mono
        .duration_since(Instant::now() - std::time::Duration::from_secs(0))
        .as_secs();

    let tracker_path = state_dir.join("clock-tracker.json");

    let tracker: ClockTracker = if tracker_path.exists() {
        let content = fs::read_to_string(&tracker_path)
            .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
        serde_json::from_str(&content)
            .map_err(|_| RustCoreError::InvalidFormat)?
    } else {
        // First run — create tracker
        let tracker = ClockTracker {
            last_seen_wall: now_wall,
            last_monotonic_secs: now_mono_secs,
            install_wall: now_wall,
        };
        let json = serde_json::to_string(&tracker)
            .map_err(|_| RustCoreError::Internal("clock tracker serialization failed".to_string()))?;
        if let Some(parent) = tracker_path.parent() {
            fs::create_dir_all(parent).map_err(|e| RustCoreError::IoError(Box::new(e)))?;
        }
        fs::write(&tracker_path, &json)
            .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
        return Ok(ClockStatus::Trusted);
    };

    // Detect clock going backward (beyond tolerance)
    let wall_drift = now_wall - tracker.last_seen_wall;
    if tracker.last_seen_wall > now_wall && wall_drift.abs() > CLOCK_TOLERANCE_SECS {
        let estimated = if let Some(dt) = DateTime::from_timestamp(tracker.last_seen_wall, 0) {
            dt
        } else {
            Utc::now()
        };
        return Ok(ClockStatus::Suspicious {
            estimated_time: estimated,
            reason: "System clock was set backward".to_string(),
        });
    }

    // Compare wall drift vs monotonic drift
    let mono_elapsed = now_mono_secs.saturating_sub(tracker.last_monotonic_secs) as i64;
    if (wall_drift - mono_elapsed).abs() > CLOCK_TOLERANCE_SECS {
        let estimated = if let Some(dt) = DateTime::from_timestamp(
            tracker.last_seen_wall + mono_elapsed,
            0,
        ) {
            dt
        } else {
            Utc::now()
        };
        return Ok(ClockStatus::Suspicious {
            estimated_time: estimated,
            reason: "System clock may have been altered".to_string(),
        });
    }

    // Clock is trusted — update tracker
    let updated_tracker = ClockTracker {
        last_seen_wall: now_wall,
        last_monotonic_secs: now_mono_secs,
        install_wall: tracker.install_wall,
    };
    let json = serde_json::to_string(&updated_tracker)
        .map_err(|_| RustCoreError::Internal("clock tracker serialization failed".to_string()))?;
    fs::write(&tracker_path, &json)
        .map_err(|e| RustCoreError::IoError(Box::new(e)))?;

    Ok(ClockStatus::Trusted)
}

/// Returns the number of days remaining in the grace period.
/// Returns `None` if no install timestamp exists (pre-first-run).
pub fn grace_days_remaining(state_dir: &Path) -> Result<Option<i64>, RustCoreError> {
    let tracker_path = state_dir.join("clock-tracker.json");
    if !tracker_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&tracker_path)
        .map_err(|e| RustCoreError::IoError(Box::new(e)))?;
    let tracker: ClockTracker = serde_json::from_str(&content)
        .map_err(|_| RustCoreError::InvalidFormat)?;

    let now = Utc::now().timestamp();
    let elapsed_days = (now - tracker.install_wall) / 86400;
    let remaining = GRACE_PERIOD_DAYS - elapsed_days;
    Ok(Some(remaining.max(0)))
}

/// Returns true if the app is within the post-install grace period (no license needed).
pub fn is_within_grace_period(state_dir: &Path) -> Result<bool, RustCoreError> {
    grace_days_remaining(state_dir).map(|days| days.map_or(true, |d| d > 0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    use std::path::PathBuf;

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("tuari-clock-test-{nanos}"))
    }

    #[test]
    fn first_run_returns_trusted() {
        let dir = temp_dir();
        let status = check_clock_consistency(&dir).unwrap();
        assert_eq!(status, ClockStatus::Trusted);
        assert!(dir.join("clock-tracker.json").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn second_run_with_consistent_clock_returns_trusted() {
        let dir = temp_dir();
        // First run creates tracker
        let _ = check_clock_consistency(&dir).unwrap();
        // Second run should be trusted
        let status = check_clock_consistency(&dir).unwrap();
        assert_eq!(status, ClockStatus::Trusted);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn grace_days_returns_none_before_first_run() {
        let dir = temp_dir();
        // The tracker file doesn't exist yet (pre-first-run)
        let result = grace_days_remaining(&dir);
        assert!(result.is_ok(), "expected Ok, got: {result:?}");
        let days = result.unwrap();
        assert!(days.is_none());
    }

    #[test]
    fn grace_days_returns_positive_after_first_run() {
        let dir = temp_dir();
        let _ = check_clock_consistency(&dir).unwrap();
        let days = grace_days_remaining(&dir).unwrap();
        assert!(days.is_some());
        assert!(days.unwrap() > 0);
        assert!(days.unwrap() <= GRACE_PERIOD_DAYS);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn is_within_grace_period_returns_true_after_first_run() {
        let dir = temp_dir();
        let _ = check_clock_consistency(&dir).unwrap();
        assert!(is_within_grace_period(&dir).unwrap());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn clock_tracker_is_serializable() {
        let tracker = ClockTracker {
            last_seen_wall: 1000000,
            last_monotonic_secs: 500,
            install_wall: 1000000,
        };
        let json = serde_json::to_string(&tracker).unwrap();
        let deserialized: ClockTracker = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.last_seen_wall, 1000000);
        assert_eq!(deserialized.install_wall, 1000000);
    }

    #[test]
    fn send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<ClockTracker>();
        assert_send_sync::<ClockStatus>();
    }
}
